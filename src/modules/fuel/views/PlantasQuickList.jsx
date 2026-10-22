import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/services/firebase';
import { normalizeNodeName, formatCleanHoro } from '@/utils/formatters';

function PlantasQuickList({ tanks = [], onSelectPlant, onAdjustPlant }) {
      const [filter, setFilter] = useState('');
      const [isCollapsed, setIsCollapsed] = useState(false);
      const [viewMode, setViewMode] = useState('list'); // 'list' (línea por línea) | 'grid' (cuadros)

      const filteredPlants = useMemo(() => {
        if (!filter.trim()) return tanks;
        const q = filter.toLowerCase();
        return tanks.filter(t => 
          (t.tag && t.tag.toLowerCase().includes(q)) ||
          (t.lugar && t.lugar.toLowerCase().includes(q)) ||
          (t.equipo && t.equipo.toLowerCase().includes(q)) ||
          (t.zona && t.zona.toLowerCase().includes(q))
        );
      }, [tanks, filter]);

      return (
        <div className="card fin" style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '16px 18px',
          marginBottom: 18,
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }}>
          {/* Header de la sección */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: isCollapsed ? 0 : 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(1, 102, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--blue)'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                    Plantas Eléctricas & Capacidad de Suministro
                  </h3>
                  <span style={{
                    fontSize: '.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                    background: 'var(--bg-elevated)',
                    color: 'var(--tx2)',
                    border: '1px solid var(--border)'
                  }}>
                    {tanks.length} plantas
                  </span>
                </div>
                <p style={{ color: 'var(--tx3)', fontSize: '.76rem', margin: '2px 0 0' }}>
                  Haz clic en cualquier planta o en los botones de acción para surtir, calibrar niveles o configurar capacidades y horómetro.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Buscador rápido */}
              {!isCollapsed && (
                <div style={{ position: 'relative', width: 200 }}>
                  <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    className="fi"
                    style={{ paddingLeft: 28, height: 32, fontSize: '.78rem', borderRadius: 8 }}
                    type="text"
                    placeholder="Filtrar sede o tag..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                  />
                  {filter && (
                    <button
                      type="button"
                      onClick={() => setFilter('')}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 12, padding: 0 }}
                    >✕</button>
                  )}
                </div>
              )}

              {/* Selector de Vista: Lista línea por línea vs Cuadros */}
              {!isCollapsed && (
                <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '.74rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: viewMode === 'list' ? 'var(--blue)' : 'transparent',
                      color: viewMode === 'list' ? '#fff' : 'var(--tx3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease'
                    }}
                    title="Vista de lista línea por línea (Alta densidad y fácil lectura)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                    Lista
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '.74rem',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: viewMode === 'grid' ? 'var(--blue)' : 'transparent',
                      color: viewMode === 'grid' ? '#fff' : 'var(--tx3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease'
                    }}
                    title="Vista en cuadros / cuadrícula"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    Cuadros
                  </button>
                </div>
              )}

              {/* Botón colapsar / expandir */}
              <button
                type="button"
                className="bs"
                onClick={() => setIsCollapsed(!isCollapsed)}
                style={{ padding: '5px 11px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 8 }}
              >
                <span>{isCollapsed ? 'Mostrar Plantas' : 'Minimizar'}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
            </div>
          </div>

          {/* CONTENIDO SEGÚN MODO DE VISTA */}
          {!isCollapsed && viewMode === 'list' && (
            <div style={{
              maxHeight: 460,
              overflowY: 'auto',
              overflowX: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--bg-elevated)'
            }}>
              <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: '.8rem' }}>
                <thead>
                  <tr style={{
                    background: 'var(--bg-deep)',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    color: 'var(--tx3)',
                    fontSize: '.68rem',
                    fontWeight: 800,
                    letterSpacing: '.05em',
                    textTransform: 'uppercase'
                  }}>
                    <th style={{ padding: '10px 14px' }}>Planta / Sede</th>
                    <th style={{ padding: '10px 12px' }}>Tag / Potencia</th>
                    <th style={{ padding: '10px 12px' }}>Horómetro</th>
                    <th style={{ padding: '10px 12px' }}>Tanque Planta</th>
                    <th style={{ padding: '10px 12px' }}>Reserva</th>
                    <th style={{ padding: '10px 12px' }}>Stock & Autonomía</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlants.map((plant, idx) => {
                    const subCap = parseFloat(plant.tanque_lts) || 0;
                    const resCap = parseFloat(plant.cap_reserva_lts != null ? plant.cap_reserva_lts : plant.cap_reserva) || 0;
                    const rawSub = parseFloat(plant.subtanque_actual != null ? plant.subtanque_actual : plant.tanque_lts) || 0;
                    const subActual = subCap > 0 ? Math.min(subCap, rawSub) : rawSub;
                    const rawRes = parseFloat(plant.reserva_lts) || 0;
                    const resActual = resCap > 0 ? Math.min(resCap, rawRes) : 0;
                    const totalActual = subActual + resActual;
                    const diasAut = parseFloat(plant.dias_aut) || 0;
                    const hasReserve = resCap > 0;

                    let autColor = '#10b981';
                    let autBg = 'rgba(16, 185, 129, 0.12)';
                    if (diasAut < 1.5) {
                      autColor = '#ef4444';
                      autBg = 'rgba(239, 68, 68, 0.12)';
                    } else if (diasAut < 3) {
                      autColor = '#f59e0b';
                      autBg = 'rgba(245, 158, 11, 0.12)';
                    }

                    const pctSub = subCap > 0 ? Math.min(100, Math.round((subActual / subCap) * 100)) : 100;
                    const pctRes = resCap > 0 ? Math.min(100, Math.round((resActual / resCap) * 100)) : 0;

                    return (
                      <tr
                        key={plant.id || plant.tag || idx}
                        onClick={() => onSelectPlant(plant)}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(1, 102, 255, 0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'; }}
                        title={`Hacer clic para surtir en ${plant.lugar}`}
                      >
                        {/* Planta / Sede */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: '.86rem' }}>
                            {plant.lugar}
                          </div>
                          <div style={{ color: 'var(--tx3)', fontSize: '.71rem', marginTop: 1 }}>
                            {plant.equipo && plant.equipo !== plant.lugar ? plant.equipo : (plant.zona || 'Sede Airtek')}
                          </div>
                        </td>

                        {/* Tag / Potencia */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: '.72rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 6,
                              background: 'rgba(1, 102, 255, 0.1)',
                              color: 'var(--blue)',
                              letterSpacing: '.02em'
                            }}>
                              {plant.tag || 'PLT'}
                            </span>
                            {plant.kva && (
                              <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--tx2)' }}>
                                {plant.kva} kVA
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Horómetro */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '.76rem',
                            fontWeight: 700,
                            color: 'var(--tx1)',
                            background: 'var(--bg-deep)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: 'var(--blue)' }}>
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                            {plant.horometro_actual || '—'}
                          </span>
                        </td>

                        {/* Tanque Planta */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div>
                              <div className="fm" style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: '.84rem' }}>
                                {subActual.toLocaleString()} <span style={{ fontSize: '.7rem', fontWeight: 500, color: 'var(--tx3)' }}>/ {subCap} L</span>
                              </div>
                              <div style={{ width: 80, height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${pctSub}%`, height: '100%', background: pctSub < 25 ? '#ef4444' : 'var(--blue)', borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Reserva */}
                        <td style={{ padding: '10px 12px' }}>
                          {hasReserve ? (
                            <div>
                              <div className="fm" style={{ fontWeight: 800, color: resActual > 0 ? 'var(--blue)' : '#ef4444', fontSize: '.84rem' }}>
                                {resActual.toLocaleString()} <span style={{ fontSize: '.7rem', fontWeight: 500, color: 'var(--tx3)' }}>/ {resCap} L</span>
                              </div>
                              <div style={{ width: 80, height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${pctRes}%`, height: '100%', background: pctRes < 20 ? '#ef4444' : '#10b981', borderRadius: 2 }} />
                              </div>
                            </div>
                          ) : (
                            <span style={{
                              fontSize: '.68rem',
                              fontWeight: 700,
                              color: 'var(--tx3)',
                              background: 'var(--bg-deep)',
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px dashed var(--border)'
                            }}>
                              Directo a Planta
                            </span>
                          )}
                        </td>

                        {/* Stock & Autonomía */}
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="fm" style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: '.84rem' }}>
                              {totalActual.toLocaleString()} L
                            </span>
                            <span style={{
                              fontSize: '.68rem',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 10,
                              background: autBg,
                              color: autColor,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: autColor }} />
                              {diasAut > 0 ? `${diasAut} d` : `${plant.aut_total_h || 0} h`}
                            </span>
                          </div>
                        </td>

                        {/* Acciones */}
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              className="bs"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onAdjustPlant) onAdjustPlant(plant);
                              }}
                              style={{
                                padding: '4px 9px',
                                fontSize: '.72rem',
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title="Configurar capacidades, horómetro, niveles o autonomía"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                              </svg>
                              Ajustar
                            </button>
                            <button
                              type="button"
                              className="bp"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPlant(plant);
                              }}
                              style={{
                                padding: '4px 11px',
                                fontSize: '.72rem',
                                borderRadius: 6,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                              </svg>
                              Surtir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* VISTA CUADROS (GRID) */}
          {!isCollapsed && viewMode === 'grid' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
              gap: 12,
              maxHeight: 380,
              overflowY: 'auto',
              paddingRight: 4
            }}>
              {filteredPlants.map(plant => {
                const subCap = parseFloat(plant.tanque_lts) || 0;
                const resCap = parseFloat(plant.cap_reserva_lts != null ? plant.cap_reserva_lts : plant.cap_reserva) || 0;
                const rawSub = parseFloat(plant.subtanque_actual != null ? plant.subtanque_actual : plant.tanque_lts) || 0;
                const subActual = subCap > 0 ? Math.min(subCap, rawSub) : rawSub;
                const rawRes = parseFloat(plant.reserva_lts) || 0;
                const resActual = resCap > 0 ? Math.min(resCap, rawRes) : 0;
                const totalActual = subActual + resActual;
                const diasAut = parseFloat(plant.dias_aut) || 0;

                let autColor = '#10b981';
                let autBg = 'rgba(16, 185, 129, 0.12)';
                if (diasAut < 1.5) {
                  autColor = '#ef4444';
                  autBg = 'rgba(239, 68, 68, 0.12)';
                } else if (diasAut < 3) {
                  autColor = '#f59e0b';
                  autBg = 'rgba(245, 158, 11, 0.12)';
                }

                return (
                  <div
                    key={plant.id || plant.tag}
                    onClick={() => onSelectPlant(plant)}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--blue)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(1, 102, 255, 0.12)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)';
                    }}
                    title={`Hacer clic para registrar surtido en ${plant.lugar} (${plant.tag})`}
                  >
                    <div>
                      {/* Fila superior: Tag, kVA y Autonomía */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: '.72rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 6,
                            background: 'rgba(1, 102, 255, 0.1)',
                            color: 'var(--blue)',
                            letterSpacing: '.03em'
                          }}>
                            {plant.tag || 'PLT'}
                          </span>
                          {plant.kva && (
                            <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--tx3)' }}>
                              {plant.kva} kVA
                            </span>
                          )}
                        </div>

                        <span style={{
                          fontSize: '.68rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: autBg,
                          color: autColor,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: autColor }} />
                          {diasAut > 0 ? `${diasAut} d aut.` : `${plant.aut_total_h || 0} h`}
                        </span>
                      </div>

                      {/* Nombre del Nodo / Planta */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{
                          fontSize: '.88rem',
                          fontWeight: 700,
                          color: 'var(--tx1)',
                          lineHeight: 1.3
                        }}>
                          {plant.lugar}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                          {plant.equipo && plant.equipo !== plant.lugar ? plant.equipo : (plant.zona || 'Sede Airtek')}
                        </div>
                      </div>

                      {/* Medidores de Combustible: Sub-tanque & Reserva */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: (resCap > 0 || resActual > 0) ? '1fr 1fr' : '1fr',
                        gap: 8,
                        background: 'var(--bg-deep)',
                        padding: '8px 10px',
                        borderRadius: 8,
                        marginBottom: 10,
                        border: '1px solid var(--border)'
                      }}>
                        <div>
                          <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Sub-Tanque</div>
                          <div className="fm" style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)' }}>
                            {subActual.toLocaleString()} <span style={{ fontSize: '.68rem', fontWeight: 500, color: 'var(--tx3)' }}>/ {subCap} L</span>
                          </div>
                        </div>

                        {(resCap > 0 || resActual > 0) ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAdjustPlant) onAdjustPlant(plant);
                            }}
                            title="Hacer clic para calibrar o cambiar el nivel real de reserva"
                            style={{ cursor: 'pointer', borderRadius: 6, padding: '2px 4px', transition: 'all 0.15s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(1, 102, 255, 0.08)'; e.currentTarget.style.outline = '1px solid rgba(1, 102, 255, 0.25)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.outline = 'none'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Reserva</div>
                              <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '.02em' }}>Calibrar</span>
                            </div>
                            <div className="fm" style={{ fontSize: '.84rem', fontWeight: 700, color: resActual > 0 ? 'var(--blue)' : '#ef4444' }}>
                              {resActual.toLocaleString()} <span style={{ fontSize: '.68rem', fontWeight: 500, color: 'var(--tx3)' }}>{resCap > 0 ? `/ ${resCap} L` : 'Lts'}</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', fontSize: '.68rem', color: 'var(--tx3)' }}>
                            Directo a Planta
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Barra inferior: Horómetro y Acciones */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.7rem', color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ color: 'var(--blue)' }}>
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <strong style={{ color: 'var(--tx2)' }}>{plant.horometro_actual || '—'}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="bs"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAdjustPlant) onAdjustPlant(plant);
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '.72rem',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="Ajustar capacidades, horómetro y niveles"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                          Ajustar
                        </button>
                        <button
                          type="button"
                          className="bp"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPlant(plant);
                          }}
                          style={{
                            padding: '4px 10px',
                            fontSize: '.72rem',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Surtir
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

export { PlantasQuickList };
export default PlantasQuickList;
