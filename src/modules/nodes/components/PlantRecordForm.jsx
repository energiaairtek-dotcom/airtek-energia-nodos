import { useState, useEffect, useCallback } from 'react';
import firebase, { db } from '@/services/firebase';
import { validateInspection } from '@/modules/nodes/inspectionValidation';
import { parseHours, formatHHMMSS } from '@/utils/formatters';
import { IconCopy } from '@/components/icons';
import { useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';

    function PlantRecordForm({ nodeId, nodeName, nodeType, plantEq, userProfile, onSave, onCancel, toast }) {
      const authorizedStaff = useAuthorizedStaff(userProfile);
      const isTri = plantEq && plantEq.phases && plantEq.phases.toLowerCase().includes('tri');
      const DRAFT_KEY = `airtek_draft_plant_${nodeId}_${plantEq.tag}`;

      const getDraft = () => {
        try {
          const saved = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          return saved ? JSON.parse(saved) : null;
        } catch { return null; }
      };

      const initialDraft = getDraft();
      const effectiveNodeType = (nodeType || initialDraft?.nodeType || '').toLowerCase();
      const isNodeOrDc = (() => {
        const t = effectiveNodeType;
        const n = String(nodeName || '').trim().toLowerCase();
        if (t === 'datacenter' || t === 'fibra' || t === 'nodo' || t === 'node') return true;
        if (t === 'headend' || t === 'otro' || t === 'sede' || t === 'oficina') {
          if (n.startsWith('datacenter') || n.startsWith('data center') || n.startsWith('nodo')) return true;
          return false;
        }
        if (n.startsWith('datacenter') || n.startsWith('data center') || n.startsWith('nodo') || /\b(nodo|datacenter|data center)\b/i.test(n)) {
          return true;
        }
        return false;
      })();

      const [f, setF] = useState(() => {
        const defaults = {
          horometer: plantEq ? formatHHMMSS(parseFloat(plantEq.horometer)) : '',
          mantenimientoRealizado: false,
          autonomia: '',
          
          voltajeRed: '', voltajeL1L2: '', voltajeL2L3: '', voltajeL1L3: '',
          voltajeL1N: '', voltajeL2N: '', voltajeLN: '',
          ampF1: '', ampF2: '', ampF3: '', ampN: '',

          presionAceite: '', obsPresionAceite: '',
          fluidosStatus: 'OK', obsFluidos: '',
          manguerasStatus: 'OK', obsMangueras: '',
          correaStatus: 'OK', obsCorrea: '',

          atsStatus: 'OK', obsATS: '',
          batVCG: '', batVAT: '', batCTS: '', obsBat: '',
          cableadoStatus: 'OK', obsCableado: '',
          puntosCalStatus: 'SI', obsPuntosCal: '',
          sonoffStatus: 'SI', obsSonoff: '',

          encendidoStatus: 'SI', obsEncendido: '',
          ruidosStatus: 'SI', obsRuidos: '',
          surtidoStatus: 'SI', obsSurtido: '',
          reservaMin: '', reservaAutonomia: '', obsReserva: '',

          resultado: 'Aprobado – Opera dentro de parámetros.',
          obsGenerales: '',
          firmaTecnico: userProfile?.name || ''
        };
        return initialDraft ? { ...defaults, ...initialDraft } : defaults;
      });

      const [saving, setSaving] = useState(false);
      const [odooText, setOdooText] = useState('');
      const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?.savedAt ? new Date(initialDraft.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null);

      // Guardar borrador en localStorage automáticamente
      const saveDraftToStorage = useCallback(() => {
        try {
          const now = new Date();
          const draft = {
            ...f,
            nodeId, nodeName, nodeType: effectiveNodeType, plantTag: plantEq.tag, formType: 'plant',
            savedAt: now.toISOString()
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          localStorage.setItem('airtek_active_inspection', JSON.stringify({
            nodeId, nodeName, nodeType: effectiveNodeType, plantTag: plantEq.tag, formType: 'plant', key: DRAFT_KEY, savedAt: now.toISOString()
          }));
          setLastSavedTime(now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        } catch {
          // silenciado
        }
      }, [f, DRAFT_KEY, nodeId, nodeName, effectiveNodeType, plantEq.tag]);

      useEffect(() => {
        saveDraftToStorage();
      }, [saveDraftToStorage]);

      // Guardar ante salida de pantalla o cambio de app
      useEffect(() => {
        const handleVisibility = () => {
          if (document.visibilityState === 'hidden') saveDraftToStorage();
        };
        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', saveDraftToStorage);
        window.addEventListener('beforeunload', saveDraftToStorage);
        return () => {
          window.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('pagehide', saveDraftToStorage);
          window.removeEventListener('beforeunload', saveDraftToStorage);
        };
      }, [saveDraftToStorage]);

      const clearDraft = () => {
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch {}
          const active = localStorage.getItem('airtek_active_inspection');
          if (active && JSON.parse(active)?.key === DRAFT_KEY) {
            localStorage.removeItem('airtek_active_inspection');
          }
        } catch {}
        toast('Borrador de planta eliminado', 'info');
        onCancel();
      };

      const generarTextoOdoo = () => {
        const dateStr = new Date().toLocaleDateString('es-VE');
        const marcaMod = ((plantEq.brand || '') + ' ' + (plantEq.model || '')).trim();

        let voltajesText = isTri 
          ? `L1-L2: ${f.voltajeL1L2} V / L2-L3: ${f.voltajeL2L3} V / L1-L3: ${f.voltajeL1L3} V / L-N: ${f.voltajeLN} V`
          : `L1-L2: ${f.voltajeL1L2} V / L1-N: ${f.voltajeL1N} V / L2-N: ${f.voltajeL2N} V`;
          
        let amperajesText = isTri
          ? `Fase 1: ${f.ampF1} fase 2: ${f.ampF2}   Fase 3: ${f.ampF3} N: ${f.ampN}`
          : `Fase 1: ${f.ampF1} fase 2: ${f.ampF2}   N: ${f.ampN}`;

        const amperajeLabel = isNodeOrDc ? 'Amperaje del nodo' : 'Amperaje';

        return `CHEQUEO PREVENTIVO
Fecha: ${dateStr}
Técnico responsable: ${f.firmaTecnico}
1. DATOS DEL EQUIPO
Serial de la planta eléctrica:	${plantEq.serial || '—'}
Marca / Modelo:	${marcaMod || '—'}
Horas de servicio (lectura actual):	${f.horometer}
Autonomía del combustible:	${f.autonomia || '—'}
2. PARÁMETROS ELÉCTRICOS


Voltaje de la red (entrada ATS)	${f.voltajeRed} V
Voltajes de generación	${voltajesText} 
${amperajeLabel}	${amperajesText}
3. COMPONENTES MECÁNICOS Y FLUIDOS


Valor de presión de aceite (psi o bar)	${f.presionAceite}	${f.obsPresionAceite}
Fluidos (nivel y fugas)	[${f.fluidosStatus}]	${f.obsFluidos}
Mangueras (fisuras, abrasión)	[${f.manguerasStatus}]	${f.obsMangueras}
Correa única (tensión y desgaste)	[${f.correaStatus}]	${f.obsCorrea}
4. SISTEMA ELÉCTRICO Y CONTROL


ATS (Transferencia automática)	[${f.atsStatus}]	${f.obsATS}
Batería (voltaje y bornes)	V-CG ${f.batVCG} V-AT ${f.batVAT} C-TS ${f.batCTS}	${f.obsBat}
Cableado (conexiones sueltas, corrosión)	[${f.cableadoStatus}]	${f.obsCableado}
Puntos calientes(termografía/contacto)	[${f.puntosCalStatus}]	${f.obsPuntosCal}
Indicación de Sonoff (o relé remoto)	[${f.sonoffStatus}]	${f.obsSonoff}
5. PRUEBAS OPERATIVAS
Prueba de encendido remoto (local o remoto)	[${f.encendidoStatus}]	${f.obsEncendido}
Ruidos anormales(motor/alternador)	[${f.ruidosStatus}]	${f.obsRuidos}
Surtido a la planta (suministro de combustible)	[${f.surtidoStatus}]	${f.obsSurtido}
Reserva de combustible.	${f.reservaMin} Autonomía: ${f.reservaAutonomia}	${f.obsReserva}
6. RESULTADO FINAL
[X] ${f.resultado}
Mantenimiento de ${plantEq.maintenanceInterval || 250} horas realizado: ${f.mantenimientoRealizado ? 'SÍ' : 'NO'}
Observaciones generales:
${f.obsGenerales}`;
      };

      const copyToClipboard = () => {
        navigator.clipboard.writeText(odooText).then(() => {
          toast('Copiado al portapapeles', 'success');
        });
      };

      const save = async () => {
        const validationErrors = validateInspection(f);
        if (validationErrors.length > 0) {
          toast(validationErrors[0], 'error');
          return;
        }
        setSaving(true);
        try {
          const text = generarTextoOdoo();
          const recId = db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc().id;
          
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(recId).set({
            date: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'inspeccion_gen',
            shift: new Date().getHours() < 18 && new Date().getHours() >= 6 ? 'dia' : 'noche',
            technicianName: userProfile.name,
            technicianId: userProfile.uid,
            equipmentTag: plantEq.tag,
            odooReport: text,
            measurements: {
              [plantEq.tag]: {
                horometer: parseHours(f.horometer),
                mantenimientoRealizado: f.mantenimientoRealizado,
                autonomia: f.autonomia,
                voltajeRed: f.voltajeRed,
                voltajeL1L2: f.voltajeL1L2,
                voltajeL2L3: f.voltajeL2L3,
                voltajeL1L3: f.voltajeL1L3,
                voltajeL1N: f.voltajeL1N,
                voltajeL2N: f.voltajeL2N,
                voltajeLN: f.voltajeLN,
                ampF1: f.ampF1,
                ampF2: f.ampF2,
                ampF3: f.ampF3,
                ampN: f.ampN,
                presionAceite: f.presionAceite,
                obsPresionAceite: f.obsPresionAceite,
                fluidosStatus: f.fluidosStatus,
                obsFluidos: f.obsFluidos,
                manguerasStatus: f.manguerasStatus,
                obsMangueras: f.obsMangueras,
                correaStatus: f.correaStatus,
                obsCorrea: f.obsCorrea,
                atsStatus: f.atsStatus,
                obsATS: f.obsATS,
                batVCG: f.batVCG,
                batVAT: f.batVAT,
                batCTS: f.batCTS,
                obsBat: f.obsBat,
                cableadoStatus: f.cableadoStatus,
                obsCableado: f.obsCableado,
                puntosCalStatus: f.puntosCalStatus,
                obsPuntosCal: f.obsPuntosCal,
                sonoffStatus: f.sonoffStatus,
                obsSonoff: f.obsSonoff,
                encendidoStatus: f.encendidoStatus,
                obsEncendido: f.obsEncendido,
                ruidosStatus: f.ruidosStatus,
                obsRuidos: f.obsRuidos,
                surtidoStatus: f.surtidoStatus,
                obsSurtido: f.obsSurtido,
                reservaMin: f.reservaMin,
                reservaAutonomia: f.reservaAutonomia,
                obsReserva: f.obsReserva,
                resultado: f.resultado,
                obsGenerales: f.obsGenerales,
                firmaTecnico: f.firmaTecnico
              }
            }
          });

          const equipUpdate = {
            horometer: parseHours(f.horometer)
          };
          if (f.mantenimientoRealizado) {
            equipUpdate.lastMaintenanceHorometer = parseHours(f.horometer) || 0;
          }
          await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(plantEq.id).update(equipUpdate);

          toast('Chequeo de Grupo Electrógeno guardado', 'success');
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch {}
          setOdooText(text);
        } catch (e) {
          toast('Error al guardar: ' + e.message, 'error');
        }
        setSaving(false);
      };

      const renderStatusSelect = (field, obsField, options = ['OK', 'Fallo', 'N/A']) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="fi" value={f[field]} onChange={e => setF({...f, [field]: e.target.value})} style={{ width: '110px' }}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <input className="fi" placeholder="Observaciones..." value={f[obsField]} onChange={e => setF({...f, [obsField]: e.target.value})} />
        </div>
      );

      if (odooText) {
        return (
          <div className="card fin">
            <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 16, color: '#008000' }}>Inspección Guardada Exitosamente</h2>
            <p style={{ marginBottom: 12, color: 'var(--tx2)' }}>Copia el siguiente texto para pegarlo en la orden de trabajo de Odoo:</p>
            <textarea className="fi" readOnly value={odooText} style={{ height: '300px', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: 16, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" onClick={copyToClipboard} style={{ flex: 1 }}><IconCopy size={16} /> Copiar al Portapapeles</button>
              <button className="bs" onClick={onSave}>Cerrar</button>
            </div>
          </div>
        );
      }

      return (
        <div className="card fin">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center' }}>←</button>
              <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 800 }}>Chequeo: {plantEq.tag}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastSavedTime && (
                <span style={{ fontSize: '.72rem', color: '#10b981', background: 'rgba(16,185,129,.12)', padding: '4px 8px', borderRadius: 4 }}>
                  Guardado local {lastSavedTime}
                </span>
              )}
              <button className="bd" style={{ padding: '5px 10px', fontSize: '.72rem' }} onClick={clearDraft} title="Limpiar los campos del borrador">
                Limpiar
              </button>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
            
            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#eab308', marginBottom: 12 }}>1. DATOS DEL EQUIPO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="lbl">Serial de la planta eléctrica</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{plantEq.serial || '—'}</div></div>
                <div><label className="lbl">Marca / Modelo</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{((plantEq.brand || '') + ' ' + (plantEq.model || '')).trim() || '—'}</div></div>
                <div><label className="lbl">Fases</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{plantEq.phases || '—'}</div></div>
                <div><label className="lbl">Horas de servicio (lectura actual)</label><input className="fi" value={f.horometer} onChange={e => setF({...f, horometer: e.target.value})} placeholder="Ej: 1058:19:00 o 300" /></div>
                <div><label className="lbl">Autonomía del combustible</label><input className="fi" value={f.autonomia} onChange={e => setF({...f, autonomia: e.target.value})} placeholder="Ej: 48 horas" /></div>
                {(() => {
                  const interval = parseFloat(plantEq.maintenanceInterval) || 250;
                  const lastMaint = parseFloat(plantEq.lastMaintenanceHorometer) || 0;
                  const currentH = parseHours(f.horometer) || 0;
                  const elapsed = Math.max(0, currentH - lastMaint);
                  const remaining = interval - elapsed;
                  const percentage = Math.min(100, Math.max(0, (elapsed / interval) * 100));
                  
                  let barColor = 'var(--green)';
                  if (remaining <= 0) barColor = 'var(--red)';
                  else if (remaining <= 20) barColor = 'var(--amber)';

                  return (
                    <div style={{ gridColumn: '1/-1', background: 'var(--bg-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '.78rem', color: 'var(--tx2)', fontWeight: 600, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>CONTROL DE MANTENIMIENTO ({interval}H)</span>
                        <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Último: {formatHHMMSS(lastMaint)}</span>
                      </div>
                      
                      {/* Visual progress bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 4 }}>
                          <span>0% transcurrido</span>
                          <span style={{ fontWeight: 600, color: barColor }}>
                            {formatHHMMSS(elapsed)} transcurridas ({percentage.toFixed(0)}%)
                          </span>
                          <span>Límite ({formatHHMMSS(lastMaint + interval)})</span>
                        </div>
                        <div style={{ width: '100%', height: 8, background: 'var(--bg-deep)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s ease, background-color 0.3s ease' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <span style={{ 
                          fontSize: '.88rem', 
                          fontWeight: 700, 
                          color: remaining <= 0 ? 'var(--red)' : remaining <= 20 ? 'var(--amber)' : 'var(--green)' 
                        }}>
                          {remaining <= 0 
                            ? `VENCIDO (Excedido por ${Math.abs(remaining)} H)` 
                            : remaining <= 20 
                              ? `PRÓXIMO (Quedan ${remaining} H)` 
                              : `OK (Quedan ${remaining} H)`}
                        </span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tx2)', fontSize: '.84rem', cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={f.mantenimientoRealizado} onChange={e => setF({ ...f, mantenimientoRealizado: e.target.checked })} style={{ width: 16, height: 16 }} />
                          ¿Registrar Mantenimiento de {interval}H Realizado? (Reinicia el contador a {currentH || '0'} H)
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#0166ff', marginBottom: 12 }}>2. PARÁMETROS ELÉCTRICOS</div>
              <div style={{ marginBottom: 10 }}>
                <label className="lbl">Voltaje de la red (entrada ATS) [V]</label>
                <input className="fi" value={f.voltajeRed} onChange={e => setF({...f, voltajeRed: e.target.value})} placeholder="Ej: 220" />
              </div>
              <label className="lbl">Voltajes de generación [V]</label>
              {isTri ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><input className="fi" placeholder="L1-L2" value={f.voltajeL1L2} onChange={e => setF({...f, voltajeL1L2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L2-L3" value={f.voltajeL2L3} onChange={e => setF({...f, voltajeL2L3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L1-L3" value={f.voltajeL1L3} onChange={e => setF({...f, voltajeL1L3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L-N Promedio" value={f.voltajeLN} onChange={e => setF({...f, voltajeLN: e.target.value})} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><input className="fi" placeholder="L1-L2" value={f.voltajeL1L2} onChange={e => setF({...f, voltajeL1L2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L1-N" value={f.voltajeL1N} onChange={e => setF({...f, voltajeL1N: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L2-N" value={f.voltajeL2N} onChange={e => setF({...f, voltajeL2N: e.target.value})} /></div>
                </div>
              )}
              <label className="lbl">{isNodeOrDc ? 'Amperaje del nodo [A]' : 'Amperaje [A]'}</label>
              {isTri ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                  <div><input className="fi" placeholder="Fase 1" value={f.ampF1} onChange={e => setF({...f, ampF1: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 2" value={f.ampF2} onChange={e => setF({...f, ampF2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 3" value={f.ampF3} onChange={e => setF({...f, ampF3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="N" value={f.ampN} onChange={e => setF({...f, ampN: e.target.value})} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><input className="fi" placeholder="Fase 1" value={f.ampF1} onChange={e => setF({...f, ampF1: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 2" value={f.ampF2} onChange={e => setF({...f, ampF2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="N" value={f.ampN} onChange={e => setF({...f, ampN: e.target.value})} /></div>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#008000', marginBottom: 12 }}>3. COMPONENTES MECÁNICOS Y FLUIDOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label className="lbl">Valor de presión de aceite (psi o bar)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" style={{ width: '110px' }} value={f.presionAceite} onChange={e => setF({...f, presionAceite: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsPresionAceite} onChange={e => setF({...f, obsPresionAceite: e.target.value})} />
                  </div>
                </div>
                <div><label className="lbl">Fluidos (nivel y fugas)</label>{renderStatusSelect('fluidosStatus', 'obsFluidos')}</div>
                <div><label className="lbl">Mangueras (fisuras, abrasión)</label>{renderStatusSelect('manguerasStatus', 'obsMangueras')}</div>
                <div><label className="lbl">Correa única (tensión y desgaste)</label>{renderStatusSelect('correaStatus', 'obsCorrea')}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#21c0fa', marginBottom: 12 }}>4. SISTEMA ELÉCTRICO Y CONTROL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div><label className="lbl">ATS (Transferencia automática)</label>{renderStatusSelect('atsStatus', 'obsATS')}</div>
                <div>
                  <label className="lbl">Batería (voltaje y bornes)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" placeholder="V-CG" style={{ width: '80px' }} value={f.batVCG} onChange={e => setF({...f, batVCG: e.target.value})} />
                    <input className="fi" placeholder="V-AT" style={{ width: '80px' }} value={f.batVAT} onChange={e => setF({...f, batVAT: e.target.value})} />
                    <input className="fi" placeholder="C-TS" style={{ width: '80px' }} value={f.batCTS} onChange={e => setF({...f, batCTS: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsBat} onChange={e => setF({...f, obsBat: e.target.value})} />
                  </div>
                </div>
                <div><label className="lbl">Cableado (conexiones sueltas, corrosión)</label>{renderStatusSelect('cableadoStatus', 'obsCableado')}</div>
                <div><label className="lbl">Puntos calientes (termografía/contacto)</label>{renderStatusSelect('puntosCalStatus', 'obsPuntosCal', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Indicación de Sonoff (o relé remoto)</label>{renderStatusSelect('sonoffStatus', 'obsSonoff', ['SI', 'NO', 'N/A'])}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#f55b5d', marginBottom: 12 }}>5. PRUEBAS OPERATIVAS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div><label className="lbl">Prueba de encendido remoto (local o remoto)</label>{renderStatusSelect('encendidoStatus', 'obsEncendido', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Ruidos anormales (motor/alternador)</label>{renderStatusSelect('ruidosStatus', 'obsRuidos', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Surtido a la planta (suministro de combustible)</label>{renderStatusSelect('surtidoStatus', 'obsSurtido', ['SI', 'NO', 'N/A'])}</div>
                <div>
                  <label className="lbl">Reserva de combustible.</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" placeholder="Reserva..." style={{ width: '110px' }} value={f.reservaMin} onChange={e => setF({...f, reservaMin: e.target.value})} />
                    <input className="fi" placeholder="Autonomía de reserva..." style={{ width: '180px' }} value={f.reservaAutonomia} onChange={e => setF({...f, reservaAutonomia: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsReserva} onChange={e => setF({...f, obsReserva: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#f97316', marginBottom: 12 }}>6. RESULTADO FINAL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label className="lbl">Resultado</label>
                  <select className="fi" value={f.resultado} onChange={e => setF({...f, resultado: e.target.value})}>
                    <option value="Aprobado – Opera dentro de parámetros.">Aprobado – Opera dentro de parámetros.</option>
                    <option value="Observado – Requiere mantenimiento menor (ver notas).">Observado – Requiere mantenimiento menor (ver notas).</option>
                    <option value="Rechazado – No opera / requiere reparación mayor.">Rechazado – No opera / requiere reparación mayor.</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Observaciones generales</label>
                  <textarea className="fi" value={f.obsGenerales} onChange={e => setF({...f, obsGenerales: e.target.value})} style={{ minHeight: '80px', resize: 'vertical' }}></textarea>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="lbl">Firma del técnico (Responsable)</label>
                    <select className="fi" value={f.firmaTecnico} onChange={e => setF({...f, firmaTecnico: e.target.value})}>
                      <option value="">Selecciona el técnico responsable...</option>
                      {authorizedStaff.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 18 }}>
            <button className="bs" onClick={onCancel} disabled={saving} style={{ minWidth: 120 }}>Cancelar</button>
            <button className="bp" onClick={save} disabled={saving} style={{ minWidth: 220 }}>{saving ? 'Guardando...' : 'Guardar y Generar Reporte'}</button>
          </div>
        </div>
      );
    }
export { PlantRecordForm };
export default PlantRecordForm;
