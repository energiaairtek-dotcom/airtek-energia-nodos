import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useTransition, useContext } from 'react';
import { loadXLSX, loadJsPDF, loadQRCode } from '@/utils/exportLibs';
import { computeDispatchLevels, validateDispatch } from '@/modules/fuel/fuelCalc';
import { validateInspection } from '@/modules/nodes/inspectionValidation';
import { getFieldLabel, getFieldUnit } from '@/modules/nodes/fieldLabels';
import { generateReportText } from '@/utils/reportText';
import firebase, { db, auth, TS, FieldValue } from '@/services/firebase';
import { 
  NODE_TYPES, EQ_TYPES, BAT_TYPES, BAT_CELL_TYPES, 
  AWG_AMPACITY, AWG_OPTIONS, BAT_VN, REC_TYPES 
} from '@/config/constants';
import { DEFAULT_AUTHORIZED_STAFF, useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { 
  IconSearch, IconExcel, IconCheckCircle, IconAlertTriangle, 
  IconMapPin, IconPdf, IconCopy, IconChecklist 
} from '@/components/icons';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { 
  fmtDateTime, fmtDate, slugify, formatHHMMSS, parseHours, 
  sanitize, normalizeNodeName, formatCleanHoro, parseHorometerToHours
} from '@/utils/formatters';
import { 
  getBankId, getEqTypeFromTag, groupByBank, calcLoad, 
  calcAutonomy, fmtHours, sortEquipment, checkAtsAlarms 
} from '@/utils/energyCalculations';
import { sendNotificationAlert } from '@/services/email';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, persistNodeFuelUpdate, revertFuelTanks, generateFuelReportText } from '@/modules/fuel/fuelUtils';
import { AdjustFuelLevelModal } from '@/modules/fuel/CombustibleWrapper';
import { QRModal } from '@/modules/nodes/components/QrModal';
import { LoadChart } from '@/modules/nodes/components/LoadChart';
import { NodeEvents } from '@/modules/nodes/components/NodeEvents';
import { PersonnelMultiSelect } from '@/modules/nodes/components/PersonnelMultiSelect';
import { NodeAlerts } from '@/modules/nodes/components/NodeAlerts';
import { EditEqModal } from '@/modules/nodes/components/EditEqModal';
import { NodeDocs } from '@/modules/nodes/components/NodeDocs';
import { PlantRecordForm } from '@/modules/nodes/components/PlantRecordForm';
import { RecordDetail } from '@/modules/nodes/components/RecordDetail';
import { MeasurementDisplayCard } from '@/modules/nodes/components/MeasurementDisplayCard';
import { InfoItem } from '@/modules/nodes/components/InfoItem';
import { ReportModal } from '@/modules/nodes/components/ReportModal';
import { RecordForm } from '@/modules/nodes/components/RecordForm';
import { MF } from '@/modules/nodes/components/MF';
import { EqMeasurements } from '@/modules/nodes/components/EqMeasurements';
import { ALERT_PRIORITIES } from '@/modules/nodes/components/alertPriorities';


    // ═══════════════════════════════════════════════════
    // CAMPO DE MEDICIÓN
    // ═══════════════════════════════════════════════════
    // MEDICIONES DINÁMICAS POR TIPO DE EQUIPO
        // Helper para formatear horómetros limpios (ej. 674:12 o 674h)
        // Helper para parsear cualquier formato de horómetro a número flotante de horas
        // DEFAULT_AUTHORIZED_STAFF & useAuthorizedStaff imported from @/hooks/useAuthorizedStaff

    // Revierte el efecto de un surtido sobre los tanques: sub-tanque SOLO de la planta (por tag)
    // y reserva compartida SOLO en las plantas del mismo nodo que realmente tienen reserva.
    // ═══════════════════════════════════════════════════
    // FORMULARIO DE REGISTRO
    // ═══════════════════════════════════════════════════
    // DETALLE DE REGISTRO
    // ═══════════════════════════════════════════════════
    // GRÁFICO HISTÓRICO DE CARGAS POR BANCO
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    //  MODAL EDICIÓN DE EQUIPO
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    // DOCUMENTOS DEL NODO — Diagramas y manuales (solo usuarios registrados)
    // ═══════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════
    //  COMPONENTES DE PLANTA ELÉCTRICA
    // ═══════════════════════════════════════════════════

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
      } catch(e) {}

      let tankH = 0;
      try {
        const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
        const mTank = tk.find(t => t.tag === plantEq.tag);
        if (mTank && mTank.horometro_actual !== undefined) {
          tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
        }
      } catch(e) {}

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
          } catch(e) {}

          // 4. Sincronizar en localStorage: airtek_fuel_tanks_v13
          try {
            const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
            const idx = tk.findIndex(t => t.tag === plantEq.tag);
            if (idx !== -1) {
              tk[idx].horometro_actual = finalH;
              localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
            }
          } catch(e) {}

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

    // --- PLANT CARD COMPOUND COMPONENT (vercel-composition-patterns) ---
    const PlantCardContext = React.createContext(null);

    function usePlantCard() {
      const ctx = React.useContext(PlantCardContext);
      if (!ctx) {
        throw new Error('PlantCard subcomponents must be used within PlantCard.Root');
      }
      return ctx;
    }

    const PlantCard = {
      Root: function PlantCardRoot({
        eq,
        records,
        nodeFuelState,
        userProfile,
        isExpanded,
        onToggleExpand,
        onInspect,
        onAdjustHoro,
        onCalibrateFuel,
        onRefill,
        onSelectRecord,
        children
      }) {
        const catalogSeed = INITIAL_MAINTENANCE_LOG.find(m => m.tag === eq.tag);
        const interval = parseFloat(eq.maintenanceInterval) || (catalogSeed ? catalogSeed.intervalo : 250);
        const seedLastMaint = catalogSeed ? (parseFloat(catalogSeed.horometro_mtto) || 0) : 0;
        const eqLastMaint = parseFloat(eq.lastMaintenanceHorometer) || 0;

        let customH = 0;
        let customMtto = 0;
        try {
          const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
          if (ch[eq.tag]) {
            if (ch[eq.tag].horometro_actual !== undefined) customH = parseFloat(ch[eq.tag].horometro_actual) || 0;
            if (ch[eq.tag].horometro_mtto !== undefined) customMtto = parseFloat(ch[eq.tag].horometro_mtto) || 0;
          }
        } catch(e) {}

        let tankH = 0;
        try {
          const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          const mTank = tk.find(t => t.tag === eq.tag);
          if (mTank && mTank.horometro_actual !== undefined) {
            tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
          }
        } catch(e) {}

        const lastMaint = Math.max(seedLastMaint, eqLastMaint, customMtto);
        const seedCurrentH = catalogSeed ? (parseFloat(catalogSeed.horometro_actual) || 0) : 0;
        const eqCurrentH = parseFloat(eq.horometer) || 0;

        const allPlantRecords = (records || [])
          .filter(r => r.generatorTag === eq.tag || r.equipmentTag === eq.tag || r.equipmentAction?.tag === eq.tag)
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dbDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dbDate - da;
          });

        let latestHoroFromRecords = 0;
        for (const r of allPlantRecords) {
          let hVal = 0;
          if (r.fuelHorometer) {
            hVal = parseHours(r.fuelHorometer);
          } else if (r.measurements?.[eq.tag]?.horometer) {
            hVal = parseHours(r.measurements[eq.tag].horometer);
          } else if (r.measurements?.horometer) {
            hVal = parseHours(r.measurements.horometer);
          } else if (r.equipmentAction?.horometer) {
            hVal = parseHours(r.equipmentAction.horometer);
          } else if (r.details?.horometer) {
            hVal = parseHours(r.details.horometer);
          } else if (r.details?.newHorometer) {
            hVal = parseHours(r.details.newHorometer);
          } else if (r.horometer) {
            hVal = parseHours(r.horometer);
          }
          if (hVal > 0) {
            latestHoroFromRecords = hVal;
            break;
          }
        }

        const explicitCurrentH = Math.max(eqCurrentH, customH, tankH, latestHoroFromRecords);
        const currentH = explicitCurrentH > 0 
          ? Math.max(explicitCurrentH, lastMaint) 
          : (lastMaint > 0 ? lastMaint : seedCurrentH);

        const elapsed = Math.max(0, parseFloat((currentH - lastMaint).toFixed(1)));
        const remaining = parseFloat((interval - elapsed).toFixed(1));
        const percentage = Math.min(100, Math.max(0, (elapsed / interval) * 100));

        let barColor = '#10b981';
        let bgColor = 'rgba(16, 185, 129, 0.12)';
        let statusText = 'OPERATIVO';
        if (remaining <= 0) {
          barColor = '#ef4444';
          bgColor = 'rgba(239, 68, 68, 0.12)';
          statusText = 'MANTENIMIENTO VENCIDO';
        } else if (remaining <= 20) {
          barColor = '#f59e0b';
          bgColor = 'rgba(245, 158, 11, 0.12)';
          statusText = 'MANTENIMIENTO PRÓXIMO';
        }

        const plantRecords = (records || [])
          .filter(r => r.type === 'inspeccion_gen' && r.equipmentTag === eq.tag)
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dbDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dbDate - da;
          });

        const contextValue = {
          state: {
            eq,
            currentH,
            lastMaint,
            interval,
            elapsed,
            remaining,
            percentage,
            barColor,
            bgColor,
            statusText,
            plantRecords,
            isExpanded,
            userProfile,
            reservaLts: nodeFuelState?.reserva_lts || 0,
            capReservaLts: nodeFuelState?.cap_reserva_lts || 0
          },
          actions: {
            onInspect,
            onAdjustHoro,
            onCalibrateFuel,
            onRefill,
            onToggleExpand,
            onSelectRecord
          }
        };

        return (
          <PlantCardContext.Provider value={contextValue}>
            {children}
          </PlantCardContext.Provider>
        );
      },

      Frame: function PlantCardFrame({ children }) {
        return (
          <div className="card fin" style={{ 
            background: 'var(--bg-surface)', 
            border: '1px solid var(--border)',
            borderRadius: 12, 
            padding: '18px 22px', 
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
          }}>
            {children}
          </div>
        );
      },

      Header: function PlantCardHeader() {
        const { state: { eq, barColor, bgColor, statusText } } = usePlantCard();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ 
              fontSize: '.72rem', 
              fontWeight: 800, 
              padding: '3px 8px', 
              borderRadius: 6, 
              background: 'var(--bg-elevated)', 
              color: 'var(--tx2)', 
              border: '1px solid var(--border)',
              letterSpacing: '.05em' 
            }}>GEN</span>
            <span className="fd" style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--tx1)', letterSpacing: '.02em' }}>{eq.tag}</span>
            <span style={{ 
              fontSize: '.72rem', 
              fontWeight: 700, 
              padding: '3px 10px', 
              borderRadius: 20, 
              background: bgColor, 
              color: barColor, 
              border: `1px solid ${barColor}40`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: barColor }} />
              {statusText}
            </span>
          </div>
        );
      },

      Specs: function PlantCardSpecs() {
        const { 
          state: { eq, currentH, reservaLts, capReservaLts, userProfile },
          actions: { onAdjustHoro, onCalibrateFuel }
        } = usePlantCard();
        const canEditFuel = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase());

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: 6 }}>
            {eq.serial && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Serial</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.serial}</div>
              </div>
            )}
            {eq.capacity && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Capacidad</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.capacity} KVA</div>
              </div>
            )}
            {eq.phases && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Fases</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.phases}</div>
              </div>
            )}
            {currentH > 0 && (
              <div 
                onClick={onAdjustHoro}
                title="Haz clic para ajustar o calibrar el horómetro"
                style={{ 
                  background: 'var(--bg-elevated)', 
                  padding: '6px 10px', 
                  borderRadius: 8, 
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.background = 'rgba(1, 102, 255, 0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Horómetro</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Modificar
                  </span>
                </div>
                <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', fontFamily: "'Outfit', 'Montserrat', monospace" }}>{formatHHMMSS(currentH)}</div>
              </div>
            )}
            <div 
              onClick={canEditFuel ? onCalibrateFuel : undefined}
              title={canEditFuel ? "Haz clic para calibrar o ajustar combustible y reserva" : undefined}
              style={{ 
                background: 'var(--bg-elevated)', 
                padding: '6px 10px', 
                borderRadius: 8, 
                border: '1px solid var(--border)',
                cursor: canEditFuel ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onMouseEnter={e => { if (canEditFuel) { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.background = 'rgba(1, 102, 255, 0.08)'; } }}
              onMouseLeave={e => { if (canEditFuel) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Reserva</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {canEditFuel && (
                    <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Modificar
                    </span>
                  )}
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: reservaLts > 0 ? '#10b981' : '#ef4444' }} />
                </div>
              </div>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: reservaLts > 0 ? 'var(--blue)' : '#ef4444', fontFamily: "'Outfit', sans-serif" }}>
                {reservaLts.toLocaleString()} <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--tx3)' }}>Lts</span>
              </div>
              {capReservaLts > 0 && (
                <div style={{ fontSize: '.62rem', color: 'var(--tx4)', marginTop: 1 }}>
                  Cap: {capReservaLts} Lts ({Math.min(100, Math.round((reservaLts / capReservaLts) * 100))}%)
                </div>
              )}
            </div>
          </div>
        );
      },

      HorometerCountdown: function PlantCardHorometerCountdown() {
        const { state: { remaining, barColor } } = usePlantCard();
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div className="fm" style={{ 
              fontSize: '1.75rem', 
              fontWeight: 900, 
              color: barColor, 
              lineHeight: 1, 
              letterSpacing: '.02em',
              fontFamily: "'Outfit', 'Montserrat', monospace"
            }}>
              {formatHHMMSS(remaining)}
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
              {remaining <= 0 ? 'Horas de sobregiro' : 'Horas restantes'}
            </div>
          </div>
        );
      },

      Actions: function PlantCardActions() {
        const {
          state: { plantRecords, isExpanded, userProfile },
          actions: { onInspect, onAdjustHoro, onCalibrateFuel, onRefill, onToggleExpand }
        } = usePlantCard();
        const canEditFuel = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase());

        return (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {plantRecords.length > 0 && (
              <button className="bs" style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600 }} onClick={onToggleExpand}>
                {isExpanded ? 'Ocultar Hist.' : `Historial (${plantRecords.length})`}
              </button>
            )}
            {canEditFuel && (
              <button 
                className="bs" 
                style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} 
                onClick={onCalibrateFuel}
                title="Calibrar niveles de combustible y capacidad de reserva física"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Calibrar Combustible
              </button>
            )}
            <button 
              className="bs" 
              style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} 
              onClick={onAdjustHoro}
              title="Ajustar horómetro actual y último mantenimiento"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Ajustar Horómetro
            </button>
            <button className="bp" style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, background: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 }} onClick={onRefill}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><line x1="3" y1="22" x2="15" y2="22"/></svg>
              Surtir Combustible
            </button>
            <button className="bp" style={{ padding: '7px 16px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, boxShadow: '0 2px 8px rgba(1, 102, 255, 0.25)' }} onClick={onInspect}>
              Inspeccionar
            </button>
          </div>
        );
      },

      ProgressBar: function PlantCardProgressBar() {
        const {
          state: { lastMaint, interval, elapsed, percentage, barColor, bgColor },
          actions: { onAdjustHoro }
        } = usePlantCard();

        return (
          <div style={{ 
            marginTop: 16, 
            background: 'var(--bg-elevated)', 
            padding: '12px 16px', 
            borderRadius: 10, 
            border: '1px solid var(--border)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', color: 'var(--tx2)', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span 
                onClick={onAdjustHoro} 
                style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                title="Haz clic para modificar el horómetro del último mantenimiento"
                onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--tx2)'}
              >
                <b style={{ color: 'var(--tx3)' }}>Último Mant.:</b> {formatHHMMSS(lastMaint)} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--blue)', verticalAlign: 'middle', marginLeft: 3 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </span>
              <span style={{ fontWeight: 700, color: barColor, background: bgColor, padding: '2px 8px', borderRadius: 4, border: `1px solid ${barColor}30` }}>
                {formatHHMMSS(elapsed)} transcurridas ({percentage.toFixed(0)}%)
              </span>
              <span><b style={{ color: 'var(--tx3)' }}>Próx. Límite:</b> {formatHHMMSS(lastMaint + interval)}</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--bg-deep)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 6, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      },

      History: function PlantCardHistory() {
        const {
          state: { eq, plantRecords, isExpanded, barColor },
          actions: { onSelectRecord }
        } = usePlantCard();

        if (!isExpanded || plantRecords.length === 0) return null;

        const chartSeries = [...plantRecords].reverse().map(r => {
          const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
          const label = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
          const rMeas = r.measurements?.[eq.tag] || {};
          const val = parseFloat(rMeas.horometer) || 0;
          return { label, val };
        });

        const maxVal = Math.max(...chartSeries.map(s => s.val), 1);
        const chartH = 90;
        const chartWidth = Math.max(chartSeries.length * 50 + 60, 320);

        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)', animation: 'fin 0.2s ease' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, fontWeight: 700 }}>
              Historial de Horómetros (H) — {eq.tag}
            </div>
            
            {/* SVG Bar Chart */}
            <div style={{ background: 'rgba(0,0,0,0.12)', padding: '16px 14px 10px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${chartWidth} ${chartH + 30}`} style={{ width: '100%', minWidth: chartWidth, height: 'auto', display: 'block' }}>
                {[0, 0.5, 1].map(p => (
                  <g key={p}>
                    <line x1="40" y1={chartH - chartH * p + 5} x2={chartWidth - 15} y2={chartH - chartH * p + 5} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray={p > 0 && p < 1 ? "3,3" : ""} />
                    <text x="35" y={chartH - chartH * p + 8} fill="var(--tx4)" fontSize="8.5" fontFamily="JetBrains Mono" textAnchor="end" fontWeight="500">
                      {Math.round(maxVal * p)}
                    </text>
                  </g>
                ))}
                {chartSeries.map((s, i) => {
                  const bh = Math.max(2, (s.val / maxVal) * (chartH - 15));
                  const x = i * 50 + 65;
                  const barWidth = 18;
                  return (
                    <g key={i}>
                      <rect x={x - barWidth / 2} y={chartH - bh + 5} width={barWidth} height={bh} fill={barColor} rx="2.5" opacity="0.9" />
                      <rect x={x - barWidth / 2} y={chartH - bh + 5} width={barWidth} height={bh} fill="url(#colGradientGen)" rx="2.5" opacity="0.25" />
                      {s.val > 0.01 && (
                        <text x={x} y={chartH - bh} fill="var(--tx1)" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="700">
                          {s.val}
                        </text>
                      )}
                      <text x={x} y={chartH + 18} fill="var(--tx3)" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono">{s.label}</text>
                    </g>
                  );
                })}
                <defs>
                  <linearGradient id="colGradientGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* History Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg-deep)' }}>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'left', fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'right', fontWeight: 600 }}>Horómetro</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'right', fontWeight: 600 }}>Técnico</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'center', fontWeight: 600 }}>Mantenimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {plantRecords.slice(0, 5).map((r, ri) => {
                    const rDate = r.date?.toDate ? r.date.toDate() : new Date(r.date);
                    const rDateStr = rDate.toLocaleDateString('es-VE') + ' ' + rDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
                    const rMeas = r.measurements?.[eq.tag] || {};
                    const didMaint = !!rMeas.mantenimientoRealizado;
                    return (
                      <tr key={r.id} onClick={() => onSelectRecord && onSelectRecord(r)} style={{ borderBottom: '1px solid var(--border)', background: ri % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: onSelectRecord ? 'pointer' : 'default' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{rDateStr}</td>
                        <td style={{ padding: '8px 10px', color: '#008000', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{rMeas.horometer ? formatHHMMSS(parseHours(rMeas.horometer)) : '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--tx3)', textAlign: 'right' }}>{r.technicianName || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {didMaint ? (
                            <span className="badge" style={{ background: 'rgba(0, 128, 0,.15)', color: '#008000' }}>Realizado</span>
                          ) : (
                            <span style={{ color: 'var(--tx4)', fontSize: '.75rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      },

      Notes: function PlantCardNotes() {
        const { state: { eq } } = usePlantCard();
        if (!eq.notes) return null;
        const cleanNotes = String(eq.notes).replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        return (
          <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--tx4)', fontStyle: 'italic' }}>
            * {cleanNotes}
          </div>
        );
      }
    };

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

    // ═══════════════════════════════════════════════════
    // DETALLE DE NODO
    // ═══════════════════════════════════════════════════
    function NodeDetail({ node, userProfile, onBack, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      
      const activeDraftInfo = (() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          if (!s) return null;
          const parsed = JSON.parse(s);
          return parsed.nodeId === node.id ? parsed : null;
        } catch { return null; }
      })();

      const [tab, setTab] = useState(() => {
        if (activeDraftInfo?.formType === 'plant') return 'plantas';
        return 'equipos';
      });
      const [equipment, setEquipment] = useState([]);
      const [records, setRecords] = useState([]);
      const [loading, setLoading] = useState(true);
      const [subView, setSubView] = useState(() => {
        if (activeDraftInfo?.formType === 'general') return 'newRecord';
        return 'main';
      }); // main | newRecord | recordDetail
      const [selRecord, setSelRecord] = useState(null);
      const [qrOpen, setQrOpen] = useState(false);
      const [filterType, setFilterType] = useState('all');
      const [editEq, setEditEq] = useState(null); // equipo siendo editado

      useEffect(() => {
        const u1 = db.collection('energy_nodes').doc(node.id).collection('energy_equipment')
          .onSnapshot(s => { setEquipment(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        const u2 = db.collection('energy_nodes').doc(node.id).collection('energy_records')
          .orderBy('date', 'desc').limit(40).onSnapshot(s => { setRecords(s.docs.map(d => ({ id: d.id, ...d.data() }))); });
        return () => { u1(); u2(); };
      }, [node.id]);

      const exportPDF = async () => {

        const { jsPDF } = await loadJsPDF();
        const jsPDFDoc = jsPDF || window.jspdf?.jsPDF;
        const doc = new jsPDFDoc({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pw = doc.internal.pageSize.getWidth();
        let y = 25;

        const slugify = t => t.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        const fmtDateTime = d => d?.toDate ? d.toDate().toLocaleString('es-VE') : new Date(d).toLocaleString('es-VE');

        // Header - Printer Friendly (White background)
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text('REPORTE DE ENERGÍA - AIRTEK', 15, 15);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, pw - 15, 15, { align: 'right' });
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(15, 18, pw - 15, 18);

        // Info Nodo
        doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(node.name, 15, y); y += 6;
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(`Zona: ${node.zone || '—'} | Tipo: ${(NODE_TYPES[node.type] || {}).label || node.type}`, 15, y); y += 10;

        // Equipos Activos
        doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text('EQUIPOS ACTIVOS', 15, y); y += 6;
        const actEq = sortEquipment(equipment.filter(e => e.active !== false));
        if (actEq.length === 0) {
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
          doc.text('Sin equipos registrados.', 18, y); y += 5;
        }
        actEq.forEach(eq => {
          doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          const tagPart = `• ${eq.tag}`;
          doc.text(tagPart, 18, y);
          const tw = doc.getTextWidth(tagPart);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);

          const isAC = eq.type === 'INV' || eq.type === 'ATS';
          const vInfo = isAC ? (eq.voltage ? ` ${eq.voltage}` : '') : (eq.voltageDC ? ` ${eq.voltageDC}VDC` : '');

          const infoPart = ` — ${eq.type}${vInfo}${eq.batteryType && eq.batteryType !== 'No aplica' ? ' [' + eq.batteryType + ']' : ''}`;
          doc.text(infoPart, 18 + tw + 1, y);
          y += 5; if (y > 275) { doc.addPage(); y = 25; }
        });
        y += 5;

        // Historial
        doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text('HISTORIAL DE REGISTROS', 15, y); y += 6;
        const histLimit = records.slice(0, 12);
        histLimit.forEach(r => {
          const rt = REC_TYPES[r.type] || { label: r.type, icon: '·' };
          doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          doc.text(`${rt.label} — ${fmtDate(r.date)}`, 18, y);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
          doc.text(`Técnico: ${r.technicianName || '—'}`, 120, y);
          y += 4;
          if (r.observations) {
            const obsLines = doc.splitTextToSize(`Obs: ${r.observations}`, 165);
            doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
            obsLines.forEach(l => { doc.text(l, 21, y); y += 4; if (y > 275) { doc.addPage(); y = 25; } });
          }
          y += 2; if (y > 275) { doc.addPage(); y = 25; }
        });

        // ─── GRÁFICA DE CARGAS HISTÓRICAS (Grayscale) ───
        const inspRecs = records.filter(r => (r.type === 'inspeccion' || r.type === 'actualizacion_carga') && r.measurements && Object.keys(r.measurements).length > 0).slice().reverse();
        if (inspRecs.length > 0) {
          if (y > 230) { doc.addPage(); y = 25; }
          doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
          doc.text('GRÁFICO DE CARGAS (kW)', 15, y); y += 8;

          const chartH = 35; const chartW = 170; const startX = 20; const chartY = y + chartH;
          const seriesData = inspRecs.map(r => {
            let t = 0; Object.entries(r.measurements || {}).forEach(([tag, vals]) => {
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, vals);
              t += ld.ac + ld.dc;
            });
            return { label: fmtDate(r.date).slice(0, 5), val: t };
          });
          const maxVal = Math.max(...seriesData.map(s => s.val), 0.5) * 1.2;

          doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
          doc.line(startX, chartY, startX + chartW, chartY);
          [0, 0.5, 1].forEach(p => {
            const gy = chartY - (chartH * p);
            doc.line(startX, gy, startX + chartW, gy);
            doc.setTextColor(150, 150, 150); doc.setFontSize(7);
            doc.text((maxVal * p).toFixed(1), startX - 2, gy + 1, { align: 'right' });
          });

          const barW = Math.min(12, (chartW / seriesData.length) - 4);
          seriesData.forEach((s, i) => {
            const bh = (s.val / maxVal) * chartH;
            const bx = startX + 10 + i * (chartW / seriesData.length);
            doc.setFillColor(100, 100, 100); doc.rect(bx - barW / 2, chartY - bh, barW, bh, 'F');
            doc.setTextColor(0, 0, 0); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text(s.val.toFixed(2), bx, chartY - bh - 2, { align: 'center' });
            doc.setTextColor(120, 120, 120); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(s.label, bx, chartY + 4, { align: 'center' });
          });
          y += chartH + 15;
        }

        // ─── RESUMEN DE CARGAS POR BANCO (Printer Friendly) ───
        if (inspRecs.length > 0) {
          const lastR = inspRecs[inspRecs.length - 1];
          if (y > 240) { doc.addPage(); y = 25; }
          doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
          doc.text('RESUMEN DE BANCOS Y AUTONOMÍA', 15, y); y += 8;

          const allB = new Set();
          Object.keys(lastR.measurements).forEach(tag => { const b = getBankId(tag); if (b) allB.add(b); });
          const bks = Array.from(allB).sort();

          let col = 0;
          bks.forEach(bank => {
            const bLoad = Object.entries(lastR.measurements).reduce((sum, [tag, vals]) => {
              if (getBankId(tag) !== bank) return sum;
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, vals);
              return { ac: sum.ac + ld.ac, dc: sum.dc + ld.dc };
            }, { ac: 0, dc: 0 });
            const batEq = equipment.find(e => e.type === 'BAT' && getBankId(e.tag) === bank);
            const aut = calcAutonomy(batEq, bLoad.ac, bLoad.dc);

            const cardX = 15 + col * 92;
            if (y > 260) { doc.addPage(); y = 25; }

            // Card Printer Friendly (Border only)
            doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
            doc.rect(cardX, y, 88, 24);

            doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text(`BANCO ${bank}`, cardX + 5, y + 6);

            doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
            doc.text(`Carga: ${(bLoad.ac + bLoad.dc).toFixed(2)} kW`, cardX + 5, y + 12);
            doc.text(`(AC:${bLoad.ac.toFixed(1)} DC:${bLoad.dc.toFixed(1)})`, cardX + 5, y + 17);

            doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
            doc.text(fmtHours(aut), cardX + 83, y + 12, { align: 'right' });

            if (col === 1) { y += 28; col = 0; } else col = 1;
          });
          if (col === 1) y += 28;
        }

        doc.save(`${slugify(node.name)}-historial.pdf`);
        toast('PDF generado (Versión impresión)', 'success');
      };

      const exportXLSX = async () => {

        const XLSX = await loadXLSX();
        // Hoja 1: Inspecciones y mediciones ordenadas por banco — carga por equipo + carga por banco + ATS
        const measRows = [];
        const inspRecs = records.filter(r => (r.type === 'inspeccion' || r.type === 'actualizacion_carga') && r.measurements && Object.keys(r.measurements).length > 0);
        inspRecs.forEach(r => {
          const fecha = fmtDate(r.date);
          const hora = r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
          const meas = r.measurements || {};
          // Reconstruir grupos ordenados
          const fakeEqs = sortEquipment(Object.keys(meas).map(tag => {
            const type = getEqTypeFromTag(tag, equipment);
            return { id: tag, tag, type, active: true };
          }));
          const groups = groupByBank(fakeEqs);
          groups.forEach(({ bank, eqs, bat, orphanBats }) => {
            let bankAcW = 0, bankDcW = 0;
            // Equipos del grupo
            eqs.forEach(eq => {
              const vals = meas[eq.tag] || {};
              const load = calcLoad(eq.type, vals);
              bankAcW += load.ac; bankDcW += load.dc;
              const aggLoad = load.ac + load.dc;
              const row = { 'Fecha': fecha, 'Hora': hora, 'Banco': bank || '—', 'Equipo': eq.tag, 'Tipo': eq.type, 'Carga (kW)': aggLoad > 0 ? aggLoad.toFixed(3) : '' };
              // ATS: L1, L2, N
              if (eq.type === 'ATS' || eq.type === 'BKR') { row['L1 (A)'] = vals.L1 || ''; row['L2 (A)'] = vals.L2 || ''; row['L3 (A)'] = vals.L3 || ''; row['N (A)'] = vals.N || ''; }
              measRows.push(row);
            });
            // Banco BAT con V banco
            const totalGrpW = bankAcW + bankDcW;
            const batEq = bat ? (equipment.find(e => e.tag === bat.tag) || bat) : (equipment.find(e => e.type === 'BAT' && getBankId(e.tag) === bank) || null);
            if (batEq) {
              const vals = (bat && meas[bat.tag]) ? meas[bat.tag] : {};
              const aut = totalGrpW > 0 ? calcAutonomy(batEq, bankAcW, bankDcW) : null;
              measRows.push({
                'Fecha': fecha, 'Hora': hora, 'Banco': bank || '—', 'Equipo': batEq.tag, 'Tipo': 'BAT',
                'Carga (kW)': '', 'V Banco (VDC)': vals.V_banco || '', 'I Banco (A)': vals.I_banco || '',
                'Autonomía (h)': aut ? aut.toFixed(2) : ''
              });
            }
            // Carga total del banco
            if (bank && bank !== '_ats' && totalGrpW > 0) {
              measRows.push({ 'Fecha': fecha, 'Hora': hora, 'Banco': bank, 'Equipo': '→ TOTAL BANCO', 'Tipo': '', 'Carga (kW)': totalGrpW.toFixed(3) });
            }
          });
        });
        // Hoja 2: Resumen
        const recRows = inspRecs.map(r => ({
          'Fecha': fmtDate(r.date),
          'Hora': r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '',
          'Turno': r.shift === 'dia' ? 'Día' : 'Noche',
          'Observaciones': r.observations || '',
        }));
        const eqRows = equipment.map(e => ({
          'Tag': e.tag, 'Tipo': e.type,
          'Tensión AC': e.voltage || '',
          'Tensión DC': e.voltageDC || '',
          'Panel Solar': e.hasSolar ? 'Sí' : 'No', 'Batería': e.batteryType || '',
          'Capacidad (Ah)': e.batCapacity || '', 'N° Baterías': (e.batCount ? (e.batteryType === 'NMC' ? `${e.batCount} celdas (${Math.floor(e.batCount / 7)} bat.)` : `${e.batCount}`) : ''), 'Tipo Celda': e.batCellType || '',
          'Estado': e.active !== false ? 'Activo' : 'Retirado',
          'Instalado': fmtDate(e.installedAt), 'Instalado por': e.installedBy || '',
          'Notas': e.notes || '',
        }));
        // Hoja 4: Historial de Cargas (Matriz de bancos)
        const histRows = inspRecs.map(r => {
          const row = { 'Fecha': fmtDate(r.date), 'Hora': r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '' };
          let totalNodo = 0;
          Object.entries(r.measurements || {}).forEach(([tag, vals]) => {
            const type = getEqTypeFromTag(tag, equipment);
            const ld = calcLoad(type, vals);
            const lTot = ld.ac + ld.dc;
            totalNodo += lTot;
            const b = getBankId(tag);
            if (b) {
              const k = `Banco ${b} (kW)`;
              row[k] = parseFloat(((row[k] || 0) + lTot).toFixed(3));
            }
          });
          row['TOTAL NODO (kW)'] = totalNodo.toFixed(3);
          return row;
        });

        const wb = XLSX.utils.book_new();
        if (histRows.length) {
          const wsHist = XLSX.utils.json_to_sheet(histRows);
          XLSX.utils.book_append_sheet(wb, wsHist, 'Historial Cargas');
        }
        if (measRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(measRows), 'Inspecciones');
        if (recRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recRows), 'Resumen');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eqRows), 'Equipos');
        XLSX.writeFile(wb, `${slugify(node.name)}-datos.xlsx`);
        toast('Excel generado', 'success');
      };

      const tc = NODE_TYPES[node.type] || { label: '—', color: '#64748b' };
      const filtered = filterType === 'all' ? records : records.filter(r => r.type === filterType);
      const canWrite = ['tecnico', 'admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) ||
        (userProfile?.email || '').toLowerCase().includes('robert') ||
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') ||
        (userProfile?.name || '').toLowerCase().includes('robert');

      if (subView === 'newRecord') return <RecordForm nodeId={node.id} nodeName={node.name} equipment={equipment} userProfile={userProfile} onSave={() => setSubView('main')} onCancel={() => setSubView('main')} toast={toast} />;
      if (subView === 'recordDetail' && selRecord) return <RecordDetail record={selRecord} nodeId={node.id} nodeName={node.name} equipment={equipment} userProfile={userProfile} onBack={() => setSubView('main')} toast={toast} />;

      const saveEditEq = async (data) => {
        try {
          const updateData = { ...data };
          if (typeof updateData.notes === 'string') updateData.notes = sanitize(updateData.notes);
          if (typeof updateData.capacity === 'string') updateData.capacity = sanitize(updateData.capacity);
          if (typeof updateData.phases === 'string') updateData.phases = sanitize(updateData.phases);
          if (typeof updateData.voltage === 'string') updateData.voltage = sanitize(updateData.voltage);
          if (typeof updateData.voltageDC === 'string') updateData.voltageDC = sanitize(updateData.voltageDC);
          if (typeof updateData.serial === 'string') updateData.serial = sanitize(updateData.serial);
          if (typeof updateData.tag === 'string') updateData.tag = sanitize(updateData.tag);
          if (typeof updateData.batteryType === 'string') updateData.batteryType = sanitize(updateData.batteryType);
          if (typeof updateData.batCapacity === 'string') updateData.batCapacity = sanitize(updateData.batCapacity);
          if (typeof updateData.batCount === 'string') updateData.batCount = sanitize(updateData.batCount);
          if (typeof updateData.batCellType === 'string') updateData.batCellType = sanitize(updateData.batCellType);

          if (!updateData.notes || (typeof updateData.notes === 'string' && updateData.notes.trim() === '')) {
            updateData.notes = firebase.firestore.FieldValue.delete();
          }
          if (!updateData.batCapacity || String(updateData.batCapacity).trim() === '') {
            updateData.batCapacity = firebase.firestore.FieldValue.delete();
          }
          if (!updateData.batCount || String(updateData.batCount).trim() === '') {
            updateData.batCount = firebase.firestore.FieldValue.delete();
          }
          // For GEN: preserve capacity and phases, sync horometer & mtto
          if (editEq.type === 'GEN') {
            if (!updateData.capacity || String(updateData.capacity).trim() === '') updateData.capacity = firebase.firestore.FieldValue.delete();
            if (!updateData.phases || String(updateData.phases).trim() === '') updateData.phases = firebase.firestore.FieldValue.delete();
            if (updateData.horometer !== undefined) {
              try {
                const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
                ch[editEq.tag] = {
                  ...(ch[editEq.tag] || {}),
                  horometro_actual: updateData.horometer,
                  horometro_mtto: updateData.lastMaintenanceHorometer,
                  updatedAt: new Date().toISOString()
                };
                localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(ch));
              } catch(e) {}
              try {
                const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                const idx = tk.findIndex(t => t.tag === editEq.tag);
                if (idx !== -1) {
                  tk[idx].horometro_actual = updateData.horometer;
                  localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
                }
              } catch(e) {}
              window.dispatchEvent(new CustomEvent('airtek_horo_updated', {
                detail: { plantTag: editEq.tag, horometer: updateData.horometer, lastMaint: updateData.lastMaintenanceHorometer }
              }));
            }
          }
          await db.collection('energy_nodes').doc(node.id).collection('energy_equipment').doc(editEq.id).update(updateData);
          toast('Equipo actualizado.', 'success');
          setEditEq(null);
        } catch (e) { toast('Error al guardar.', 'error'); }
      };

      return (
        <div className="fin">
          {qrOpen && <QRModal node={node} onClose={() => setQrOpen(false)} />}
          {editEq && <EditEqModal eq={editEq} userProfile={userProfile} onSave={saveEditEq} onClose={() => setEditEq(null)} 
            onDelete={async (id) => {
              try {
                await db.collection('energy_nodes').doc(node.id).collection('energy_equipment').doc(id).delete();
                toast('Equipo eliminado.', 'success');
                setEditEq(null);
              } catch (e) { toast('Error: ' + e.message, 'error'); }
            }} 
          />}

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, flexShrink: 0 }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tx1)', lineHeight: 1.2 }}>{node.name}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="badge" style={{ background: tc.color + '22', color: tc.color }}>{tc.label}</span>
                  <span style={{ color: 'var(--tx3)', fontSize: '.8rem' }}><IconMapPin size={14} />{node.zone}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="bs" style={{ padding: '6px 12px', fontSize: '.78rem' }} onClick={() => setQrOpen(true)}>QR</button>
              {canWrite && <button className="bp" style={{ padding: '7px 14px', fontSize: '.8rem' }} onClick={() => setSubView('newRecord')}>+ Registro</button>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Equipos Activos', val: equipment.filter(e => e.active !== false).length, c: '#008000' },
              { label: 'Registros', val: records.length, c: '#0166ff' },
              { label: 'Última Visita', val: records[0] ? fmtDate(records[0].date) : '—', c: '#0166ff', sm: true },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 13px' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: "'Outfit', 'Montserrat', sans-serif", marginBottom: 4 }}>{s.label}</div>
                <div className={s.sm ? '' : 'fm'} style={{ fontSize: s.sm ? '.85rem' : '1.4rem', fontWeight: 700, color: s.c }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 16, display: 'flex', overflowX: 'auto' }}>
            {[['equipos', 'Equipos'], ['plantas', 'Plantas Eléctricas'], ['historial', 'Historial'], ['cargas', 'Cargas'], ['docs', 'Docs'], ['alertas', 'Alertas'], ['eventos', 'Eventos'], ['exportar', 'Exportar']].map(([k, lbl]) => (
              <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} style={{ whiteSpace: 'nowrap' }}>{lbl}</button>
            ))}
          </div>

          {/* TAB EQUIPOS */}
          {tab === 'equipos' && (
            <div>
              {loading ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 50 }}>Cargando equipos...</div>
                : equipment.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 50 }}>
                    <p style={{ color: 'var(--tx3)', marginBottom: 14 }}>No hay equipos registrados en este nodo.</p>
                    {canWrite && <button className="bp" onClick={() => setSubView('newRecord')}>Registrar Instalación</button>}
                  </div>
                ) : ['active', 'retired'].map(status => {
                  const eqs = sortEquipment(equipment.filter(e => status === 'active' ? e.active !== false : e.active === false));
                  if (!eqs.length) return null;
                  return (
                    <div key={status} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                        {status === 'active' ? 'Activos' : 'Retirados'}
                      </div>
                      {eqs.map(eq => {
                        const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;
                        return (
                          <div key={eq.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', opacity: status === 'retired' ? .5 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                              <span className="fm" style={{ fontSize: '.92rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                              {(eq.type === 'INV' || eq.type === 'ATS' || eq.type === 'BKR') && eq.voltage && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltage}</span>}
                              {eq.type === 'BKR' && eq.phases && <span style={{ color: '#6366f1', fontSize: '.73rem', fontWeight: 600 }}>{eq.phases === '3' || eq.phases === 'Trifásica' ? '3Φ (3 Líneas)' : eq.phases === '1' || eq.phases === 'Monofásica' ? '1Φ (1 Línea)' : '2Φ (2 Líneas)'}</span>}
                              {eq.type === 'BKR' && eq.capacity && <span style={{ color: '#6366f1', fontSize: '.73rem', fontWeight: 700 }}>{eq.capacity}A</span>}
                              {(eq.type === 'BAT' || eq.type === 'ETP') && eq.voltageDC && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltageDC} VDC</span>}
                              {eq.hasAcIn && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>AC/IN</span>}
                              {eq.hasAcOut && <span style={{ color: '#008000', fontSize: '.73rem' }}>AC/OUT</span>}
                              {eq.hasDcOut && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>DC/OUT</span>}
                              {eq.hasSolar && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>{eq.pvCount > 1 ? `PV (${eq.pvCount})` : 'PV'}</span>}
                              {eq.type === 'ETP' && eq.solarRegPercentage && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>{eq.solarRegPercentage}%</span>}
                              {eq.batteryType && eq.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>{eq.batteryType}</span>}
                              {eq.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>{eq.batCapacity}Ah</span>}
                              {eq.batCount && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>
                                {eq.batteryType === 'NMC' ? `${eq.batCount} celdas (${Math.floor(eq.batCount / 7)} bat.)` : `${eq.batCount} bat.`}
                              </span>}
                              {eq.batCellType && eq.batCellType !== 'No aplica' && <span style={{ color: '#64748b', fontSize: '.73rem' }}>{eq.batCellType}</span>}
                              {eq.type === 'GEN' && eq.capacity && <span style={{ color: '#eab308', fontSize: '.73rem', fontWeight: 700 }}>{eq.capacity} KVA</span>}
                              {eq.type === 'GEN' && eq.phases && <span style={{ color: '#eab308', fontSize: '.73rem' }}>{eq.phases === 'Monofásica' ? '1Φ' : '3Φ'} {eq.phases}</span>}
                              {eq.type === 'GEN' && (() => {
                                let list = INITIAL_FUEL_TANKS;
                                try {
                                  const s = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                                  if (s.length > 0) list = s;
                                } catch(e) {}
                                const norm = normalizeNodeName(node.name);
                                const siteTanks = list.filter(t => normalizeNodeName(t.lugar) === norm);
                                const plantTank = siteTanks.find(t => t.tag === eq.tag) || siteTanks[0];
                                const sharedRes = siteTanks.reduce((m, t) => Math.max(m, parseFloat(t.reserva_lts) || 0), 0);
                                const capRes = siteTanks.reduce((m, t) => Math.max(m, parseFloat(t.cap_reserva_lts != null ? t.cap_reserva_lts : t.cap_reserva) || 0), 0);
                                const subAct = plantTank ? (parseFloat(plantTank.subtanque_actual != null ? plantTank.subtanque_actual : plantTank.tanque_lts) || 0) : 0;
                                const subCap = plantTank ? (parseFloat(plantTank.tanque_lts) || 0) : 0;
                                return (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: 6, 
                                    fontSize: '.72rem', 
                                    fontWeight: 600, 
                                    background: 'rgba(1, 102, 255, 0.08)', 
                                    color: 'var(--blue)', 
                                    padding: '2px 8px', 
                                    borderRadius: 6,
                                    border: '1px solid rgba(1, 102, 255, 0.2)'
                                  }}>
                                    <span>Tanque: <strong>{subAct}/{subCap}L</strong></span>
                                    {capRes > 0 && <span>| Reserva: <strong style={{ color: sharedRes > 0 ? '#10b981' : '#ef4444' }}>{sharedRes}/{capRes}L</strong></span>}
                                  </span>
                                );
                              })()}
                              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--tx4)', fontSize: '.72rem' }}>{fmtDate(eq.installedAt)}</span>
                                {canWrite && <button onClick={() => setEditEq(eq)}
                                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--tx3)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '.72rem', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                                  Editar
                                </button>}
                              </span>
                            </div>
                            {eq.notes && <div style={{ marginTop: 6, fontSize: '.78rem', color: 'var(--tx3)' }}>{eq.notes}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}

          {/* TAB PLANTAS */}
          {tab === 'plantas' && <NodePlantas nodeId={node.id} nodeName={node.name} nodeType={node.type} equipment={equipment} records={records} userProfile={userProfile} toast={toast} onSubViewChange={setSubView} setSelRecord={setSelRecord} />}

          {/* TAB CARGAS */}
          {tab === 'cargas' && <LoadChart records={records} equipment={equipment} onExport={exportXLSX} />}

          {/* TAB DOCS */}
          {tab === 'docs' && <NodeDocs nodeId={node.id} userProfile={userProfile} toast={toast} />}

          {/* TAB HISTORIAL */}
          {tab === 'historial' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(REC_TYPES)].map(k => {
                  const rt = REC_TYPES[k];
                  const active = filterType === k;
                  return (
                    <button key={k} onClick={() => setFilterType(k)}
                      style={{
                        padding: '4px 10px', borderRadius: 5, border: '1px solid', fontSize: '.74rem', cursor: 'pointer', fontFamily: "'Outfit', 'Montserrat', sans-serif", fontWeight: 600, transition: 'all .15s',
                        background: active ? (k === 'all' ? '#26262a' : (rt?.color || '#64748b')) : 'transparent',
                        borderColor: k === 'all' ? '#323236' : (rt?.color || '#64748b'),
                        color: active ? '#fff' : (k === 'all' ? 'var(--tx3)' : (rt?.color || '#64748b'))
                      }}>
                      {k === 'all' ? 'Todos' : rt.label}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0
                ? <div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--tx3)' }}>No hay registros{filterType !== 'all' ? ' de este tipo' : ''}.</p></div>
                : filtered.map(r => {
                  const rt = REC_TYPES[r.type] || { label: r.type, icon: '', color: '#64748b' };
                  return (
                    <div key={r.id} className="card rrow" style={{ marginBottom: 8, border: '1px solid var(--border)' }}
                      onClick={() => { setSelRecord(r); setSubView('recordDetail'); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            
                            <span className="fd" style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--tx1)' }}>{rt.label}</span>
                            
                          </div>
                          <div style={{ fontSize: '.8rem', color: 'var(--tx3)' }}>{r.technicianName} · {fmtDate(r.date)}</div>
                          {r.observations && <div style={{ fontSize: '.76rem', color: 'var(--tx4)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{r.observations}</div>}
                        </div>
                        <span style={{ color: 'var(--border-bright)', fontSize: 20 }}>›</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* TAB ALERTAS */}
          {tab === 'alertas' && <NodeAlerts nodeId={node.id} nodeName={node.name} userProfile={userProfile} toast={toast} />}

          {/* TAB EVENTOS */}
          {tab === 'eventos' && <NodeEvents nodeId={node.id} nodeName={node.name} userProfile={userProfile} toast={toast} />}

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

          {/* TAB EXPORTAR */}
          {tab === 'exportar' && (
            <div>
              <p style={{ color: 'var(--tx3)', fontSize: '.9rem', marginBottom: 20 }}>Exporta toda la información registrada de este nodo.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {[
                  { label: 'PDF', desc: 'Reporte completo con mediciones, equipos e historial', fn: exportPDF, cls: 'bs', renderIcon: () => <IconPdf size={26} color="#ef4444" />, badgeBg: 'rgba(239, 68, 68, 0.12)' },
                  { label: 'Excel', desc: 'Tablas separadas: registros y equipos para análisis', fn: exportXLSX, cls: 'bs', renderIcon: () => <IconExcel size={26} color="#10b981" />, badgeBg: 'rgba(16, 185, 129, 0.12)' },
                ].map(x => (
                  <div key={x.label} className="card" style={{ textAlign: 'center', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ width: 54, height: 54, borderRadius: '50%', background: x.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        {x.renderIcon()}
                      </div>
                      <div className="fd" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--tx1)', marginBottom: 6 }}>{x.label}</div>
                      <div style={{ color: 'var(--tx3)', fontSize: '.8rem', marginBottom: 20, maxWidth: 300, lineHeight: 1.4 }}>{x.desc}</div>
                    </div>
                    <button className={x.cls} style={{ width: 'auto', minWidth: 160, padding: '9px 24px', fontSize: '.84rem' }} onClick={x.fn}>
                      Descargar {x.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    //  LISTA DE NODOS (DASHBOARD PRINCIPAL)
    // ═══════════════════════════════════════════════════
    
    function IconSliders({ size = 18, color = "currentColor" }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
    }

    function NodeList({ userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [nodes, setNodes] = useState([]);
      const [loading, setLoading] = useState(true);
      const [sel, setSel] = useState(null);
      const [search, setSearch] = useState('');
      const [fType, setFType] = useState('all');
      const [showFilters, setShowFilters] = useState(false);
      const [fState, setFState] = useState('all');
      const [activeInspection, setActiveInspection] = useState(() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          return s ? JSON.parse(s) : null;
        } catch { return null; }
      });

      // Refrescar estado de borrador al volver a la pestaña
      useEffect(() => {
        const updateActive = () => {
          try {
            const s = localStorage.getItem('airtek_active_inspection');
            setActiveInspection(s ? JSON.parse(s) : null);
          } catch {}
        };
        window.addEventListener('focus', updateActive);
        document.addEventListener('visibilitychange', updateActive);
        return () => {
          window.removeEventListener('focus', updateActive);
          document.removeEventListener('visibilitychange', updateActive);
        };
      }, []);

      const resumeInspection = () => {
        if (!activeInspection) return;
        const node = nodes.find(n => n.id === activeInspection.nodeId);
        if (node) {
          setSel(node);
        } else {
          toast('No se encontró el nodo del borrador', 'warn');
        }
      };

      const discardActiveInspection = () => {
        try {
          if (activeInspection?.key) localStorage.removeItem(activeInspection.key);
          localStorage.removeItem('airtek_active_inspection');
          setActiveInspection(null);
          toast('Borrador descartado', 'info');
        } catch (e) {}
      };

      const isFiltered = search !== '' || fState !== 'all' || fType !== 'all';

      const resetFilters = () => {
        setSearch('');
        setFState('all');
        setFType('all');
      };

      useEffect(() => {
        const u = db.collection('energy_nodes').where('active', '==', true).onSnapshot(s => {
          setNodes(s.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
        return u;
      }, []);

      // Deep link via ?node=id
      useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const nid = p.get('node');
        if (nid && nodes.length > 0) { const n = nodes.find(n => n.id === nid); if (n) setSel(n); }
      }, [nodes]);

      // Vercel Best Practice: rerender-use-deferred-value & rerender-memo - Keeps typing responsive and caches results
      const deferredSearch = useDeferredValue(search);

      const normalizeLoc = useCallback((loc) => {
        const l = (loc || '').trim().toLowerCase();
        if (l === 'falcon' || l === 'falcón') return 'Falcón';
        if (l === 'lara') return 'Lara';
        if (l === 'colombia') return 'Colombia';
        return 'Zulia';
      }, []);

      const filtered = useMemo(() => {
        const q = (deferredSearch || '').toLowerCase().trim();
        const fStateLow = fState.toLowerCase();
        return nodes.filter(n => {
          if (q) {
            const nameMatch = (n.name || '').toLowerCase().includes(q);
            const zoneMatch = (n.zone || '').toLowerCase().includes(q);
            if (!nameMatch && !zoneMatch) return false;
          }
          if (fType !== 'all' && n.type !== fType) return false;
          if (fState === 'all') return true;

          const loc = normalizeLoc(n.estado);
          if (fState === 'Venezuela') return loc !== 'Colombia';
          if (fState === 'Colombia') return loc === 'Colombia';
          return loc.toLowerCase() === fStateLow || (fStateLow.startsWith('falco') && loc === 'Falcón');
        });
      }, [nodes, deferredSearch, fType, fState, normalizeLoc]);

      if (sel) return <NodeDetail node={sel} userProfile={userProfile} onBack={() => setSel(null)} toast={toast} />;

      return (
        <div className="fin">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="fd" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--tx1)' }}>Sistema de Gestión de Energía</h1>
              <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>{nodes.length} ubicaciones activas registradas en la red</p>
            </div>
          </div>
          {/* Banner de Borrador Activo */}
          {activeInspection && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconChecklist size={22} color="#f59e0b" />
                <div>
                  <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '.92rem' }}>
                    Inspección en progreso: {activeInspection.nodeName}
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                    {activeInspection.formType === 'plant' ? `Planta ${activeInspection.plantTag}` : 'Inspección general de equipos'} · Guardado local {activeInspection.savedAt ? new Date(activeInspection.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bp" style={{ padding: '8px 16px', fontSize: '.82rem' }} onClick={resumeInspection}>
                  Continuar Inspección →
                </button>
                <button className="bs" style={{ padding: '8px 12px', fontSize: '.82rem', borderColor: 'rgba(239,68,68,.4)', color: '#ef4444' }} onClick={discardActiveInspection}>
                  Descartar
                </button>
              </div>
            </div>
          )}

          {/* Search Bar & Filter Button (Only Filter Button Visible Initially) */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--tx3)', display: 'flex', alignItems: 'center', pointerEvents: 'none'
              }}>
                <IconSearch size={17} />
              </span>
              <input 
                className="fi" 
                style={{ paddingLeft: 40, paddingRight: search ? 36 : 14, borderRadius: 24, height: 42 }} 
                placeholder="Buscar Datacenter, nodo o sede..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              title="Filtros de búsqueda"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: (showFilters || isFiltered) ? 'rgba(1, 102, 255, 0.12)' : 'var(--bg-surface)',
                border: '1px solid',
                borderColor: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--border)',
                color: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--tx2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <IconSliders size={19} />
            </button>
          </div>

          {/* Expandable Filter Drawer */}
          {(showFilters || isFiltered) && (
            <div 
              className="fin"
              style={{ 
                marginBottom: 20, 
                padding: '14px 16px', 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border)', 
                borderRadius: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 14, 
                flexWrap: 'wrap' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Ubicación:</span>
                <select 
                  className="fi" 
                  style={{ width: 180, borderRadius: 20, height: 38, padding: '0 12px' }} 
                  value={fState} 
                  onChange={e => setFState(e.target.value)}
                >
                  <option value="all">Todas las ubicaciones</option>
                  <optgroup label="Venezuela">
                    <option value="Venezuela">Toda Venezuela</option>
                    <option value="Zulia">Zulia</option>
                    <option value="Falcón">Falcón</option>
                    <option value="Lara">Lara</option>
                  </optgroup>
                  <optgroup label="Colombia">
                    <option value="Colombia">Colombia</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Tipo:</span>
                <div className="segmented-control">
                  {['all', ...Object.keys(NODE_TYPES)].map(t => {
                    const nt = NODE_TYPES[t];
                    const on = fType === t;
                    return (
                      <button 
                        key={t} 
                        onClick={() => setFType(t)}
                        className={`segmented-btn ${on ? 'active' : ''}`}
                      >
                        {t === 'all' ? 'Todos los nodos' : nt.label.toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isFiltered && (
                <button
                  onClick={resetFilters}
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(245, 91, 93, 0.1)',
                    border: '1px solid rgba(245, 91, 93, 0.3)',
                    color: '#f55b5d',
                    fontSize: '.78rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  Limpiar filtro
                </button>
              )}
            </div>
          )}
          {loading ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>Cargando nodos...</div>
            : filtered.length === 0 ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>No se encontraron nodos.</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
                  {filtered.map(n => {
                    const tc = NODE_TYPES[n.type] || { label: '—', color: '#64748b' };
                    return (
                      <div key={n.id} className="card ncard" style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
                        onClick={() => setSel(n)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <span className="badge" style={{ background: tc.color + '22', color: tc.color }}>{tc.label}</span>
                          <span style={{ color: 'var(--border-bright)', fontSize: 20 }}>›</span>
                        </div>
                        <div className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)', marginBottom: 4, lineHeight: 1.3 }}>{n.name}</div>
                        <div style={{ color: 'var(--tx4)', fontSize: '.8rem' }}><IconMapPin size={14} />{n.zone}</div>
                      </div>
                    );
                  })}
                </div>
              )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // AGREGAR USUARIO EXISTENTE
    // ═══════════════════════════════════════════════════

export default NodeList;
export {
  NodeList, NodeDetail, NodePlantas, RecordForm, RecordDetail,
  ReportModal, QRModal, EqMeasurements, EditEqModal, NodeDocs,
  NodeAlerts, NodeEvents, PlantRecordForm, CalibrateHoroModal,
  PlantCard, MeasurementDisplayCard, LoadChart
};
