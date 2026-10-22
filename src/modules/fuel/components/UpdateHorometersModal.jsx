import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/services/firebase';
import { formatCleanHoro, parseHours, normalizeNodeName, parseHorometerToHours } from '@/utils/formatters';

function UpdateHorometersModal({ tanks = [], refills = [], maintenances = [], customHorometers = {}, onSave, onClose, toast }) {
      const normFn = normalizeNodeName;

      // Inicializar el estado de edición local para todas las plantas
      const [entries, setEntries] = useState(() => {
        const map = {};
        tanks.forEach(t => {
          const sn = normFn(t.lugar);
          const plantKey = t.tag || sn;
          const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
          const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

          const hSur = lastRefill?.horometro ? parseHorometerToHours(lastRefill.horometro) : null;
          const hSurStr = lastRefill?.horometro ? formatCleanHoro(lastRefill.horometro) : '—';
          const fechaSur = lastRefill?.fecha || '—';

          const custom = customHorometers[plantKey] || (t.tag ? customHorometers[t.tag] : null);
          let hAct = null;
          let deltaH = null;

          if (custom) {
            if (custom.horometro_actual != null && !isNaN(custom.horometro_actual)) {
              hAct = parseFloat(custom.horometro_actual);
            }
            if (custom.delta_h != null && !isNaN(custom.delta_h)) {
              deltaH = parseFloat(custom.delta_h);
            }
          }

          if (hAct === null) {
            const mMtto = maintenances.find(m => m.tag ? (t.tag && m.tag === t.tag) : normFn(m.planta).includes(sn));
            if (mMtto && mMtto.horometro_actual != null) {
              hAct = typeof mMtto.horometro_actual === 'number' ? mMtto.horometro_actual : parseHorometerToHours(mMtto.horometro_actual);
            }
            if (hAct === null && t.horometro_actual != null) {
              hAct = typeof t.horometro_actual === 'number' ? t.horometro_actual : parseHorometerToHours(t.horometro_actual);
            }
            if (hAct === null && hSur !== null) {
              hAct = hSur;
            }
          }

          if (deltaH === null) {
            if (hAct !== null && hSur !== null && hAct >= hSur) {
              deltaH = parseFloat((hAct - hSur).toFixed(1));
            } else {
              deltaH = 0;
            }
          } else if (hAct === null && hSur !== null) {
            hAct = parseFloat((hSur + deltaH).toFixed(1));
          }

          map[plantKey] = {
            plantKey,
            tag: t.tag,
            lugar: t.lugar,
            zona: t.zona,
            region: t.region || 'Zulia',
            equipo: t.equipo || t.tag,
            consumoLh: parseFloat(t.consumo_lh) || 10,
            subActual: parseFloat(t.subtanque_actual) || 0,
            reservaLts: parseFloat(t.reserva_lts) || 0,
            hSur,
            hSurStr,
            fechaSur,
            horometro_actual: hAct !== null ? hAct : (hSur !== null ? hSur : ''),
            delta_h: deltaH !== null ? deltaH : 0
          };
        });
        return map;
      });

      const [search, setSearch] = useState('');
      const [regionFilter, setRegionFilter] = useState('all');
      const [zonaFilter, setZonaFilter] = useState('all');

      // Modificación bidireccional desde Horómetro Actual -> calcula Delta H
      const handleHoroActualChange = (key, val) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          const hSur = cur.hSur !== null ? cur.hSur : 0;
          let newDelta = cur.delta_h;
          if (val === '') {
            newDelta = 0;
          } else {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              newDelta = Math.max(0, parseFloat((parsed - hSur).toFixed(1)));
            }
          }
          return {
            ...prev,
            [key]: {
              ...cur,
              horometro_actual: val,
              delta_h: newDelta
            }
          };
        });
      };

      // Modificación bidireccional desde Horas Op. (Delta H) -> calcula Horómetro Actual
      const handleDeltaHChange = (key, val) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          const hSur = cur.hSur !== null ? cur.hSur : 0;
          let newHoro = cur.horometro_actual;
          if (val === '') {
            newHoro = hSur;
          } else {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              newHoro = parseFloat((hSur + parsed).toFixed(1));
            }
          }
          return {
            ...prev,
            [key]: {
              ...cur,
              delta_h: val,
              horometro_actual: newHoro
            }
          };
        });
      };

      // Restablecer planta individual a 0 delta
      const handleResetPlant = (key) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          return {
            ...prev,
            [key]: {
              ...cur,
              delta_h: 0,
              horometro_actual: cur.hSur !== null ? cur.hSur : 0
            }
          };
        });
      };

      // Guardar todos los cambios
      const handleSave = () => {
        const payload = {};
        Object.keys(entries).forEach(k => {
          const e = entries[k];
          const hAct = e.horometro_actual !== '' ? parseFloat(e.horometro_actual) : null;
          const dH = e.delta_h !== '' ? parseFloat(e.delta_h) : 0;
          payload[k] = {
            horometro_actual: !isNaN(hAct) ? hAct : null,
            delta_h: !isNaN(dH) ? dH : 0,
            hSur: e.hSur
          };
        });
        onSave(payload);
        onClose();
      };

      const plantList = Object.values(entries);
      const uniqueZonas = Array.from(new Set(plantList.map(p => p.zona))).filter(Boolean).sort();

      const filteredList = plantList.filter(p => {
        if (regionFilter !== 'all' && (p.region || '').toLowerCase() !== regionFilter.toLowerCase()) return false;
        if (zonaFilter !== 'all' && p.zona !== zonaFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!p.lugar.toLowerCase().includes(q) && !(p.tag || '').toLowerCase().includes(q) && !(p.zona || '').toLowerCase().includes(q)) {
            return false;
          }
        }
        return true;
      });

      const totalModificadas = plantList.filter(p => (parseFloat(p.delta_h) || 0) > 0).length;

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card fin" style={{ width: '96%', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0166ff 0%, #21c0fa 100%)', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                  Actualización Rápida de Horómetros & Horas de Operación
                </h3>
                <p style={{ fontSize: '.82rem', color: 'var(--tx3)', margin: '6px 0 0', maxWidth: 780 }}>
                  Ingresa manualmente el <strong>Horómetro Actual</strong> o las <strong>Horas Trabajadas (Delta H)</strong> de cada planta. El cálculo es bidireccional y recalcula el combustible consumido y la autonomía en tiempo real.
                </p>
              </div>
              <button
                type="button"
                className="bs"
                onClick={onClose}
                style={{ padding: '6px 12px', fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
                title="Cerrar ventana"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Cerrar
              </button>
            </div>

            {/* Filtros Rápidos */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <input
                  type="text"
                  className="fi"
                  placeholder="Buscar nodo, tag de planta o zona..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '.82rem' }}
                />
              </div>
              <div>
                <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '.82rem' }}>
                  <option value="all">Todas las Regiones</option>
                  <option value="zulia">Zulia</option>
                  <option value="falcon">Falcón</option>
                </select>
              </div>
              <div>
                <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '.82rem' }}>
                  <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                  {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx3)', display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                <span>Mostrando: <strong style={{ color: 'var(--tx1)' }}>{filteredList.length}</strong> plantas</span>
                <span>•</span>
                <span style={{ color: '#f59e0b' }}>Con Horas Op: <strong>{totalModificadas}</strong></span>
              </div>
            </div>

            {/* Tabla Editable */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.82rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-elevated)' }}>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.68rem', letterSpacing: '.05em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '10px 14px' }}>Lugar / Nodo</th>
                    <th style={{ padding: '10px 12px' }}>Planta & Tag</th>
                    <th style={{ padding: '10px 12px' }}>Último Surtido</th>
                    <th style={{ padding: '10px 12px', width: 140 }}>Horómetro Actual</th>
                    <th style={{ padding: '10px 12px', width: 130, textAlign: 'center' }}>Horas Op. (Δh)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Consumo Est.</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gasoil Neto</th>
                    <th style={{ padding: '10px 12px' }}>Autonomía</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((p, idx) => {
                    const deltaHNum = parseFloat(p.delta_h) || 0;
                    const consumoEst = Math.round(deltaHNum * p.consumoLh);
                    const stockTotal = p.subActual + p.reservaLts;
                    const stockNeto = Math.max(0, Math.round(stockTotal - consumoEst));
                    const autNetoH = p.consumoLh > 0 ? parseFloat((stockNeto / p.consumoLh).toFixed(1)) : 0;
                    const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));
                    const isCrit = diasAutNeto < 1.5;
                    const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
                    const badgeColor = isCrit ? '#ef4444' : (isAlert ? '#f59e0b' : '#10b981');
                    const badgeBg = isCrit ? 'rgba(239,68,68,0.12)' : (isAlert ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: (idx % 2 === 0) ? 'var(--bg-card)' : 'transparent' }}>
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.84rem' }}>{p.lugar}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)' }}>{p.zona}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.78rem' }}>{p.tag}</div>
                          <div style={{ fontSize: '.66rem', color: 'var(--tx3)' }}>{p.consumoLh} L/h</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: '.76rem' }}>{p.fechaSur}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {p.hSurStr}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              step="0.1"
                              className="fi fm"
                              value={p.horometro_actual}
                              onChange={e => handleHoroActualChange(p.plantKey, e.target.value)}
                              placeholder={p.hSur !== null ? p.hSur : '0'}
                              style={{
                                width: 88,
                                padding: '4px 6px',
                                fontSize: '.8rem',
                                fontWeight: 700,
                                color: 'var(--blue)',
                                textAlign: 'right'
                              }}
                              title="Ingresa el horómetro actual (calcula Delta H automáticamente)"
                            />
                            <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '.76rem', fontWeight: 800, color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)' }}>+</span>
                            <input
                              type="number"
                              step="0.1"
                              className="fi fm"
                              value={p.delta_h}
                              onChange={e => handleDeltaHChange(p.plantKey, e.target.value)}
                              placeholder="0.0"
                              style={{
                                width: 66,
                                padding: '4px 6px',
                                fontSize: '.8rem',
                                fontWeight: 800,
                                textAlign: 'center',
                                color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)',
                                background: deltaHNum > 20 ? 'rgba(245, 158, 11, 0.15)' : undefined,
                                borderColor: deltaHNum > 20 ? 'rgba(245, 158, 11, 0.45)' : undefined
                              }}
                              title="Ingresa horas acumuladas post-surtido (calcula horómetro actual)"
                            />
                            <span style={{ fontSize: '.7rem', fontWeight: 700, color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)' }}>h</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontWeight: 700, color: consumoEst > 0 ? '#ef4444' : 'var(--tx3)', fontSize: '.8rem' }}>
                            {consumoEst > 0 ? `~${consumoEst} L` : '0 L'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: '.84rem' }}>
                            {stockNeto.toLocaleString()} L
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: '.72rem', fontWeight: 800, background: badgeBg, color: badgeColor }}>
                            {diasAutNeto} Días ({autNetoH}h)
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="bs"
                            onClick={() => handleResetPlant(p.plantKey)}
                            style={{ padding: '3px 8px', fontSize: '.68rem', opacity: deltaHNum > 0 ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Restablecer horas acumuladas a 0"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                            Reset
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: '.76rem', color: 'var(--tx3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--blue)', flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Al ingresar el horómetro actual o las horas acumuladas, ambos se calculan automáticamente y se actualizan en reportes, WhatsApp y descargas de Excel.</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="bs" onClick={onClose} style={{ padding: '8px 16px', fontSize: '.84rem' }}>
                  Cancelar
                </button>
                <button className="bp" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '.84rem' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Guardar Horómetros
                </button>
              </div>
            </div>

          </div>
        </div>
      );
    }

export { UpdateHorometersModal };
export default UpdateHorometersModal;
