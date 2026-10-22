import { useState, useEffect, useMemo } from 'react';


import { useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';

function AdjustFuelLevelModal({ tanks = [], preselectedPlant, userProfile, onSave, onClose, toast }) {
      const initialTank = useMemo(() => {
        if (preselectedPlant) {
          return tanks.find(t => t.id === preselectedPlant.id || (preselectedPlant.tag && t.tag === preselectedPlant.tag)) ||
                 tanks.find(t => t.lugar === preselectedPlant.lugar) ||
                 tanks[0];
        }
        return tanks[0];
      }, [preselectedPlant, tanks]);

      const [selectedTankId, setSelectedTankId] = useState(() => initialTank?.id || tanks[0]?.id || '');
      const selTank = tanks.find(t => t.id === selectedTankId) || tanks[0];

      const curSub = parseFloat(selTank?.subtanque_actual != null ? selTank.subtanque_actual : selTank?.tanque_lts) || 0;
      const subCap = parseFloat(selTank?.tanque_lts) || 0;
      const curRes = parseFloat(selTank?.reserva_lts) || 0;
      const resCap = parseFloat(selTank?.cap_reserva_lts != null ? selTank.cap_reserva_lts : selTank?.cap_reserva) || 0;
      const curConsumo = parseFloat(selTank?.consumo_lh) || 0;
      const curDiasAut = parseFloat(selTank?.dias_aut) || 0;
      const curHoro = selTank?.horometro_actual || '';

      const [newRes, setNewRes] = useState(() => String(curRes));
      const [newSub, setNewSub] = useState(() => String(curSub));
      const [newCapSub, setNewCapSub] = useState(() => String(subCap));
      const [newCapRes, setNewCapRes] = useState(() => String(resCap));
      const [horometro, setHorometro] = useState(() => curHoro);
      const [consumoLh, setConsumoLh] = useState(() => String(curConsumo));
      const [diasAut, setDiasAut] = useState(() => String(curDiasAut));

      // Actualizar valores al cambiar la planta seleccionada
      useEffect(() => {
        if (selTank) {
          const sSub = parseFloat(selTank.subtanque_actual != null ? selTank.subtanque_actual : selTank.tanque_lts) || 0;
          const sCapSub = parseFloat(selTank.tanque_lts) || 0;
          const sRes = parseFloat(selTank.reserva_lts) || 0;
          const sCapRes = parseFloat(selTank.cap_reserva_lts != null ? selTank.cap_reserva_lts : selTank.cap_reserva) || 0;
          const sCons = parseFloat(selTank.consumo_lh) || 0;
          const sDias = parseFloat(selTank.dias_aut) || 0;
          const sHoro = selTank.horometro_actual || '';

          setNewSub(String(sSub));
          setNewCapSub(String(sCapSub));
          setNewRes(String(sRes));
          setNewCapRes(String(sCapRes));
          setConsumoLh(String(sCons));
          setDiasAut(String(sDias));
          setHorometro(sHoro);
        }
      }, [selectedTankId]);

      const staffList = useAuthorizedStaff(userProfile);
      const [tecnico, setTecnico] = useState(() => userProfile?.name || staffList[0] || 'Cuadrilla Grupos Electrógenos');
      const [isCustomTecnico, setIsCustomTecnico] = useState(false);
      const [motivo, setMotivo] = useState('Medición física con vara en sitio');
      const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
      const [obs, setObs] = useState('');

      const parsedRes = parseFloat(newRes) || 0;
      const parsedSub = parseFloat(newSub) || 0;
      const parsedCapSub = parseFloat(newCapSub) || 0;
      const parsedCapRes = parseFloat(newCapRes) || 0;
      const parsedConsumo = parseFloat(consumoLh) || 0;
      const effectiveRes = parsedCapRes === 0 ? 0 : parsedRes;
      const diffRes = effectiveRes - curRes;
      const diffSub = parsedSub - curSub;
      const newTotal = parsedSub + effectiveRes;

      const handleConsumoChange = (val) => {
        setConsumoLh(val);
        const c = parseFloat(val) || 0;
        if (c > 0 && newTotal > 0) {
          const calculatedDias = Number(((newTotal / c) / 24).toFixed(2));
          setDiasAut(String(calculatedDias));
        }
      };

      const handleDiasAutChange = (val) => {
        setDiasAut(val);
        const d = parseFloat(val) || 0;
        if (d > 0 && newTotal > 0) {
          const calculatedConsumo = Number((newTotal / (d * 24)).toFixed(2));
          setConsumoLh(String(calculatedConsumo));
        }
      };

      const handleSave = () => {
        if (parsedSub < 0 || (parsedCapRes > 0 && parsedRes < 0)) {
          alert('Los niveles de combustible no pueden ser negativos.');
          return;
        }
        if (parsedCapSub <= 0) {
          alert('La capacidad nominal del tanque de la planta debe ser mayor a 0 litros.');
          return;
        }

        onSave({
          plant: selTank,
          prevRes: curRes,
          prevSub: curSub,
          newRes: effectiveRes,
          newSub: parsedSub,
          newCapSub: parsedCapSub,
          newCapRes: parsedCapRes,
          newConsumoLh: parsedConsumo,
          newDiasAut: parseFloat(diasAut) || 0,
          newHorometro: horometro.trim(),
          newTotal,
          diffRes,
          diffSub,
          motivo,
          tecnico: tecnico || 'Cuadrilla Grupos Electrógenos',
          fecha,
          obs
        });
      };

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
          <div className="card fin" onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(1, 102, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--blue)'
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                    Calibrar & Configurar Planta Eléctrica
                  </h3>
                  <p style={{ color: 'var(--tx3)', fontSize: '.76rem', margin: '2px 0 0' }}>
                    Modifica capacidades de tanques, autonomía, horómetro para mantenimiento real y niveles físicos.
                  </p>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {/* Selector de Planta */}
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Planta Eléctrica / Sede</label>
                <select
                  className="fi"
                  value={selTank?.id || ''}
                  onChange={e => setSelectedTankId(e.target.value)}
                >
                  {tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.lugar} — {t.tag} ({t.equipo || `${t.kva} kVA`})
                    </option>
                  ))}
                </select>
              </div>

              {/* SECCIÓN 1: CAPACIDADES NOMINALES */}
              <div style={{ gridColumn: '1/-1', marginTop: 4, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  1. Configuración de Capacidades de Tanques
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>
                  Si el nodo no posee reserva y se surte directo a la planta, ingresa 0 en Capacidad Reserva.
                </div>
              </div>

              <div>
                <label className="lbl">Capacidad Tanque Planta (Lts)</label>
                <input
                  className="fi fm"
                  type="number"
                  step="any"
                  min="1"
                  placeholder="Ej: 100"
                  value={newCapSub}
                  onChange={e => setNewCapSub(e.target.value)}
                  style={{ fontWeight: 700 }}
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 3 }}>
                  Capacidad nominal registrada de la planta.
                </div>
              </div>

              <div>
                <label className="lbl">Capacidad Reserva (Lts)</label>
                <input
                  className="fi fm"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0 si es directo a planta"
                  value={newCapRes}
                  onChange={e => {
                    setNewCapRes(e.target.value);
                    if (parseFloat(e.target.value) === 0) setNewRes('0');
                  }}
                  style={{ fontWeight: 700, color: parsedCapRes === 0 ? 'var(--tx3)' : 'var(--blue)' }}
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 3 }}>
                  {parsedCapRes === 0 ? 'Sin reserva (Surtido Directo a Planta)' : `Tanque externo de reserva (${parsedCapRes} L)`}
                </div>
              </div>

              {/* SECCIÓN 2: NIVELES FÍSICOS ACTUALES */}
              <div style={{ gridColumn: '1/-1', marginTop: 6, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  2. Niveles Físicos de Combustible en Sitio
                </div>
              </div>

              <div>
                <label className="lbl">
                  Nivel Real Tanque Planta (Lts)
                  {parsedCapSub > 0 && <span style={{ color: 'var(--tx3)', marginLeft: 4 }}>Máx: {parsedCapSub}L</span>}
                </label>
                <input
                  className="fi fm"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Ej: 100"
                  value={newSub}
                  onChange={e => setNewSub(e.target.value)}
                  style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--tx1)' }}
                />
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 4 }}>
                  Actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curSub} L</strong>
                  {diffSub !== 0 && (
                    <span style={{ marginLeft: 6, fontWeight: 700, color: diffSub > 0 ? '#10b981' : '#f55b5d' }}>
                      ({diffSub > 0 ? `+${diffSub}` : diffSub} Lts)
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="lbl">
                  Nivel Real de Reserva (Lts)
                  {parsedCapRes > 0 && <span style={{ color: 'var(--tx3)', marginLeft: 4 }}>Máx: {parsedCapRes}L</span>}
                </label>
                {parsedCapRes === 0 ? (
                  <div style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-deep)',
                    border: '1px dashed var(--border)',
                    fontSize: '.8rem',
                    color: 'var(--tx3)',
                    fontWeight: 600
                  }}>
                    Sin reserva (0 Lts)
                  </div>
                ) : (
                  <>
                    <input
                      className="fi fm"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Ej: 200"
                      value={newRes}
                      onChange={e => setNewRes(e.target.value)}
                      style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--blue)' }}
                    />
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 4 }}>
                      Actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curRes} L</strong>
                      {diffRes !== 0 && (
                        <span style={{ marginLeft: 6, fontWeight: 700, color: diffRes > 0 ? '#10b981' : '#f55b5d' }}>
                          ({diffRes > 0 ? `+${diffRes}` : diffRes} Lts)
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* SECCIÓN 3: HORÓMETRO Y MANTENIMIENTO */}
              <div style={{ gridColumn: '1/-1', marginTop: 6, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  3. Horómetro Operativo & Mantenimiento Real
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>
                  Sincroniza el horómetro real de la planta para tener control exacto de horas trabajadas y servicios preventivos.
                </div>
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Horómetro Actual de la Planta</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="fi fm"
                    type="text"
                    placeholder="Ej: 1339h 00m o 1339.5"
                    value={horometro}
                    onChange={e => setHorometro(e.target.value)}
                    style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tx1)' }}
                  />
                </div>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 4 }}>
                  Valor previo: <strong style={{ color: 'var(--tx2)' }}>{curHoro || '—'}</strong>. Al guardar, se actualizan las horas restantes de mantenimiento y estado del generador.
                </div>
              </div>

              {/* SECCIÓN 4: CONSUMO Y AUTONOMÍA */}
              <div style={{ gridColumn: '1/-1', marginTop: 6, padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  4. Autonomía y Consumo de Combustible
                </div>
              </div>

              <div>
                <label className="lbl">Consumo Promedio (Lts/h)</label>
                <input
                  className="fi fm"
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="Ej: 4.0"
                  value={consumoLh}
                  onChange={e => handleConsumoChange(e.target.value)}
                  style={{ fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="lbl">Autonomía Estimada (Días)</label>
                <input
                  className="fi fm"
                  type="number"
                  step="any"
                  min="0.1"
                  placeholder="Ej: 1.04"
                  value={diasAut}
                  onChange={e => handleDiasAutChange(e.target.value)}
                  style={{ fontWeight: 700, color: '#10b981' }}
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 3 }}>
                  Equivale a ~{Math.round((parseFloat(diasAut) || 0) * 24)} horas de operación continua.
                </div>
              </div>

              {/* SECCIÓN 5: BITÁCORA Y MOTIVO */}
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Motivo de la Calibración / Ajuste</label>
                <select className="fi" value={motivo} onChange={e => setMotivo(e.target.value)}>
                  <option value="Medición física con vara en sitio">Medición física con vara en sitio</option>
                  <option value="Actualización de horómetro y mantenimiento">Actualización de horómetro y mantenimiento</option>
                  <option value="Ajuste de capacidad de tanque o autonomía">Ajuste de capacidad de tanque o autonomía</option>
                  <option value="Consumo de planta por corte eléctrico no asentado">Consumo de planta por corte eléctrico no asentado</option>
                  <option value="Calibración inicial de tanque o sensor">Calibración inicial de tanque o sensor</option>
                  <option value="Corrección de inventario por auditoría">Corrección de inventario por auditoría</option>
                  <option value="Ajuste por trasiego manual">Ajuste por trasiego manual</option>
                  <option value="Otro motivo operativo">Otro motivo operativo</option>
                </select>
              </div>

              <div>
                <label className="lbl">Fecha de Medición</label>
                <input className="fi" type="text" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Técnico que midió en sitio</label>
                {!isCustomTecnico ? (
                  <select
                    className="fi"
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
                    <option value="__custom__">+ Otro (manual)...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="fi"
                      type="text"
                      placeholder="Nombre..."
                      value={tecnico}
                      onChange={e => setTecnico(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="bs"
                      style={{ padding: '6px 10px', fontSize: '.78rem' }}
                      onClick={() => {
                        setIsCustomTecnico(false);
                        setTecnico(staffList[0] || 'Cuadrilla Grupos Electrógenos');
                      }}
                    >Lista</button>
                  </div>
                )}
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Observaciones / Detalles</label>
                <textarea
                  className="fi"
                  rows={2}
                  placeholder="Detalles adicionales de la medición física, vara, horómetro o anomalías..."
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                />
              </div>

              {/* Tarjeta de Resumen en Vivo */}
              <div style={{ gridColumn: '1/-1', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Resumen Configuración Resultante
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)', marginTop: 2 }}>
                    Planta: <strong style={{ color: 'var(--tx1)' }}>{parsedSub} / {parsedCapSub} L</strong> | Reserva: <strong style={{ color: parsedCapRes === 0 ? 'var(--tx3)' : 'var(--blue)' }}>{parsedCapRes === 0 ? 'Sin reserva' : `${effectiveRes} / ${parsedCapRes} L`}</strong>
                  </div>
                  <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                    Autonomía: <strong style={{ color: '#10b981' }}>{diasAut} d</strong> | Horómetro: <strong style={{ color: 'var(--tx1)' }}>{horometro || '—'}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', fontWeight: 700 }}>Total Combustible</div>
                  <div className="fm" style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--green)' }}>
                    {newTotal} <span style={{ fontSize: '.8rem', fontWeight: 600 }}>Lts</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="bs" onClick={onClose}>Cancelar</button>
              <button className="bp" onClick={handleSave}>Guardar Configuración & Calibración</button>
            </div>
          </div>
        </div>
      );
    }

export { AdjustFuelLevelModal };
export default AdjustFuelLevelModal;
