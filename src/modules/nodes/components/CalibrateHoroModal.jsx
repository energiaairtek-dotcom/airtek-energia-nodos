import { useState } from 'react';
import firebase, { db } from '@/services/firebase';
import { INITIAL_MAINTENANCE_LOG } from '@/modules/fuel/fuelUtils';
import { formatHHMMSS, parseHours } from '@/utils/formatters';

function CalibrateHoroModal({ plantEq, nodeId, nodeName, userProfile, toast, onClose, onSaved }) {
      const catalogSeed = INITIAL_MAINTENANCE_LOG.find(m => m.tag === plantEq.tag);
      const seedLastMaint = catalogSeed ? (parseFloat(catalogSeed.horometro_mtto) || 0) : 0;
      const seedCurrentH = catalogSeed ? (parseFloat(catalogSeed.horometro_actual) || 0) : 0;
      const eqLastMaint = parseFloat(plantEq.lastMaintenanceHorometer) || 0;
      const eqHoro = parseFloat(plantEq.horometer) || 0;

      let customH = 0;
      let customMtto = 0;
      try {
        const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
        if (ch[plantEq.tag]) {
          if (ch[plantEq.tag].horometro_actual !== undefined) customH = parseFloat(ch[plantEq.tag].horometro_actual) || 0;
          if (ch[plantEq.tag].horometro_mtto !== undefined) customMtto = parseFloat(ch[plantEq.tag].horometro_mtto) || 0;
        }
      } catch {}

      let tankH = 0;
      try {
        const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
        const mTank = tk.find(t => t.tag === plantEq.tag);
        if (mTank && mTank.horometro_actual !== undefined) {
          tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
        }
      } catch {}

      const initialLastM = Math.max(seedLastMaint, eqLastMaint, customMtto);
      const explicitH = Math.max(eqHoro, customH, tankH);
      const initialCurrH = explicitH > 0 ? Math.max(explicitH, initialLastM) : (initialLastM > 0 ? initialLastM : seedCurrentH);
      const initialInterval = parseFloat(plantEq.maintenanceInterval) || (catalogSeed ? catalogSeed.intervalo : 250);

      const [f, setF] = useState({
        horometer: formatHHMMSS(initialCurrH),
        lastMaintenanceHorometer: formatHHMMSS(initialLastM),
        maintenanceInterval: initialInterval,
        obs: ''
      });
      const [saving, setSaving] = useState(false);

      // Cálculos en tiempo real dentro del modal
      const curH = parseHours(f.horometer);
      const curM = parseHours(f.lastMaintenanceHorometer);
      const curInt = parseFloat(f.maintenanceInterval) || 250;
      const elapsed = Math.max(0, parseFloat((curH - curM).toFixed(1)));
      const remaining = parseFloat((curInt - elapsed).toFixed(1));
      const percentage = Math.min(100, Math.max(0, (elapsed / curInt) * 100));

      let barColor = '#10b981';
      let statusBadge = 'ÓPTIMO';
      if (remaining <= 0) {
        barColor = '#ef4444';
        statusBadge = 'MANTENIMIENTO VENCIDO';
      } else if (remaining <= 20) {
        barColor = '#f59e0b';
        statusBadge = 'MANTENIMIENTO PRÓXIMO';
      }

      const isHoroLowerThanMaint = curH < curM && curH > 0 && curM > 0;

      const handleSave = async () => {
        if (!f.horometer || !f.horometer.trim()) {
          toast('Por favor ingresa el horómetro actual.', 'error');
          return;
        }
        setSaving(true);
        try {
          const finalH = parseHours(f.horometer);
          const finalM = parseHours(f.lastMaintenanceHorometer);
          const finalI = parseFloat(f.maintenanceInterval) || 250;

          // 1. Actualizar energy_equipment en Firestore
          await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(plantEq.id).update({
            horometer: finalH,
            lastMaintenanceHorometer: finalM,
            maintenanceInterval: finalI
          });

          // 2. Registrar auditoría en energy_records
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').add({
            date: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'ajuste_horometro',
            generatorTag: plantEq.tag,
            equipmentTag: plantEq.tag,
            technicianName: userProfile?.name || 'Técnico',
            technicianId: userProfile?.uid || '',
            details: {
              oldHorometer: initialCurrH,
              newHorometer: finalH,
              oldLastMaint: initialLastM,
              newLastMaint: finalM,
              maintenanceInterval: finalI,
              obs: f.obs || 'Ajuste manual de horómetro desde tarjeta de planta'
            }
          });

          // 3. Sincronizar en localStorage: airtek_plant_horometers_v1
          try {
            const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
            ch[plantEq.tag] = {
              ...(ch[plantEq.tag] || {}),
              horometro_actual: finalH,
              horometro_mtto: finalM,
              updatedAt: new Date().toISOString()
            };
            localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(ch));
          } catch {}

          // 4. Sincronizar en localStorage: airtek_fuel_tanks_v13
          try {
            const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
            const idx = tk.findIndex(t => t.tag === plantEq.tag);
            if (idx !== -1) {
              tk[idx].horometro_actual = finalH;
              localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
            }
          } catch {}

          // 5. Emitir evento global para actualizar todas las vistas reactivas
          window.dispatchEvent(new CustomEvent('airtek_horo_updated', {
            detail: { plantTag: plantEq.tag, horometer: finalH, lastMaint: finalM }
          }));

          toast(`Horómetro de ${plantEq.tag} actualizado a ${formatHHMMSS(finalH)}`, 'success');
          if (onSaved) onSaved();
          onClose();
        } catch(e) {
          toast('Error al actualizar horómetro: ' + (e.message || String(e)), 'error');
        } finally {
          setSaving(false);
        }
      };

      return (
        <div className="overlay" onClick={onClose} style={{ zIndex: 9999 }}>
          <div className="card fin" style={{ maxWidth: 540, width: '92%', borderRadius: 16, padding: '24px 28px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0, color: 'var(--tx1)' }}>Ajustar Horómetro</h3>
                  <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>{plantEq.tag} · {nodeName}</div>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, padding: 4 }}>✕</button>
            </div>

            {/* Micro spec info */}
            <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.75rem', color: 'var(--tx2)' }}>Capacidad: <b>{plantEq.capacity || '—'} KVA</b></span>
              <span style={{ fontSize: '.75rem', color: 'var(--tx2)' }}>Fases: <b>{plantEq.phases || '—'}</b></span>
              <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: `${barColor}18`, color: barColor, border: `1px solid ${barColor}40` }}>
                {statusBadge}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="lbl" style={{ fontWeight: 700, color: 'var(--blue)' }}>Horómetro Actual (HH:MM:SS)</label>
                <input 
                  className="fi fm" 
                  type="text" 
                  value={f.horometer} 
                  onChange={e => setF({ ...f, horometer: e.target.value })} 
                  placeholder="Ej: 546:28:00 o 550" 
                  style={{ fontSize: '1rem', fontWeight: 700, borderColor: 'var(--blue)' }}
                  autoFocus
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 4 }}>Lectura física actual del marcador</div>
              </div>

              <div>
                <label className="lbl">Último Mantenimiento (HH:MM:SS)</label>
                <input 
                  className="fi fm" 
                  type="text" 
                  value={f.lastMaintenanceHorometer} 
                  onChange={e => setF({ ...f, lastMaintenanceHorometer: e.target.value })} 
                  placeholder="Ej: 546:28:00 o 300" 
                  style={{ fontSize: '1rem' }}
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 4 }}>Horómetro al que se realizó el mtto.</div>
              </div>

              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="lbl">Intervalo de Mantenimiento (H)</label>
                  <input 
                    className="fi" 
                    type="number" 
                    value={f.maintenanceInterval} 
                    onChange={e => setF({ ...f, maintenanceInterval: e.target.value })} 
                    placeholder="250" 
                  />
                </div>
                <div>
                  <label className="lbl">Observación / Motivo (opcional)</label>
                  <input 
                    className="fi" 
                    type="text" 
                    value={f.obs} 
                    onChange={e => setF({ ...f, obs: e.target.value })} 
                    placeholder="Ej: Corrección de horómetro en sitio" 
                  />
                </div>
              </div>
            </div>

            {/* Warning if currentH < lastM */}
            {isHoroLowerThanMaint && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span><b>Atención:</b> El horómetro actual ({formatHHMMSS(curH)}) es menor al del último mantenimiento ({formatHHMMSS(curM)}). Verifica las lecturas.</span>
              </div>
            )}

            {/* Realtime calculation summary box */}
            <div style={{ background: 'var(--bg-deep)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 8 }}>
                Cálculo en Tiempo Real
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Transcurridas</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--tx1)', fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(elapsed)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>{percentage.toFixed(0)}% de uso</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Restantes</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: barColor, fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(remaining)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>{remaining <= 0 ? 'Vencido' : 'Disponibles'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Próx. Límite</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--tx1)', fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(curM + curInt)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>Horómetro meta</div>
                </div>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="bs" onClick={onClose} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8 }}>
                Cancelar
              </button>
              <button className="bp" onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', borderRadius: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {saving ? 'Guardando...' : 'Guardar Horómetro'}
              </button>
            </div>
          </div>
        </div>
      );
    }

export { CalibrateHoroModal };
export default CalibrateHoroModal;
