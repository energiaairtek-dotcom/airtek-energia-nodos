import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/services/firebase';
import { normalizeNodeName, parseHours } from '@/utils/formatters';
import { computeDispatchLevels, validateDispatch } from '@/modules/fuel/fuelCalc';
import { useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { generateFuelReportText } from '@/modules/fuel/fuelUtils';
import { IconCopy } from '@/components/icons';

function NewFuelRefillModal({ tanks, userProfile, preselectedPlant, onSave, onClose, toast }) {
      const initialTank = useMemo(() => {
        if (preselectedPlant) {
          return tanks.find(t => t.id === preselectedPlant.id || (preselectedPlant.tag && t.tag === preselectedPlant.tag)) ||
                 tanks.find(t => t.lugar === preselectedPlant.lugar) ||
                 tanks[0];
        }
        return tanks[0];
      }, [preselectedPlant, tanks]);

      const [selectedTankId, setSelectedTankId] = useState(() => initialTank?.id || tanks[0]?.id || '');
      const [lugar, setLugar] = useState(() => initialTank?.lugar || tanks[0]?.lugar || '');
      const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
      const [semana, setSemana] = useState('Semana Actual');
      const isInitialDirect = (parseFloat(initialTank?.cap_reserva_lts || initialTank?.cap_reserva) || 0) === 0;
      const [destino, setDestino] = useState(() => isInitialDirect ? 'Surtido Planta' : 'Surtido Reserva');
      const [litros, setLitros] = useState('');
      const [litrosPlanta, setLitrosPlanta] = useState('');
      const [litrosReserva, setLitrosReserva] = useState('');
      const [horometro, setHorometro] = useState('');
      const [horasTrabajo, setHorasTrabajo] = useState('');

      const staffList = useAuthorizedStaff(userProfile);
      const [tecnico, setTecnico] = useState(() => userProfile?.name || staffList[0] || 'Cuadrilla Grupos Electrógenos');
      const [isCustomTecnico, setIsCustomTecnico] = useState(false);
      const [obs, setObs] = useState('');
      const [savedReport, setSavedReport] = useState(null);

      const selTank = tanks.find(t => t.id === selectedTankId) || tanks.find(t => t.lugar === lugar) || tanks[0];
      const normSelLugar = normalizeNodeName(selTank?.lugar);
      const sisterTanks = tanks.filter(t => normalizeNodeName(t.lugar) === normSelLugar);
      const subCap = parseFloat(selTank?.tanque_lts) || 0;
      const resCap = sisterTanks.reduce((m, t) => Math.max(m, parseFloat(t.cap_reserva_lts != null ? t.cap_reserva_lts : t.cap_reserva) || 0), 0);
      const rawSub = parseFloat(selTank?.subtanque_actual != null ? selTank.subtanque_actual : selTank?.tanque_lts) || 0;
      const curSub = subCap > 0 ? Math.min(subCap, rawSub) : rawSub;
      const rawRes = sisterTanks.reduce((m, t) => Math.max(m, parseFloat(t.reserva_lts) || 0), 0);
      const curRes = resCap > 0 ? Math.min(resCap, rawRes) : 0;

      // Cálculo puro compartido con el formulario de nodos (src/modules/fuel/fuelCalc.js)
      const { newSub, newRes, newTotal, addedTotal, ltsP, ltsR } = computeDispatchLevels({
        destino,
        litros,
        litrosPlanta,
        litrosReserva,
        curSub,
        curRes,
        subCap,
        resCap,
      });

      const handleSave = () => {
        const validationError = validateDispatch({
          destino,
          litros,
          litrosPlanta,
          litrosReserva,
          curSub,
          curRes,
          subCap,
          resCap,
        });
        if (validationError) {
          alert(validationError);
          return;
        }

        const newRecord = {
          id: 'r_' + Date.now(),
          fecha,
          semana,
          lugar: selTank?.lugar || lugar,
          tag: selTank?.tag || selTank?.equipo || 'PLT-GEN',
          litros: addedTotal,
          litros_planta: ltsP,
          litros_reserva: ltsR,
          destino,
          subtanque_lts: newSub,
          reserva_lts: newRes,
          prev_subtanque_lts: curSub,
          prev_reserva_lts: curRes,
          total_nodo: newTotal,
          horometro: horometro ? (String(horometro).includes('h') || String(horometro).includes(':') ? horometro : `${horometro}h`) : '—',
          horas_trabajo: horasTrabajo ? (String(horasTrabajo).includes('h') ? horasTrabajo : `${horasTrabajo}h`) : '—',
          tecnico: tecnico || 'Cuadrilla Grupos Electrógenos',
          obs
        };

        onSave(newRecord, selTank);

        const msg = generateFuelReportText({
          nodeName: lugar,
          date: fecha,
          record: newRecord,
          tanks: selTank ? [selTank] : []
        });
        setSavedReport(msg);
      };

      if (savedReport) {
        return (
          <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
            <div className="card fin" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 480, padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>¡Surtido Registrado con Éxito!</h3>
                  <p style={{ color: 'var(--tx3)', fontSize: '.78rem', margin: '2px 0 0' }}>Mensaje listo para enviar al grupo de WhatsApp:</p>
                </div>
              </div>

              <textarea
                className="fi fm"
                rows={6}
                readOnly
                value={savedReport}
                style={{ width: '100%', resize: 'none', fontSize: '.88rem', lineHeight: 1.6, background: 'var(--bg-deep)', color: 'var(--tx1)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="bp"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: '.88rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(savedReport).then(() => {
                      if (toast) toast('¡Mensaje copiado para WhatsApp!', 'success');
                      else alert('¡Mensaje copiado para WhatsApp!');
                    });
                  }}
                >
                  <IconCopy size={16} /> Copiar Mensaje para WhatsApp
                </button>
                <button className="bs" onClick={onClose} style={{ padding: '10px 18px', fontSize: '.88rem' }}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease' }} onClick={onClose}>
          <div className="card fin" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 540, padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 className="fd" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                  Registrar Surtido de Combustible
                </h3>
                <p style={{ color: 'var(--tx3)', fontSize: '.74rem', margin: '3px 0 0' }}>
                  Despacho físico real. Para calibrar niveles que no cuadran con la vara, usa <strong>Ajustar</strong>.
                </p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Lugar / Generador</label>
                <select
                  className="fi"
                  value={selTank?.id || ''}
                  onChange={e => {
                    const chosen = tanks.find(t => t.id === e.target.value);
                    if (chosen) {
                      setSelectedTankId(chosen.id);
                      setLugar(chosen.lugar);
                      const noRes = (parseFloat(chosen.cap_reserva_lts || chosen.cap_reserva) || 0) === 0;
                      if (noRes) setDestino('Surtido Planta');
                    }
                  }}
                >
                  {tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.lugar} — {t.tag} ({t.equipo || `${t.kva} kVA`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl">Destino del Combustible</label>
                <select className="fi" value={destino} onChange={e => setDestino(e.target.value)}>
                  {resCap === 0 ? (
                    <option value="Surtido Planta">Surtido Directo a Planta ({subCap} L máx)</option>
                  ) : (
                    <>
                      <option value="Surtido Planta">Surtido a Planta (descuenta de la reserva compartida - {subCap} L máx)</option>
                      <option value="Surtido Externo Planta">Surtido Externo a Planta (Cisterna directo a Planta - {subCap} L máx)</option>
                      <option value="Surtido Reserva">Surtido a Reserva (Cisterna a Tanque Reserva - {resCap} L máx)</option>
                      <option value="Surtido Planta y Reserva">Surtido Mixto (Cisterna a Planta y Reserva)</option>
                      <option value="Trasiego Interno">Trasiego Interno (De Reserva a Planta - {curRes} L disp.)</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="lbl">Fecha de Surtido</label>
                <input className="fi" type="text" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>

              {destino !== 'Surtido Planta y Reserva' ? (
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">
                    {destino === 'Surtido Reserva' ? 'Litros a Reserva (Lts)' : (destino === 'Trasiego Interno' ? 'Litros a Trasegar a Planta (Lts)' : 'Litros a Planta (Lts)')}
                    {destino === 'Surtido Planta' && (
                      <span style={{ marginLeft: 6, color: 'var(--blue)', fontSize: '.72rem', fontWeight: 600 }}>
                        (Límite tanque planta: {subCap} Lts | Nivel actual: {curSub} Lts)
                      </span>
                    )}
                    {destino === 'Surtido Reserva' && (
                      <span style={{ marginLeft: 6, color: 'var(--blue)', fontSize: '.72rem', fontWeight: 600 }}>
                        (Capacidad reserva: {resCap} Lts | Nivel actual: {curRes} Lts)
                      </span>
                    )}
                    {destino === 'Trasiego Interno' && (
                      <span style={{ marginLeft: 6, color: curRes > 0 ? 'var(--blue)' : '#f55b5d', fontSize: '.72rem', fontWeight: 600 }}>
                        (Disp. en Reserva: {curRes} Lts | Límite Planta: {subCap} Lts)
                      </span>
                    )}
                  </label>
                  <input
                    className="fi fm"
                    type="number"
                    step="any"
                    placeholder="Ej: 100"
                    value={litros}
                    max={destino === 'Trasiego Interno' ? curRes : undefined}
                    onChange={e => setLitros(e.target.value)}
                  />
                  {destino === 'Surtido Planta' && subCap > 0 && ((parseFloat(litros) || 0) + curSub > subCap) && (
                    <div style={{ color: 'var(--blue)', fontSize: '.72rem', marginTop: 3, fontWeight: 600 }}>
                      Nota: El tanque quedará lleno en su capacidad física máxima de {subCap} Lts (tope nominal establecido).
                    </div>
                  )}
                  {destino === 'Surtido Reserva' && resCap > 0 && ((parseFloat(litros) || 0) + curRes > resCap) && (
                    <div style={{ color: 'var(--blue)', fontSize: '.72rem', marginTop: 3, fontWeight: 600 }}>
                      Nota: La reserva quedará llena en su capacidad máxima de {resCap} Lts.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="lbl">Litros a Planta ({subCap} L máx)</label>
                    <input className="fi fm" type="number" step="any" placeholder="Ej: 80" value={litrosPlanta} onChange={e => setLitrosPlanta(e.target.value)} />
                  </div>
                  <div>
                    <label className="lbl">Litros a Reserva ({resCap} L máx)</label>
                    <input className="fi fm" type="number" step="any" placeholder="Ej: 200" value={litrosReserva} onChange={e => setLitrosReserva(e.target.value)} />
                  </div>
                </>
              )}

              <div>
                <label className="lbl">Horómetro Actual de Planta</label>
                <input className="fi fm" type="text" placeholder="Ej: 1450:20 o 1450" value={horometro} onChange={e => setHorometro(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Horas Trabajadas (estimadas)</label>
                <input className="fi fm" type="text" placeholder="Ej: 15.5" value={horasTrabajo} onChange={e => setHorasTrabajo(e.target.value)} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Técnico / Responsable del Despacho</label>
                {!isCustomTecnico ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="fi"
                      style={{ flex: 1 }}
                      value={staffList.includes(tecnico) ? tecnico : (tecnico ? '__custom__' : (staffList[0] || ''))}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomTecnico(true);
                          setTecnico('');
                        } else {
                          setTecnico(e.target.value);
                        }
                      }}
                    >
                      {staffList.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="__custom__">+ Otro (escribir nombre manual)...</option>
                    </select>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="fi"
                      type="text"
                      placeholder="Nombre del técnico responsable..."
                      value={tecnico}
                      onChange={e => setTecnico(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="bs"
                      style={{ padding: '6px 12px', fontSize: '.8rem' }}
                      onClick={() => {
                        setIsCustomTecnico(false);
                        setTecnico(staffList[0] || 'Cuadrilla Grupos Electrógenos');
                      }}
                    >
                      Lista
                    </button>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Observaciones / N° Cisterna o Ticket</label>
                <textarea className="fi" rows={2} placeholder="Detalles del despacho o anomalías..." value={obs} onChange={e => setObs(e.target.value)} />
              </div>

              {/* Indicador en vivo de Litros Totales en el Nodo */}
              <div style={{ gridColumn: '1/-1', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Litros Totales de Combustible en el Nodo
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginTop: 2 }}>
                    Sub-tanque: <strong style={{ color: 'var(--tx1)' }}>{newSub} / {subCap} Lts</strong> | Reserva: <strong style={{ color: 'var(--tx1)' }}>{newRes} {resCap > 0 ? `/ ${resCap}` : ''} Lts</strong>
                    {destino === 'Trasiego Interno' && (
                      <span style={{ marginLeft: 6, color: '#21c0fa', fontSize: '.72rem', fontWeight: 600 }}>(Trasiego: -{parseFloat(litros)||0}L de reserva a planta)</span>
                    )}
                    {destino === 'Surtido Planta y Reserva' && (
                      <span style={{ marginLeft: 6, color: '#8b5cf6', fontSize: '.72rem', fontWeight: 600 }}>(Total despachado: +{addedTotal}L)</span>
                    )}
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--green)' }}>
                  {newTotal} <span style={{ fontSize: '.8rem', fontWeight: 600 }}>Lts</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="bs" onClick={onClose}>Cancelar</button>
              <button className="bp" onClick={handleSave}>Guardar Surtido</button>
            </div>
          </div>
        </div>
      );
    }

export { NewFuelRefillModal };
export default NewFuelRefillModal;
