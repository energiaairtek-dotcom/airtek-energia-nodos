import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/services/firebase';
import { PlantCard } from '@/modules/nodes/components/PlantCard';
import { PlantRecordForm } from '@/modules/nodes/components/PlantRecordForm';
import { CalibrateHoroModal } from '@/modules/nodes/components/CalibrateHoroModal';
import { AdjustFuelLevelModal } from '@/modules/fuel/CombustibleWrapper';
import { INITIAL_FUEL_TANKS, persistNodeFuelUpdate } from '@/modules/fuel/fuelUtils';
import { sortEquipment } from '@/utils/energyCalculations';
import { normalizeNodeName } from '@/utils/formatters';

function NodePlantas({ nodeId, nodeName, nodeType, equipment, records, userProfile, toast, onSubViewChange, setSelRecord }) {
      const genEqs = sortEquipment(equipment.filter(e => e.type === 'GEN' && e.active !== false));
      const [calibrateModalPlant, setCalibrateModalPlant] = useState(null);
      const [calibrateFuelPlant, setCalibrateFuelPlant] = useState(null);
      const [horoRefreshTrigger, setHoroRefreshTrigger] = useState(0);

      useEffect(() => {
        const onHoroUpdate = () => setHoroRefreshTrigger(k => k + 1);
        window.addEventListener('airtek_horo_updated', onHoroUpdate);
        return () => window.removeEventListener('airtek_horo_updated', onHoroUpdate);
      }, []);
      
      // Estado en tiempo real de la reserva y combustible del nodo
      const [nodeFuelState, setNodeFuelState] = useState(() => {
        const norm = normalizeNodeName;
        const targetNorm = norm(nodeName);
        let list = INITIAL_FUEL_TANKS;
        try {
          const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          if (saved.length > 0) list = saved;
        } catch(e) {}
        const match = list.filter(t => {
          const tNorm = norm(t.lugar);
          return tNorm === targetNorm || (targetNorm && tNorm.includes(targetNorm)) || (tNorm && targetNorm.includes(tNorm));
        });
        const maxRes = match.reduce((m, t) => Math.max(m, parseFloat(t.reserva_lts) || 0), 0);
        const maxCap = match.reduce((m, t) => Math.max(m, parseFloat(t.cap_reserva || t.cap_reserva_lts) || 0), 0);
        const subActual = match.length > 0 ? (parseFloat(match[0].subtanque_actual) || parseFloat(match[0].tanque_lts) || 0) : 0;
        return { reserva_lts: maxRes, cap_reserva_lts: maxCap, subtanque_actual: subActual };
      });

      useEffect(() => {
        if (!db || !nodeId) return;
        const unsub = db.collection('energy_nodes').doc(nodeId).collection('fuel').doc('state').onSnapshot(snap => {
          if (snap.exists) {
            const data = snap.data();
            const cLugar = (nodeName || '').toLowerCase();
            let rawRes = data.reserva_lts;
            let rawCap = data.cap_reserva_lts;

            // Auto-sanar en Firestore si el nodo sufrió el error previo de reserva en 0
            if (cLugar.includes('callao') && (rawRes === 0 || rawRes === undefined)) {
              rawRes = 1259.0;
              rawCap = 2500;
              snap.ref.set({ reserva_lts: 1259.0, cap_reserva_lts: 2500 }, { merge: true }).catch(() => {});
            } else if (cLugar.includes('18 de octubre') && (rawRes === 0 || rawRes === undefined)) {
              rawRes = 230.0;
              rawCap = 240;
              snap.ref.set({ reserva_lts: 230.0, cap_reserva_lts: 240 }, { merge: true }).catch(() => {});
            }

            setNodeFuelState(prev => {
              const rLts = rawRes !== undefined ? rawRes : prev.reserva_lts;
              const cLts = rawCap !== undefined ? rawCap : prev.cap_reserva_lts;
              return {
                ...prev,
                reserva_lts: rLts,
                cap_reserva_lts: cLts || prev.cap_reserva_lts,
                subtanque_actual: data.subtanque_actual !== undefined ? data.subtanque_actual : prev.subtanque_actual,
                total_nodo_lts: data.total_nodo_lts !== undefined ? data.total_nodo_lts : prev.total_nodo_lts
              };
            });
          }
        }, err => console.warn('Fuel state listener:', err));

        const onLocalUpdate = (e) => {
          const d = e.detail;
          if (d && (d.nodeId === nodeId || d.nodeName?.toLowerCase() === nodeName?.toLowerCase())) {
            setNodeFuelState(prev => ({
              ...prev,
              reserva_lts: d.resultingRes,
              subtanque_actual: d.resultingSub,
              total_nodo_lts: d.resultingTotal
            }));
          }
        };
        window.addEventListener('airtek_fuel_updated', onLocalUpdate);

        return () => {
          unsub();
          window.removeEventListener('airtek_fuel_updated', onLocalUpdate);
        };
      }, [nodeId, nodeName]);

      // Auto-recuperar si el técnico estaba en este formulario de planta
      const activePlantDraft = (() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          if (!s) return null;
          const parsed = JSON.parse(s);
          if (parsed.nodeId === nodeId && parsed.formType === 'plant' && parsed.plantTag) {
            return genEqs.find(e => e.tag === parsed.plantTag) || null;
          }
          return null;
        } catch { return null; }
      })();

      const [viewForm, setViewForm] = useState(() => !!activePlantDraft);
      const [selPlant, setSelPlant] = useState(() => activePlantDraft || null);
      const [expandedHist, setExpandedHist] = useState({});
      

      const handleInspect = (eq) => {
        setSelPlant(eq);
        setViewForm(true);
      };

      if (viewForm && selPlant) {
        return <PlantRecordForm nodeId={nodeId} nodeName={nodeName} nodeType={nodeType} plantEq={selPlant} userProfile={userProfile} onSave={() => setViewForm(false)} onCancel={() => setViewForm(false)} toast={toast} />;
      }

      return (
        <div className="fin">
          {genEqs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}></div>
              <p style={{ color: 'var(--tx3)', marginBottom: 14 }}>No hay Plantas Eléctricas registradas en este nodo.</p>
              <button className="bp" onClick={() => onSubViewChange('newRecord')}>+ Añadir Equipo Planta</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                 Plantas Eléctricas Registradas
              </div>
              {genEqs.map(eq => (
                <PlantCard.Root
                  key={eq.id}
                  eq={eq}
                  records={records}
                  nodeFuelState={nodeFuelState}
                  userProfile={userProfile}
                  isExpanded={!!expandedHist[eq.id]}
                  onToggleExpand={() => setExpandedHist(p => ({ ...p, [eq.id]: !p[eq.id] }))}
                  onInspect={() => handleInspect(eq)}
                  onAdjustHoro={() => setCalibrateModalPlant(eq)}
                  onCalibrateFuel={() => setCalibrateFuelPlant(eq)}
                  onRefill={() => {
                    localStorage.setItem('airtek_presurtido', JSON.stringify({ plantTag: eq.tag, plantCapacity: eq.capacity }));
                    onSubViewChange('newRecord');
                  }}
                  onSelectRecord={setSelRecord}
                >
                  <PlantCard.Frame>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: '280px' }}>
                        <PlantCard.Header />
                        <PlantCard.Specs />
                      </div>
                      <div style={{ textAlign: 'right', minWidth: '200px' }}>
                        <PlantCard.HorometerCountdown />
                        <PlantCard.Actions />
                      </div>
                    </div>
                    <PlantCard.ProgressBar />
                    <PlantCard.History />
                    <PlantCard.Notes />
                  </PlantCard.Frame>
                </PlantCard.Root>
              ))}
            </div>
          )}
          {calibrateModalPlant && (
            <CalibrateHoroModal 
              plantEq={calibrateModalPlant} 
              nodeId={nodeId} 
              nodeName={nodeName} 
              userProfile={userProfile} 
              toast={toast} 
              onClose={() => setCalibrateModalPlant(null)} 
              onSaved={() => setHoroRefreshTrigger(k => k + 1)} 
            />
          )}
          {calibrateFuelPlant && (
            <AdjustFuelLevelModal
              tanks={(() => {
                try {
                  const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                  if (saved.length > 0) return saved;
                } catch(e) {}
                return INITIAL_FUEL_TANKS;
              })()}
              preselectedPlant={{
                ...calibrateFuelPlant,
                lugar: nodeName,
                tag: calibrateFuelPlant.tag
              }}
              userProfile={userProfile}
              toast={toast}
              onClose={() => setCalibrateFuelPlant(null)}
              onSave={async (adj) => {
                try {
                  await persistNodeFuelUpdate({
                    db,
                    nodeId,
                    nodeName,
                    plantTag: calibrateFuelPlant.tag,
                    resultingSub: adj.newSub,
                    resultingRes: adj.newRes,
                    resultingTotal: adj.newTotal,
                    resultingCapRes: adj.newCapRes,
                    addedTotalDespacho: 0,
                    resultingLtsP: 0,
                    resultingLtsR: 0,
                    fuelDest: `Calibración (${adj.motivo})`,
                    fuelHoro: adj.newHorometro || '',
                    userProfile
                  });
                  setNodeFuelState({
                    reserva_lts: adj.newRes,
                    cap_reserva_lts: adj.newCapRes,
                    subtanque_actual: adj.newSub,
                    total_nodo_lts: adj.newTotal
                  });
                  toast('Combustible y reserva calibrados con éxito.', 'success');
                  setCalibrateFuelPlant(null);
                } catch (e) {
                  console.error(e);
                  toast('Error calibrando combustible: ' + e.message, 'error');
                }
              }}
            />
          )}
        </div>
      );
    }

export { NodePlantas };
export default NodePlantas;
