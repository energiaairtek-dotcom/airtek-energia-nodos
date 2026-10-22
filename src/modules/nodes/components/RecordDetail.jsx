import React, { useState } from 'react';
import { db } from '@/services/firebase';
import { fmtDateTime, fmtDate, normalizeNodeName, parseHours, formatCleanHoro } from '@/utils/formatters';
import { REC_TYPES } from '@/config/constants';
import { generateReportText } from '@/utils/reportText';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { persistNodeFuelUpdate, generateFuelReportText, revertFuelTanks } from '@/modules/fuel/fuelUtils';
import { sortEquipment, getEqTypeFromTag, groupByBank, calcLoad } from '@/utils/energyCalculations';
import { MeasurementDisplayCard } from '@/modules/nodes/components/MeasurementDisplayCard';
import { InfoItem } from '@/modules/nodes/components/InfoItem';
import { getFieldLabel, getFieldUnit } from '@/modules/nodes/fieldLabels';
import { IconCopy } from '@/components/icons';

function RecordDetail({ record, onBack, nodeId, nodeName, equipment, userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const rt = REC_TYPES[record.type] || { label: record.type, icon: '', color: '#64748b' };
      const [editMeas, setEditMeas] = React.useState(false);
      const [measEdit, setMeasEdit] = React.useState(null); // snapshot editable
      const [editRecord, setEditRecord] = React.useState(false);
      const [recordForm, setRecordForm] = React.useState(null);
      const [saving, setSaving] = React.useState(false);

      const isAdmin = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) || 
        false || 
        false || 
        false || 
        false;

      const odooReportText = record.odooReport || (record.type === 'inspeccion' && record.measurements && Object.keys(record.measurements).length > 0
        ? generateReportText({
            nodeName: nodeName || 'Nodo',
            date: record.date?.toDate ? record.date.toDate() : new Date(record.date),
            shift: record.shift,
            technicianName: record.technicianName,
            measurements: record.measurements,
            observations: record.observations,
            equipment: equipment || []
          })
        : null);

      const openEdit = () => {
        // Deep clone measurements
        setMeasEdit(JSON.parse(JSON.stringify(record.measurements || {})));
        setEditMeas(true);
      };
      const saveEdit = async () => {
        if (!nodeId || !record.id) return;
        setSaving(true);
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).update({ measurements: measEdit });
          // Update local record object so view reflects changes
          Object.assign(record.measurements, measEdit);
          setEditMeas(false);
        } catch (e) { console.error(e); }
        setSaving(false);
      };

      const openEditRecord = () => {
        setRecordForm({
          tag: record.equipmentAction?.tag || '',
          serial: record.equipmentAction?.serial || '',
          notes: record.equipmentAction?.notes || record.observations || '',
          participants: record.participants || '',
          date: record.date?.toDate ? record.date.toDate().toISOString().slice(0, 16) : new Date(record.date).toISOString().slice(0, 16)
        });
        setEditRecord(true);
      };

      const saveRecordEdit = async () => {
        if (!nodeId || !record.id) return;
        setSaving(true);
        try {
          const upd = {
            participants: recordForm.participants,
            date: new Date(recordForm.date)
          };
          if (record.type === 'inspeccion' || record.type === 'actualizacion_carga') {
            upd.observations = recordForm.notes;
          } else if (record.equipmentAction) {
            upd.equipmentAction = { ...record.equipmentAction, tag: recordForm.tag, serial: recordForm.serial, notes: recordForm.notes };
          }
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).update(upd);
          Object.assign(record, upd);
          setEditRecord(false);
        } catch (e) { console.error(e); }
        setSaving(false);
      };
      const II = InfoItem;
      return (
        <div className="fin">
          {editMeas && (
            <div className="overlay" onClick={() => setEditMeas(false)}>
              <div className="card fin" style={{ maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 className="fd" style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem' }}>Editar Mediciones</h3>
                  <button onClick={() => setEditMeas(false)} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 20 }}>✕</button>
                </div>
                {Object.entries(measEdit).map(([tag, vals]) => (
                  <div key={tag} className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--amber)' }}>
                    <div className="fm" style={{ fontSize: '.85rem', color: 'var(--amber)', fontWeight: 700, marginBottom: 10 }}>{tag}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(vals).map(([k, v]) => (
                        <div key={k}>
                          <label style={{ display: 'block', fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                            {getFieldLabel(k)} <span style={{ color: 'var(--amber)' }}>{getFieldUnit(k)}</span>
                          </label>
                          <input className="mi" type="number" step="any" value={measEdit[tag][k] ?? ''}
                            onChange={e => setMeasEdit(prev => { const n = JSON.parse(JSON.stringify(prev)); n[tag][k] = e.target.value; return n; })} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="bp" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
                  <button className="bs" onClick={() => setEditMeas(false)} disabled={saving}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22 }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx1)' }}>{rt.icon} {rt.label}</h2>
                <p style={{ color: 'var(--tx3)', fontSize: '.8rem' }}>{fmtDateTime(record.date)}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {record.type === 'inspeccion' && record.measurements && Object.keys(record.measurements).length > 0 && (
                <button onClick={openEdit} className="bs" style={{ padding: '6px 14px', fontSize: '.78rem' }}>Valores</button>
              )}
              {isAdmin && (
                <button onClick={openEditRecord} className="bs" style={{ padding: '6px 14px', fontSize: '.78rem', color: 'var(--amber)', borderColor: 'rgba(1, 102, 255,.3)' }}>Registro</button>
              )}
              {isAdmin && (
                <button onClick={() => {
                  setConfirmModal({
                    title: '¿Realmente deseas eliminar este registro?',
                    msg: 'Esta acción eliminará permanentemente la inspección seleccionada.',
                    type: 'danger',
                    confirmText: 'Sí, estoy seguro',
                    onConfirm: async () => {
                      try {
                        // 1. Eliminar de energy_records en Firestore
                        await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).delete();

                        // 2. Si era un surtido o inspección con horómetro, revertir el horómetro del equipo
                        const plantTag = record.generatorTag || record.equipmentTag || record.equipmentAction?.tag || (equipment.find(e => e.type === 'GEN')?.tag || '');
                        let horoRestored = null;
                        // Se declara fuera del if porque más abajo se usa para revertir
                        // el horómetro en el flujo de combustible.
                        let prevHoro = 0;

                        if (plantTag) {
                          const recSnap = await db.collection('energy_nodes').doc(nodeId).collection('energy_records')
                            .orderBy('date', 'desc').get();

                          const otherRecords = recSnap.docs
                            .map(d => d.data())
                            .filter(r => (r.generatorTag === plantTag || r.equipmentTag === plantTag || r.equipmentAction?.tag === plantTag));

                          // El horómetro de una inspección de planta vive en measurements[tag].horometer,
                          // no en measurements.horometer. Sin ese acceso, se retrocedía al valor semilla.
                          for (const r of otherRecords) {
                            const rawHoro = r.fuelHorometer
                              || r.measurements?.[plantTag]?.horometer
                              || r.measurements?.horometer
                              || r.equipmentAction?.horometer;
                            const hVal = parseHours(rawHoro);
                            if (hVal > 0) {
                              prevHoro = hVal;
                              break;
                            }
                          }

                          // Si no hay lectura anterior no se toca el equipo: nunca se cae al valor semilla.
                          if (prevHoro > 0) {
                            const genEq = equipment.find(e => e.type === 'GEN' && e.tag === plantTag);
                            if (genEq) {
                              await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(genEq.id).update({
                                horometer: prevHoro
                              });
                              horoRestored = formatCleanHoro(prevHoro);
                            }
                          }
                        }

                        // 3. Si era un surtido o calibración, sincronizar también con Combustible (refills y tanques) y Firestore
                        if (record.type === 'surtido' || record.type === 'ajuste_combustible') {
                          try {
                            const curRefills = JSON.parse(localStorage.getItem('airtek_fuel_refills_v12') || '[]');
                            const updatedRefills = curRefills.filter(r => {
                              if (r.id === 'r_rec_' + record.id || r.id === 'db_' + record.id) return false;
                              const matchFecha = r.fecha === new Date(record.date?.toDate ? record.date.toDate() : record.date).toLocaleDateString('es-VE');
                              const nfd = normalizeNodeName;
                              const matchLugar = nfd(r.lugar) === nfd(nodeName) && (!record.generatorTag || !r.tag || r.tag === record.generatorTag);
                              const matchLitros = parseFloat(r.litros) === parseFloat(record.fuelLiters);
                              if (matchFecha && matchLugar && matchLitros) return false;
                              return true;
                            });
                            localStorage.setItem('airtek_fuel_refills_v12', JSON.stringify(updatedRefills));

                            // Revertir litros en tanques según la Tabla de la Verdad
                            const curTanks = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                            let updatedTanks = curTanks;
                            if (record.type === 'surtido') {
                              updatedTanks = revertFuelTanks(curTanks, {
                                lugar: nodeName,
                                tag: record.generatorTag,
                                destino: record.fuelDestination,
                                litros: record.fuelLiters,
                                litrosPlanta: record.fuelLitersPlanta,
                                litrosReserva: record.fuelLitersReserva,
                                prevSub: record.fuelPrevSub,
                                prevRes: record.fuelPrevRes,
                                resSub: record.fuelSubtankLevel != null ? record.fuelSubtankLevel : record.fuelSubLevel,
                                resRes: record.fuelReserveLevel,
                                prevHoro: (typeof prevHoro !== 'undefined' && prevHoro > 0) ? formatCleanHoro(prevHoro) : null
                              });
                            } else if (record.type === 'ajuste_combustible') {
                              const nfd = normalizeNodeName;
                              const targetNorm = nfd(nodeName);
                              updatedTanks = curTanks.map(t => {
                                const exact = nfd(t.lugar) === targetNorm;
                                const isPlt = record.generatorTag ? t.tag === record.generatorTag : exact;
                                if (!exact && !isPlt) return t;
                                const curS = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
                                const curR = parseFloat(t.reserva_lts) || 0;
                                const restoredSub = isPlt && record.diffSub != null ? Math.max(0, curS - (parseFloat(record.diffSub) || 0)) : curS;
                                const restoredRes = exact && record.diffReserve != null ? Math.max(0, curR - (parseFloat(record.diffReserve) || 0)) : curR;
                                const cons = t.consumo_lh > 0 ? t.consumo_lh : 1;
                                const aut = Number(((restoredSub + restoredRes) / cons).toFixed(1));
                                return {
                                  ...t,
                                  subtanque_actual: restoredSub,
                                  reserva_lts: restoredRes,
                                  aut_total_h: aut,
                                  dias_aut: Number((aut / 24).toFixed(2))
                                };
                              });
                            }
                            localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(updatedTanks));

                            // Sincronizar niveles revertidos en Firestore para que vuelva permanentemente a su estado original
                            const nfd = normalizeNodeName;
                            const targetNorm = nfd(nodeName);
                            const revTank = updatedTanks.find(t => (record.generatorTag && t.tag === record.generatorTag) || nfd(t.lugar) === targetNorm);
                            if (revTank) {
                              await persistNodeFuelUpdate({
                                db,
                                nodeId,
                                nodeName,
                                plantTag: record.generatorTag,
                                resultingSub: revTank.subtanque_actual,
                                resultingRes: revTank.reserva_lts,
                                resultingTotal: (parseFloat(revTank.subtanque_actual) || 0) + (parseFloat(revTank.reserva_lts) || 0),
                                addedTotalDespacho: 0,
                                fuelDest: 'Reversión / Eliminación de Registro',
                                fuelHoro: revTank.horometro_actual || '',
                                userProfile
                              });
                            }
                          } catch(e) {
                            console.warn('Error al revertir combustible en DB:', e);
                          }
                        }

                        setConfirmModal({
                          title: 'Registro eliminado con éxito',
                          msg:
                            record.type === 'surtido' || record.type === 'ajuste_combustible'
                              ? 'El registro fue eliminado y los niveles de combustible fueron restaurados.'
                              : horoRestored
                                ? `El registro fue eliminado. Horómetro restaurado a ${horoRestored}.`
                                : 'El registro fue eliminado. No había una lectura anterior de horómetro, así que el equipo quedó como estaba.',
                          type: 'success',
                          confirmText: 'Aceptar',
                          cancelText: false,
                          onConfirm: () => onBack()
                        });
                      } catch (e) { toast('Error: ' + e.message, 'error'); }
                    }
                  });
                }} className="bd" style={{ padding: '6px 10px', color: '#f55b5d', borderColor: 'rgba(245, 91, 93,.3)' }}>Eliminar</button>
              )}
            </div>
          </div>

          {editRecord && (
            <div className="overlay" onClick={() => setEditRecord(false)}>
              <div className="card fin" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="fd" style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem', marginBottom: 16 }}>Editar Registro</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div>
                    <label className="lbl">Fecha y Hora</label>
                    <input className="fi" type="datetime-local" value={recordForm.date} onChange={e => setRecordForm({ ...recordForm, date: e.target.value })} />
                  </div>
                  {record.type !== 'inspeccion' && record.equipmentAction && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="lbl">Tag del Equipo</label>
                        <input className="fi fm" value={recordForm.tag} onChange={e => setRecordForm({ ...recordForm, tag: e.target.value })} />
                      </div>
                      <div>
                        <label className="lbl">Serial</label>
                        <input className="fi fm" value={recordForm.serial} onChange={e => setRecordForm({ ...recordForm, serial: e.target.value })} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="lbl">{record.type === 'inspeccion' ? 'Observaciones' : 'Notas / Motivo'}</label>
                    <textarea className="fi" rows={3} value={recordForm.notes} onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl">Personal Involucrado</label>
                    <input className="fi" value={recordForm.participants} onChange={e => setRecordForm({ ...recordForm, participants: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button className="bp" style={{ flex: 1 }} onClick={saveRecordEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
                  <button className="bs" onClick={() => setEditRecord(false)} disabled={saving}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <II label="Registrado por" value={record.technicianName} />
              <II label="Turno" value={record.shift === 'dia' ? 'Día' : 'Noche'} />
              <II label="Fecha" value={fmtDate(record.date)} />
              <II label="Hora" value={record.date?.toDate ? record.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—'} />
              {record.participants && <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Personal Involucrado</div>
                <div style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 500 }}>{record.participants}</div>
              </div>}
            </div>
            {record.observations && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Observaciones</div>
              <p style={{ color: 'var(--tx2)', fontSize: '.9rem', fontWeight: 500 }}>{record.observations}</p>
            </div>}
          </div>
          {record.measurements && Object.keys(record.measurements).length > 0 && (() => {
            // Reconstruir lista de equipos medidos para agrupar por banco
            const meas = record.measurements;
            const measTags = Object.keys(meas);
            // Crear objetos de equipo ficticios desde los tags medidos
            const fakeEqs = sortEquipment(measTags.map(tag => {
              const type = getEqTypeFromTag(tag, equipment);
              return { id: tag, tag, type, active: true };
            }));
            const groups = groupByBank(fakeEqs);
            // Calcular carga total del nodo
            const totalLoad = measTags.reduce((sum, tag) => {
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, meas[tag]);
              return sum + ld.ac + ld.dc;
            }, 0);

            const MeasCard = ({ tag, highlight }) => <MeasurementDisplayCard tag={tag} highlight={highlight} vals={meas[tag] || {}} equipment={equipment} />;

            return (
              <div>
                {/* Carga total del nodo */}
                {totalLoad > 0 && <div style={{ background: 'rgba(0, 128, 0,.08)', border: '1px solid rgba(0, 128, 0,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Carga Total del Nodo</span>
                  <span className="fm" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#008000' }}>{totalLoad.toFixed(2)} <span style={{ fontSize: '.8rem' }}>kW</span></span>
                </div>}
                <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Mediciones Registradas</h3>
                {groups.map(({ bank, eqs, bat, orphanBats }) => {
                  const bankLoad = eqs.reduce((s, e) => s + calcLoad(e.type, meas[e.tag]), 0);
                  return (
                    <div key={bank || '_ung'} style={{ marginBottom: 16 }}>
                      {bank && bank !== '_ats' && bank !== '_orphan' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Banco {bank}</span>
                        {bankLoad > 0 && <span className="fm" style={{ fontSize: '.8rem', color: '#0166ff', fontWeight: 700 }}>Σ {bankLoad.toFixed(2)} kW</span>}
                      </div>}
                      {eqs.map(e => <MeasCard key={e.tag} tag={e.tag} highlight={false} />)}
                      {bat && meas[bat.tag] && <MeasCard key={bat.tag} tag={bat.tag} highlight={true} />}
                      {orphanBats && orphanBats.map(e => <MeasCard key={e.tag} tag={e.tag} highlight={true} />)}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {record.type === 'surtido' && (
            <div className="card" style={{ border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><line x1="3" y1="22" x2="15" y2="22"/></svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>Detalle de Surtido de Combustible</h3>
                  <p style={{ fontSize: '.75rem', color: 'var(--tx3)', margin: 0 }}>Despacho y control de niveles en el grupo electrógeno</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Planta / Generador</div>
                  <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--blue)', marginTop: 2 }}>{record.generatorTag || 'Planta Principal'}</div>
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Litros Suministrados</div>
                  <div className="fm" style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)', marginTop: 2 }}>
                    +{record.fuelLiters || 0} Lts
                  </div>
                  {record.fuelDestination === 'Surtido Planta y Reserva' && (
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Planta: {record.fuelLitersPlanta || 0}L | Reserva: {record.fuelLitersReserva || 0}L
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Destino del Combustible</div>
                  <div style={{ marginTop: 4 }}>
                    {(() => {
                      const d = record.fuelDestination || 'Surtido Reserva';
                      let bg = 'rgba(1, 102, 255, 0.12)';
                      let color = 'var(--blue)';
                      if (d.includes('Planta y Reserva') || d === 'Ambos') { bg = 'rgba(139, 92, 246, 0.15)'; color = '#8b5cf6'; }
                      else if (d.includes('Planta') || d === 'Sub-tanque') { bg = 'rgba(33, 192, 250, 0.12)'; color = '#21c0fa'; }
                      return (
                        <span className="badge" style={{ background: bg, color, fontWeight: 700 }}>
                          {d}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {record.fuelHorometer && (
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Horómetro al Surtir</div>
                    <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx1)', marginTop: 2 }}>{record.fuelHorometer}</div>
                  </div>
                )}

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Litros Totales en el Nodo</div>
                  <div className="fm" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>
                    {record.fuelTotalLevel || 0} Lts
                  </div>
                  {(record.fuelSubtankLevel !== undefined || record.fuelReserveLevel !== undefined) && (
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Sub: {record.fuelSubtankLevel || 0}L | Res: {record.fuelReserveLevel || 0}L
                    </div>
                  )}
                </div>
              </div>

              {record.observations && (
                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 4 }}>Observaciones del Despacho</div>
                  <div style={{ fontSize: '.84rem', color: 'var(--tx2)', lineHeight: 1.5 }}>{record.observations}</div>
                </div>
              )}
            </div>
          )}

          {record.type !== 'surtido' && record.equipmentAction && (record.equipmentAction.tag || record.equipmentAction.type) && (
            <div className="card">
              <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Acción de Equipo</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {record.equipmentAction.tag && <II label="Tag" value={record.equipmentAction.tag} mono />}
                {record.equipmentAction.serial && <II label="Serial" value={record.equipmentAction.serial} mono />}
                {record.equipmentAction.type && <II label="Tipo" value={record.equipmentAction.type} />}
                {record.equipmentAction.voltage && <II label="Tensión" value={record.equipmentAction.voltage} />}
                {record.equipmentAction.batteryType && record.equipmentAction.batteryType !== 'No aplica' && <II label="Batería" value={record.equipmentAction.batteryType} />}
                {record.equipmentAction.notes && <II label="Notas" value={record.equipmentAction.notes} />}
              </div>
            </div>
          )}
          {record.type === 'surtido' && (() => {
            const fuelText = generateFuelReportText({
              nodeName: nodeName || 'Nodo',
              date: record.date,
              record,
              equipment: equipment || []
            });
            return (
              <div className="card" style={{ marginTop: 14, border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>
                      Mensaje de Surtido (Formato para Copiar y Pegar)
                    </h3>
                    <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>WhatsApp / Reportes</span>
                  </div>
                  <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => {
                    navigator.clipboard.writeText(fuelText).then(() => {
                      if (toast) toast('¡Mensaje de surtido copiado al portapapeles!', 'success');
                    });
                  }}>
                    <IconCopy size={15} /> Copiar Mensaje
                  </button>
                </div>
                <textarea className="fi fm" readOnly value={fuelText} style={{ width: '100%', height: 190, fontSize: '0.82rem', lineHeight: 1.6, resize: 'vertical', background: 'var(--bg-deep)', color: 'var(--tx1)', borderRadius: 8, padding: '12px 14px' }} />
              </div>
            );
          })()}

          {odooReportText && (
            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Reporte de Inspección (Odoo)</h3>
                <button className="bp" style={{ padding: '4px 10px', fontSize: '.72rem' }} onClick={() => {
                  navigator.clipboard.writeText(odooReportText).then(() => {
                    if (toast) toast('Copiado al portapapeles', 'success');
                  });
                }}>
                  <IconCopy size={16} /> Copiar Reporte
                </button>
              </div>
              <textarea className="fi" readOnly value={odooReportText} style={{ height: '220px', fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical' }} />
            </div>
          )}
          {confirmModal && (
            <ConfirmModal
              title={confirmModal.title}
              msg={confirmModal.msg}
              type={confirmModal.type}
              confirmText={confirmModal.confirmText}
              cancelText={confirmModal.cancelText}
              onConfirm={async () => {
                const fn = confirmModal.onConfirm;
                setConfirmModal(null);
                if (fn) await fn();
              }}
              onCancel={() => {
                const fn = confirmModal.onCancel;
                setConfirmModal(null);
                if (fn) fn();
              }}
            />
          )}
        </div>
      );
    }

export { RecordDetail };
export default RecordDetail;
