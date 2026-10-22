import { useState, useEffect } from 'react';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { IconAlertTriangle } from '@/components/icons';
import { EQ_TYPES, BAT_TYPES, BAT_CELL_TYPES, AWG_OPTIONS, AWG_AMPACITY } from '@/config/constants';
import { formatHHMMSS, parseHours } from '@/utils/formatters';

    function EditEqModal({ eq, onSave, onDelete, onClose, userProfile }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [f, setF] = useState({
        tag: eq.tag || '',
        type: eq.type || 'INV',
        voltage: eq.voltage || '220V',
        voltageDC: eq.voltageDC || '',
        invMode: eq.invMode || 'Cargador/Descargador',
        hasAcIn: !!eq.hasAcIn,
        hasAcOut: !!eq.hasAcOut,
        hasDcOut: !!eq.hasDcOut,
        hasSolar: !!eq.hasSolar,
        pvCount: eq.pvCount || (eq.hasSolar ? 1 : 0),
        solarRegPercentage: eq.solarRegPercentage || '',
        batteryType: eq.batteryType || 'No aplica',
        batCapacity: eq.batCapacity || '',
        batCount: eq.batCount || '',
        batSoH: eq.batSoH || '',
        batDoD: eq.batDoD || '',
        batCellType: eq.batCellType || 'No aplica',
        batSerials: eq.batSerials || [],
        conductorGauge: eq.conductorGauge || '',
        serial: eq.serial || '',
        notes: eq.notes || '',
        active: eq.active !== false,
        horometer: eq.horometer ? formatHHMMSS(parseFloat(eq.horometer)) : '',
        lastMaintenanceHorometer: eq.lastMaintenanceHorometer ? formatHHMMSS(parseFloat(eq.lastMaintenanceHorometer)) : '00:00:00',
        maintenanceInterval: eq.maintenanceInterval || 250,
        capacity: eq.capacity || '',
        phases: eq.phases || '',
      });

      useEffect(() => {
        setF({
          tag: eq.tag || '',
          type: eq.type || 'INV',
          voltage: eq.voltage || '220V',
          voltageDC: eq.voltageDC || '',
          invMode: eq.invMode || 'Cargador/Descargador',
          hasAcIn: !!eq.hasAcIn,
          hasAcOut: !!eq.hasAcOut,
          hasDcOut: !!eq.hasDcOut,
          hasSolar: !!eq.hasSolar,
          pvCount: eq.pvCount || (eq.hasSolar ? 1 : 0),
          solarRegPercentage: eq.solarRegPercentage || '',
          batteryType: eq.batteryType || 'No aplica',
          batCapacity: eq.batCapacity || '',
          batCount: eq.batCount || '',
          batSoH: eq.batSoH || '',
          batDoD: eq.batDoD || '',
          batCellType: eq.batCellType || 'No aplica',
          batSerials: eq.batSerials || [],
          conductorGauge: eq.conductorGauge || '',
          serial: eq.serial || '',
          notes: eq.notes || '',
          active: eq.active !== false,
          horometer: eq.horometer ? formatHHMMSS(parseFloat(eq.horometer)) : '',
          lastMaintenanceHorometer: eq.lastMaintenanceHorometer ? formatHHMMSS(parseFloat(eq.lastMaintenanceHorometer)) : '00:00:00',
          maintenanceInterval: eq.maintenanceInterval || 250,
          capacity: eq.capacity || '',
          phases: eq.phases || '',
        });
      }, [eq]);

      const onBatTypeChange = (val) => {
        let vdc = f.voltageDC;
        if (!f.voltageDC) {
          if (val === 'LFP') vdc = '48';
          else if (val === 'NMC') vdc = '52.5';
          else if (val.includes('GEL')) vdc = '48';
        }
        setF({ ...f, batteryType: val, voltageDC: vdc });
      };

      const [saving, setSaving] = useState(false);

      const save = async () => {
        if (!f.tag.trim()) { return; }
        setSaving(true);
        const isDC = f.type === 'BAT' || f.type === 'ETP';
        const saveData = { ...f, tag: f.tag.trim().toUpperCase(), voltage: isDC ? '' : f.voltage };
        if (f.type === 'GEN') {
          saveData.horometer = parseHours(f.horometer);
          saveData.lastMaintenanceHorometer = parseHours(f.lastMaintenanceHorometer);
          saveData.maintenanceInterval = parseFloat(f.maintenanceInterval) || 250;
        }
        await onSave(saveData);
        setSaving(false);
      };

      const hasAdminAccess = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) ||
        false ||
        false ||
        false ||
        false;

      return (
        <div className="overlay" onClick={onClose}>
          {confirmModal && (
            <ConfirmModal 
              title={confirmModal.title} 
              msg={confirmModal.msg} 
              type={confirmModal.type} 
              confirmText={confirmModal.confirmText} 
              cancelText={confirmModal.cancelText} 
              onConfirm={confirmModal.onConfirm} 
              onCancel={() => setConfirmModal(null)} 
            />
          )}
          <div className="card fin" style={{ maxWidth: '680px', width: '92%', maxHeight: '88vh', overflowY: 'auto', borderRadius: '16px', padding: '24px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 className="fd" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--amber)' }}>Editar Equipo</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Tag</label>
                <input className="fi fm" value={f.tag} onChange={e => setF({ ...f, tag: e.target.value })} placeholder="INV00-PV-LFP00" />
              </div>
              <div>
                <label className="lbl">Tipo</label>
                <select className="fi" value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
                  {Object.entries(EQ_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Inversor Fields */}
              {f.type === 'INV' && (
                <>
                  <div>
                    <label className="lbl">Modo Operación</label>
                    <select className="fi" value={f.invMode} onChange={e => setF({ ...f, invMode: e.target.value })}>
                      <option value="Cargador/Descargador">Inversor / Cargador</option>
                      <option value="Solo Inversor">Solo Inversor (Descargador)</option>
                      <option value="Solo Cargador">Solo Cargador</option>
                    </select>
                  </div>
                  {f.invMode !== 'Solo Cargador' && (
                    <div>
                      <label className="lbl">Tensión</label>
                      <select className="fi" value={f.voltage} onChange={e => setF({ ...f, voltage: e.target.value })}>
                        <option value="110V">110V</option>
                        <option value="220V">220V</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Conexiones Reutilizado */}
              {(f.type === 'INV' || f.type === 'ETP') && (
                <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    {[
                      ['hasAcIn', 'ENTRADA AC'],
                      ['hasAcOut', 'Salida AC'],
                      ['hasDcOut', ' Salida DC'],
                      ['hasSolar', 'PV']
                    ].filter(([k]) => f.type !== 'INV' || k !== 'hasDcOut').map(([k, lbl]) => (
                      <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tx2)', fontSize: '.84rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} />{lbl}
                      </label>
                    ))}
                  </div>
                  {f.hasSolar && (
                    <div style={{ maxWidth: 200 }}>
                      <label className="lbl" style={{ fontSize: '.76rem' }}>Cantidad de Módulos PV</label>
                      <input
                        className="fi fm"
                        type="number"
                        min="1"
                        max="10"
                        value={f.pvCount || 1}
                        onChange={e => setF({ ...f, pvCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        placeholder="1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ETP Fields */}
              {f.type === 'ETP' && (
                <div>
                  <label className="lbl">Efic. Regulación (%) - Opcional</label>
                  <input className="fi" type="number" value={f.solarRegPercentage} onChange={e => setF({ ...f, solarRegPercentage: e.target.value })} placeholder="Ej: 85" />
                </div>
              )}

              {/* Voltaje Nominal (BAT/ETP) */}
              {(f.type === 'BAT' || f.type === 'ETP') && (
                <div>
                  <label className="lbl">Voltaje Nominal (VDC)</label>
                  <input className="fi fm" value={f.voltageDC} onChange={e => setF({ ...f, voltageDC: e.target.value })} placeholder="Ej: 48" />
                </div>
              )}

              {/* Bateria Info (Base) */}
              {(f.type === 'INV' || f.type === 'ETP' || f.type === 'BAT') && (
                <div>
                  <label className="lbl">Tipo Batería</label>
                  <select className="fi" value={f.batteryType} onChange={e => onBatTypeChange(e.target.value)}>
                    {BAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {/* Bateria Detalle - Capacidad y Count también para ETP */}
              {(f.type === 'BAT' || f.type === 'ETP') && (
                <div style={{ gridColumn: '1/-1', padding: '8px 12px', background: 'rgba(33, 192, 250,.06)', border: '1px solid rgba(33, 192, 250,.2)', borderRadius: 8 }}>
                  <label className="lbl">Capacidad Banco (Ah) — dejar vacío para borrar</label>
                  <input className="fi" value={f.batCapacity} onChange={e => setF({ ...f, batCapacity: e.target.value })} placeholder="Ej: 200 (vacío = eliminar)" />
                </div>
              )}
              {f.type === 'BAT' && <>
                <div>
                  <label className="lbl">Capacidad (Ah)</label>
                  <input className="fi" type="number" step="any" value={f.batCapacity} onChange={e => setF({ ...f, batCapacity: e.target.value })} placeholder="Ej: 200" />
                </div>
                <div>
                  <label className="lbl">N° Baterías</label>
                  <input className="fi" type="number" step="1" value={f.batCount} onChange={e => setF({ ...f, batCount: e.target.value })} placeholder="Ej: 4" />
                </div>
                <div>
                  <label className="lbl">Tipo Celda</label>
                  <select className="fi" value={f.batCellType} onChange={e => setF({ ...f, batCellType: e.target.value })}>
                    {BAT_CELL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Salud (SoH %)</label>
                  <input className="fi" type="number" step="1" value={f.batSoH} onChange={e => setF({ ...f, batSoH: e.target.value })} placeholder="Ej: 100" />
                </div>
                <div>
                  <label className="lbl">Profund. Descarga (DoD %)</label>
                  <input className="fi" type="number" step="1" value={f.batDoD} onChange={e => setF({ ...f, batDoD: e.target.value })} placeholder="Ej: 95" />
                </div>
                {f.batCount > 0 && Array.from({ length: parseInt(f.batCount) || 0 }).map((_, i) => (
                  <div key={i}>
                    <label className="lbl">Serial Batería #{i + 1} (Opcional)</label>
                    <input className="fi fm" value={f.batSerials?.[i] || ''}
                      onChange={e => {
                        const arr = [...(f.batSerials || [])];
                        arr[i] = e.target.value;
                        setF({ ...f, batSerials: arr });
                      }} placeholder={`SN bloque ${i + 1}`} />
                  </div>
                ))}
              </>}

              {/* Configuración de Breaker Principal y ATS */}
              {(f.type === 'ATS' || f.type === 'BKR') && (
                <>
                  <div>
                    <label className="lbl">Número de Líneas / Fases</label>
                    <select className="fi" value={f.phases || '2'} onChange={e => setF({ ...f, phases: e.target.value })}>
                      <option value="2">2 Líneas (L1, L2 + Neutro - Bifásica)</option>
                      <option value="3">3 Líneas (L1, L2, L3 + Neutro - Trifásica)</option>
                      <option value="1">1 Línea (L1 + Neutro - Monofásica)</option>
                    </select>
                  </div>

                  <div>
                    <label className="lbl">Capacidad Nominal (Amperios)</label>
                    <input className="fi fm" type="number" value={f.capacity || ''} onChange={e => setF({ ...f, capacity: e.target.value })} placeholder="Ej: 100, 150, 200..." />
                  </div>

                  <div>
                    <label className="lbl">Tensión de Operación AC</label>
                    <select className="fi" value={f.voltage || '220V'} onChange={e => setF({ ...f, voltage: e.target.value })}>
                      <option value="220V">220V</option>
                      <option value="208V">208V</option>
                      <option value="120V">120V</option>
                      <option value="480V">480V</option>
                    </select>
                  </div>

                  <div>
                    <label className="lbl">Calibre del Conductor (opcional)</label>
                    <select className="fi" value={f.conductorGauge} onChange={e => setF({ ...f, conductorGauge: e.target.value })}>
                      <option value="">-- Sin calibre definido --</option>
                      {AWG_OPTIONS.map(o => <option key={o} value={o}>{o} — máx {AWG_AMPACITY[o]}A</option>)}
                    </select>
                  </div>
                </>
              )}

              {f.type === 'GEN' && <>
                <div>
                  <label className="lbl">Capacidad de la Planta (KVA)</label>
                  <input className="fi" type="number" step="any" value={f.capacity || ''} onChange={e => setF({ ...f, capacity: e.target.value })} placeholder="Ej: 150" />
                </div>
                <div>
                  <label className="lbl">Fases</label>
                  <select className="fi" value={f.phases || ''} onChange={e => setF({ ...f, phases: e.target.value })}>
                    <option value="">-- Selecciona --</option>
                    <option value="Monofásica">Monofásica</option>
                    <option value="Trifásica">Trifásica</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Horómetro Actual (HH:MM:SS)</label>
                  <input className="fi fm" type="text" value={f.horometer || ''} onChange={e => setF({ ...f, horometer: e.target.value })} placeholder="Ej: 546:28:00 o 358" />
                </div>
                <div>
                  <label className="lbl">Horómetro del último mantenimiento (HH:MM:SS)</label>
                  <input className="fi fm" type="text" value={f.lastMaintenanceHorometer || ''} onChange={e => setF({ ...f, lastMaintenanceHorometer: e.target.value })} placeholder="Ej: 1412:20:00 o 300" />
                </div>
                <div>
                  <label className="lbl">Intervalo de mantenimiento (H)</label>
                  <input className="fi" type="number" value={f.maintenanceInterval || 250} onChange={e => setF({ ...f, maintenanceInterval: parseFloat(e.target.value) || 250 })} placeholder="Ej: 250" />
                </div>
              </>}

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Serial Principal (opcional)</label>
                <input className="fi fm" value={f.serial} onChange={e => setF({ ...f, serial: e.target.value })} placeholder="SN del equipo" />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Notas</label>
                <input className="fi" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Modelo, serie, observaciones..." />
              </div>

              {userProfile?.role === 'admin' && (
                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0, 128, 0,.05)', padding: '10px', borderRadius: 8, border: '1px solid rgba(0, 128, 0,.2)' }}>
                  <input type="checkbox" id="eqactive" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} style={{ width: 18, height: 18 }} />
                  <label htmlFor="eqactive" style={{ color: '#008000', fontSize: '.88rem', fontWeight: 700, cursor: 'pointer' }}>
                    Equipo Activo (Marcar para reactivar equipo retirado)
                  </label>
                </div>
              )}
            </div>

            {(f.batCapacity || f.notes) && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(245, 91, 93,.08)', border: '1px solid rgba(245, 91, 93,.25)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: '.78rem', color: '#f55b5d', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconAlertTriangle size={13} color="#f55b5d" />
                  Campos a limpiar: {[f.batCapacity && `batCapacity: "${f.batCapacity}"`, f.notes && `notes: "${f.notes}"`].filter(Boolean).join(' | ')}
                </span>
                <button onClick={() => setF({ ...f, batCapacity: '', batCount: '', notes: '' })}
                  style={{ background: 'rgba(245, 91, 93,.15)', border: '1px solid rgba(245, 91, 93,.4)', color: '#f55b5d', padding: '3px 10px', borderRadius: 5, cursor: 'pointer', fontSize: '.75rem', whiteSpace: 'nowrap' }}>
                  Limpiar
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="bp" style={{ flex: 1 }} onClick={save} disabled={saving || !f.tag.trim()}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button className="bs" onClick={onClose} disabled={saving}>Cancelar</button>
              {onDelete && hasAdminAccess && (
                <button className="bd" style={{ background: '#f55b5d', color: '#fff', border: 'none', marginLeft: 'auto' }}
                  onClick={() => {
                    setConfirmModal({
                      title: `¿Eliminar equipo ${eq.tag}?`,
                      msg: `Esta acción eliminará el equipo ${eq.tag} permanentemente de este nodo.`,
                      type: 'danger',
                      confirmText: 'Sí, Eliminar',
                      onConfirm: async () => {
                        try {
                          await onDelete(eq.id);
                          onClose();
                        } catch (e) { console.error(e); }
                      }
                    });
                  }}>Eliminar</button>
              )}
            </div>
          </div>
        </div>
      );
    }
export { EditEqModal };
export default EditEqModal;
