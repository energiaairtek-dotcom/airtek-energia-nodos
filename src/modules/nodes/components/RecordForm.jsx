import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useTransition } from 'react';
import firebase, { db, TS } from '@/services/firebase';
import { NODE_TYPES, EQ_TYPES, REC_TYPES, BAT_TYPES, BAT_CELL_TYPES } from '@/config/constants';
import { parseHours, formatHHMMSS, sanitize, normalizeNodeName } from '@/utils/formatters';
import { sortEquipment, getEqTypeFromTag, groupByBank, calcLoad, calcAutonomy, fmtHours, checkAtsAlarms } from '@/utils/energyCalculations';
import { persistNodeFuelUpdate, generateFuelReportText, revertFuelTanks, INITIAL_FUEL_TANKS } from '@/modules/fuel/fuelUtils';
import { computeDispatchLevels, validateDispatch } from '@/modules/fuel/fuelCalc';
import { useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { sendNotificationAlert } from '@/services/email';
import { MeasurementDisplayCard } from '@/modules/nodes/components/MeasurementDisplayCard';
import { InfoItem } from '@/modules/nodes/components/InfoItem';
import { ReportModal } from '@/modules/nodes/components/ReportModal';
import { MF } from '@/modules/nodes/components/MF';
import { PersonnelMultiSelect } from '@/modules/nodes/components/PersonnelMultiSelect';
import { generateReportText } from '@/utils/reportText';
import { IconCopy } from '@/components/icons';
import { EqMeasurements } from '@/modules/nodes/components/EqMeasurements';

function RecordForm({ nodeId, nodeName, equipment, userProfile, onSave, onCancel, toast, initialType = 'inspeccion' }) {
      const DRAFT_KEY = `airtek_draft_general_${nodeId}`;
      
      const getDraft = () => {
        try {
          const saved = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(`energy_draft_${nodeId}_general`);
          return saved ? JSON.parse(saved) : null;
        } catch (e) { return null; }
      };

      const initialDraft = getDraft();

      // Detectar si el técnico viene del botón "Surtir Combustible" de una planta
      const preSurtido = (() => {
        try {
          const s = localStorage.getItem('airtek_presurtido');
          if (s) {
            localStorage.removeItem('airtek_presurtido');
            return JSON.parse(s);
          }
        } catch(e) {}
        return null;
      })();

      const [type, setType] = useState(() => preSurtido ? 'surtido' : (initialDraft?.type || initialType));
      const [date, setDate] = useState(() => initialDraft?.date || new Date().toISOString().slice(0, 16));
      const [shift, setShift] = useState(() => initialDraft?.shift || 'dia');
      const [obs, setObs] = useState(() => initialDraft?.obs || '');
      const [participants, setParticipants] = useState(() => initialDraft?.participants || '');
      const [meas, setMeas] = useState(() => initialDraft?.meas || {});
      const [saving, setSaving] = useState(false);
      const authorizedStaff = useAuthorizedStaff(userProfile);
      const [selPlantTag, setSelPlantTag] = useState(() => preSurtido?.plantTag || initialDraft?.selPlantTag || '');
      const [fuelDest, setFuelDest] = useState(() => initialDraft?.fuelDest || (preSurtido ? 'Surtido Planta' : 'Surtido Reserva'));
      const [fuelLts, setFuelLts] = useState(() => initialDraft?.fuelLts || '');
      const [fuelLtsPlanta, setFuelLtsPlanta] = useState(() => initialDraft?.fuelLtsPlanta || '');
      const [fuelLtsReserva, setFuelLtsReserva] = useState(() => initialDraft?.fuelLtsReserva || '');
      const [fuelHoro, setFuelHoro] = useState(() => initialDraft?.fuelHoro || '');
      const [adjustSub, setAdjustSub] = useState(() => initialDraft?.adjustSub || '');
      const [adjustRes, setAdjustRes] = useState(() => initialDraft?.adjustRes || '');
      const [adjustMotivo, setAdjustMotivo] = useState(() => initialDraft?.adjustMotivo || 'Medición física con vara en sitio');

      // Obtener los niveles actuales del nodo para la Tabla de la Verdad con agregación inteligente de reserva
      const nodeTankInfo = useMemo(() => {
        const norm = normalizeNodeName;
        const targetNorm = norm(nodeName);

        let list = INITIAL_FUEL_TANKS;
        try {
          const savedTanks = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          if (savedTanks.length > 0) list = savedTanks;
        } catch(e) {}

        const matchingTanks = list.filter(t => {
          const tLugarNorm = norm(t.lugar);
          return tLugarNorm === targetNorm || t.lugar?.toLowerCase() === (nodeName || '').toLowerCase() || (targetNorm && tLugarNorm.includes(targetNorm)) || (tLugarNorm && targetNorm.includes(tLugarNorm));
        });

        // La reserva de un nodo/datacenter es compartida para todas sus plantas
        const siteReserva = matchingTanks.reduce((max, t) => Math.max(max, parseFloat(t.reserva_lts) || 0), 0);
        const siteCapReserva = matchingTanks.reduce((max, t) => Math.max(max, parseFloat(t.cap_reserva || t.cap_reserva_lts) || 0), 0);

        // Tanque de la planta específica seleccionada
        let selPlantTank = null;
        if (selPlantTag) {
          selPlantTank = matchingTanks.find(t => t.tag === selPlantTag);
        }
        if (!selPlantTank && matchingTanks.length > 0) {
          selPlantTank = matchingTanks[0];
        }

        const subActual = selPlantTank ? (parseFloat(selPlantTank.subtanque_actual) || parseFloat(selPlantTank.tanque_lts) || 300) : 300;
        const subCap = selPlantTank ? (parseFloat(selPlantTank.tanque_lts) || 300) : 300;

        return {
          tanque_lts: subCap,
          subtanque_actual: subActual,
          cap_reserva_lts: siteCapReserva,
          reserva_lts: siteReserva,
          consumo_lh: selPlantTank?.consumo_lh || 10,
          tag: selPlantTank?.tag || selPlantTag,
          lugar: selPlantTank?.lugar || nodeName
        };
      }, [nodeName, selPlantTag]);

      const curSub = parseFloat(nodeTankInfo.subtanque_actual || nodeTankInfo.tanque_lts) || 0;
      const curRes = parseFloat(nodeTankInfo.reserva_lts) || 0;

      useEffect(() => {
        if (type === 'ajuste_combustible') {
          if (!adjustSub && curSub != null) setAdjustSub(String(curSub));
          if (!adjustRes && curRes != null) setAdjustRes(String(curRes));
        }
      }, [type, curSub, curRes]);

      // Cálculo puro compartido con el modal de surtidos (src/modules/fuel/fuelCalc.js)
      const calcResultingLevels = () => {
        const levels = computeDispatchLevels({
          destino: fuelDest,
          litros: fuelLts,
          litrosPlanta: fuelLtsPlanta,
          litrosReserva: fuelLtsReserva,
          curSub,
          curRes,
          subCap: parseFloat(nodeTankInfo?.tanque_lts) || 300,
          resCap: parseFloat(nodeTankInfo?.cap_reserva_lts) || 0,
        });

        // Total real del nodo: subtanque de esta planta + resto de subtanques + reserva
        const otherSubs = (nodeTankInfo.matchingTanks || [])
          .filter(t => t.tag !== selPlantTag)
          .reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
        const newTotal = levels.newSub + otherSubs + levels.newRes;

        return {
          ...levels,
          newTotal,
          addedTotalDespacho: levels.addedTotal,
          otherSubs,
          sumAllSubs: levels.newSub + otherSubs,
        };
      };

      const { newSub: resultingSub, newRes: resultingRes, newTotal: resultingTotal, addedTotalDespacho, ltsP: resultingLtsP, ltsR: resultingLtsR } = calcResultingLevels();
      const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?.savedAt ? new Date(initialDraft.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null);
      const [eqAction, setEqA] = useState(() => initialDraft?.eqAction || {
        tag: '', type: 'INV', voltage: '220V', voltageDC: '', hasAcIn: false, hasAcOut: true, hasDcOut: false, hasSolar: false, pvCount: 1,
        batteryType: 'LFP', batCapacity: '', batCount: '', batCellType: 'No aplica', notes: '', serial: '',
        batSoH: '', batDoD: '', batSerials: [], solarRegPercentage: '', invMode: 'Cargador/Descargador',
        capacity: '', phases: '', horometer: '', lastMaintenanceHorometer: '', maintenanceInterval: 250
      });

      // Guardar borrador en localStorage automáticamente ante cambios
      const saveDraftToStorage = useCallback(() => {
        try {
          const hasData = (obs && obs.trim()) || (participants && participants.trim()) || Object.keys(meas).length > 0 || eqAction.tag;
          if (!hasData) return;
          const now = new Date();
          const draft = {
            type, date, shift, obs, participants, meas, eqAction,
            nodeId, nodeName, formType: 'general',
            savedAt: now.toISOString()
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          localStorage.setItem('airtek_active_inspection', JSON.stringify({
            nodeId, nodeName, formType: 'general', key: DRAFT_KEY, savedAt: now.toISOString()
          }));
          setLastSavedTime(now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        } catch (e) {
          // silenciado
        }
      }, [type, date, shift, obs, participants, meas, eqAction, nodeId, nodeName, DRAFT_KEY]);

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
          localStorage.removeItem(`energy_draft_${nodeId}_general`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          const active = localStorage.getItem('airtek_active_inspection');
          if (active && JSON.parse(active)?.key === DRAFT_KEY) {
            localStorage.removeItem('airtek_active_inspection');
          }
        } catch (e) {}
        setMeas({});
        setObs('');
        setParticipants('');
        setLastSavedTime(null);
        toast('Borrador eliminado', 'info');
      };

      const onBatTypeChange = (val) => {
        let vdc = '';
        if (val === 'LFP') vdc = '48';
        else if (val === 'NMC') vdc = '52.5';
        else if (val.includes('GEL')) vdc = '48';
        setEqA({ ...eqAction, batteryType: val, voltageDC: vdc });
      };

      const [reportData, setReportData] = useState(null);
      const [savedSurtidoReport, setSavedSurtidoReport] = useState(null);

      const updM = (tag, k, v) => setMeas(p => ({ ...p, [tag]: { ...(p[tag] || {}), [k]: v } }));
      const active = sortEquipment(equipment.filter(e => e.active !== false));

      const save = async () => {
        if (!date) { toast('Selecciona la fecha.', 'error'); return; }

        if (type === 'ajuste_combustible') {
          const pSub = parseFloat(adjustSub);
          const pRes = parseFloat(adjustRes);
          if (isNaN(pSub) || pSub < 0) { toast('Ingresa un nivel válido para el sub-tanque.', 'error'); return; }
          if (isNaN(pRes) || pRes < 0) { toast('Ingresa un nivel válido para la reserva.', 'error'); return; }
        }

        if (type === 'surtido') {
          const validationError = validateDispatch({
            destino: fuelDest,
            litros: fuelLts,
            litrosPlanta: fuelLtsPlanta,
            litrosReserva: fuelLtsReserva,
            curSub,
            curRes,
            subCap: parseFloat(nodeTankInfo?.tanque_lts) || 0,
            resCap: parseFloat(nodeTankInfo?.cap_reserva_lts) || 0,
          });
          if (validationError) {
            toast(validationError, 'error');
            return;
          }
        }

        setSaving(true);
        try {
          const cleanMeas = {};
          Object.entries(meas).forEach(([tag, fields]) => {
            const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== null && v !== undefined));
            if (Object.keys(filled).length > 0) cleanMeas[tag] = filled;
          });
          const record = {
            type, date: new Date(date), shift: type === 'surtido' ? 'dia' : shift, observations: sanitize(obs),
            technicianId: userProfile.uid, technicianName: sanitize(userProfile.name),
            participants: sanitize(participants.trim()),
            ...(type === 'surtido' ? {
              generatorTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              fuelDestination: fuelDest,
              fuelLiters: addedTotalDespacho,
              fuelLitersPlanta: resultingLtsP,
              fuelLitersReserva: resultingLtsR,
              fuelSubtankLevel: resultingSub,
              fuelPrevSub: curSub,
              fuelPrevRes: curRes,
              fuelReserveLevel: resultingRes,
              fuelTotalLevel: resultingTotal,
              fuelHorometer: fuelHoro,
            } : {}),
            ...(type === 'ajuste_combustible' ? {
              generatorTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              fuelSubLevel: parseFloat(adjustSub) || 0,
              fuelReserveLevel: parseFloat(adjustRes) || 0,
              fuelTotalLevel: (parseFloat(adjustSub) || 0) + (parseFloat(adjustRes) || 0),
              diffSub: (parseFloat(adjustSub) || 0) - curSub,
              diffReserve: (parseFloat(adjustRes) || 0) - curRes,
              fuelHorometer: fuelHoro,
              adjustmentReason: adjustMotivo,
            } : {}),
            measurements: (type === 'inspeccion' || type === 'actualizacion_carga') ? cleanMeas : {},
            equipmentAction: (type !== 'inspeccion' && type !== 'actualizacion_carga' && type !== 'surtido') && eqAction ? {
              tag: sanitize(eqAction.tag || ''),
              type: sanitize(eqAction.type || ''),
              voltage: sanitize(eqAction.voltage || ''),
              voltageDC: sanitize(eqAction.voltageDC || ''),
              hasAcIn: !!eqAction.hasAcIn,
              hasAcOut: !!eqAction.hasAcOut,
              hasDcOut: !!eqAction.hasDcOut,
              hasSolar: !!eqAction.hasSolar,
              pvCount: eqAction.hasSolar ? Math.max(1, parseInt(eqAction.pvCount, 10) || 1) : 0,
              batteryType: sanitize(eqAction.batteryType || ''),
              batCapacity: sanitize(eqAction.batCapacity || ''),
              batCount: sanitize(eqAction.batCount || ''),
              batCellType: sanitize(eqAction.batCellType || 'No aplica'),
              batSoH: sanitize(eqAction.batSoH || ''),
              batDoD: sanitize(eqAction.batDoD || ''),
              batSerials: Array.isArray(eqAction.batSerials) ? eqAction.batSerials.map(s => sanitize(s)) : [],
              solarRegPercentage: sanitize(eqAction.solarRegPercentage || ''),
              invMode: sanitize(eqAction.invMode || ''),
              capacity: sanitize(eqAction.capacity || ''),
              phases: sanitize(eqAction.phases || ''),
              horometer: eqAction.horometer,
              lastMaintenanceHorometer: eqAction.lastMaintenanceHorometer,
              maintenanceInterval: eqAction.maintenanceInterval,
              serial: sanitize(eqAction.serial || ''),
              notes: sanitize(eqAction.notes)
            } : null,
            createdAt: TS()
          };
          let firestoreSaveSuccess = false;
          let firestoreErrorMsg = '';

          try {
            await db.collection('energy_nodes').doc(nodeId).collection('energy_records').add(record);
            firestoreSaveSuccess = true;

            if (type === 'instalacion' && eqAction.tag) {
              const isDC = eqAction.type === 'BAT' || eqAction.type === 'ETP';
              await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').add({
                tag: sanitize(eqAction.tag), type: sanitize(eqAction.type),
                voltage: isDC ? '' : sanitize(eqAction.voltage),
                voltageDC: sanitize(eqAction.voltageDC || ''),
                hasAcIn: !!eqAction.hasAcIn, hasAcOut: !!eqAction.hasAcOut, hasDcOut: !!eqAction.hasDcOut,
                hasSolar: !!eqAction.hasSolar,
                pvCount: eqAction.hasSolar ? Math.max(1, parseInt(eqAction.pvCount, 10) || 1) : 0,
                batteryType: sanitize(eqAction.batteryType),
                batCapacity: sanitize(eqAction.batCapacity || ''), batCount: sanitize(eqAction.batCount || ''),
                batCellType: sanitize(eqAction.batCellType || 'No aplica'),
                batSoH: sanitize(eqAction.batSoH || ''), batDoD: sanitize(eqAction.batDoD || ''),
                batSerials: Array.isArray(eqAction.batSerials) ? eqAction.batSerials.map(s => sanitize(s)) : [],
                solarRegPercentage: sanitize(eqAction.solarRegPercentage || ''), invMode: sanitize(eqAction.invMode || ''),
                capacity: sanitize(eqAction.capacity || ''), phases: sanitize(eqAction.phases || ''),
                horometer: eqAction.type === 'GEN' ? (parseHours(eqAction.horometer) || 0) : '',
                lastMaintenanceHorometer: eqAction.type === 'GEN' ? (parseHours(eqAction.lastMaintenanceHorometer) || parseHours(eqAction.horometer) || 0) : 0,
                maintenanceInterval: eqAction.type === 'GEN' ? (parseFloat(eqAction.maintenanceInterval) || 250) : 250,
                active: true, installedAt: new Date(date), installedBy: sanitize(userProfile.name), serial: sanitize(eqAction.serial || ''), notes: sanitize(eqAction.notes)
              });
            }
            if (type === 'reemplazo' && eqAction.tag) {
              const eq = active.find(e => e.tag === eqAction.tag);
              if (eq) await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(eq.id).update({ active: false, retiredAt: new Date(date) });
            }
          } catch (fsErr) {
            console.warn('Firestore write warning:', fsErr);
            firestoreErrorMsg = fsErr.message || String(fsErr);
          }

          if (type === 'surtido') {
            const plantTag = selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '');
            let parsedHoro = 0;
            if (fuelHoro) {
              const hMatch = String(fuelHoro).match(/(\d+)h\s*(\d+)?m?/);
              if (hMatch) {
                parsedHoro = parseInt(hMatch[1]) + (parseInt(hMatch[2] || 0) / 60);
              } else {
                parsedHoro = parseFloat(fuelHoro) || 0;
              }
            }

            // Actualizar horómetro del equipo en Firestore si hubo conexión
            if (plantTag && parsedHoro > 0 && db) {
              try {
                const genEq = equipment.find(e => e.type === 'GEN' && e.tag === plantTag);
                if (genEq) {
                  await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(genEq.id).update({
                    horometer: parsedHoro
                  });
                }
              } catch(e) {}
            }

            // Sincronizar con el catálogo global de surtidos en localStorage
            const newRefillObj = {
              id: 'r_rec_' + Date.now(),
              fecha: new Date(date).toLocaleDateString('es-VE'),
              semana: 'Semana Actual',
              lugar: nodeName,
              tag: plantTag,
              litros: addedTotalDespacho,
              litros_planta: resultingLtsP,
              litros_reserva: resultingLtsR,
              destino: fuelDest,
              subtanque_lts: resultingSub,
              reserva_lts: resultingRes,
              prev_subtanque_lts: curSub,
              prev_reserva_lts: curRes,
              total_nodo: resultingTotal,
              horometro: fuelHoro ? (String(fuelHoro).includes('h') ? fuelHoro : `${fuelHoro} h`) : (parsedHoro > 0 ? `${parsedHoro} h` : ''),
              horas_trabajo: '',
              tecnico: sanitize(userProfile.name),
              obs: sanitize(obs)
            };

            try {
              const curRefills = JSON.parse(localStorage.getItem('airtek_fuel_refills_v12') || '[]');
              localStorage.setItem('airtek_fuel_refills_v12', JSON.stringify([newRefillObj, ...curRefills]));
            } catch(e) {}

            // Persistir balance de combustible en Firestore (energy_nodes/{id}/fuel/state) y en LocalStorage
            await persistNodeFuelUpdate({
              db,
              nodeId,
              nodeName,
              plantTag,
              resultingSub,
              resultingRes,
              resultingTotal,
              addedTotalDespacho,
              resultingLtsP,
              resultingLtsR,
              fuelDest,
              fuelHoro,
              userProfile
            });
          } else if (type === 'ajuste_combustible') {
            const pSub = parseFloat(adjustSub) || 0;
            const pRes = parseFloat(adjustRes) || 0;
            const pTotal = pSub + pRes;
            await persistNodeFuelUpdate({
              db,
              nodeId,
              nodeName,
              plantTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              resultingSub: pSub,
              resultingRes: pRes,
              resultingTotal: pTotal,
              addedTotalDespacho: 0,
              resultingLtsP: 0,
              resultingLtsR: 0,
              fuelDest: `Calibración (${adjustMotivo})`,
              fuelHoro: fuelHoro || '',
              userProfile
            });
          }

          if (!firestoreSaveSuccess && firestoreErrorMsg.includes('permission')) {
            toast('Registro guardado localmente. Nota: Tu usuario en Firestore está pendiente de aprobación en el Panel de Administración.', 'info');
          }

          toast('Registro guardado exitosamente.', 'success');
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_general`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          // Verificar alarmas de conductores ATS
          if (type === 'inspeccion') {
            const alarms = checkAtsAlarms(cleanMeas, active);
            if (alarms.length > 0) {
              const msg = alarms.map(a => `${a.tag} - ${a.line}: ${a.measured}A > ${a.maxA}A (Cable ${a.calibre})`).join('\n');
              toast('Amperaje fuera de rango en ' + alarms.map(a => a.tag).join(', '), 'error');
              sendNotificationAlert({
                nodo: nodeName,
                tecnico: userProfile.name,
                fecha: new Date(date).toLocaleDateString('es-VE'),
                alarmas: `[SOBRECARGA DE CABLEADO ATS]\n${msg}`,
                observaciones: obs || 'Inspección técnica de cableado en nodo.',
              });
            }
          }
          // Mostrar reporte si es inspección con mediciones o si es surtido de combustible
          if (type === 'inspeccion' && Object.keys(cleanMeas).length > 0) {
            setReportData({ nodeName, date: new Date(date), shift, technicianName: userProfile.name, measurements: cleanMeas, observations: obs, equipment: active });
          } else if (type === 'surtido') {
            const fuelText = generateFuelReportText({
              nodeName: nodeName || 'Nodo',
              date: new Date(date),
              record,
              equipment: active,
              tanks: [nodeTankInfo]
            });
            setSavedSurtidoReport(fuelText);
          } else {
            onSave();
          }
        } catch (e) {
          toast('Error al guardar registro: ' + (e.message || e), 'error');
        } finally {
          setSaving(false);
        }
      };

      if (savedSurtidoReport) {
        return (
          <div className="fin">
            <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <h3 className="fd" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>¡Surtido Registrado con Éxito!</h3>
                    <p style={{ color: 'var(--tx3)', fontSize: '.78rem', margin: '2px 0 0' }}>Mensaje listo para copiar y enviar al grupo de WhatsApp o reporte:</p>
                  </div>
                </div>
                <span className="badge" style={{ background: 'rgba(1, 102, 255, 0.15)', color: 'var(--blue)', fontWeight: 800 }}>SURTIDO</span>
              </div>

              <textarea
                className="fi fm"
                rows={11}
                readOnly
                value={savedSurtidoReport}
                style={{ resize: 'vertical', fontSize: '.84rem', lineHeight: 1.6, background: 'var(--bg-deep)', color: 'var(--tx1)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="bp"
                  style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: '.88rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(savedSurtidoReport).then(() => {
                      if (toast) toast('¡Mensaje de surtido copiado al portapapeles!', 'success');
                    });
                  }}
                >
                  <IconCopy size={16} /> Copiar Mensaje para WhatsApp
                </button>
                <button
                  className="bs"
                  style={{ padding: '10px 22px', fontSize: '.88rem' }}
                  onClick={() => { setSavedSurtidoReport(null); onSave(); }}
                >
                  Finalizar y Volver
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (reportData) {
        return (
          <div className="fin">
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)' }}>Reporte de Inspección Generado</h3>
                <span className="badge" style={{ background: '#00800022', color: '#008000' }}>Listo para copiar</span>
              </div>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', marginBottom: 12 }}>
                Copia este reporte estructurado para compartirlo en el grupo de WhatsApp o pegarlo en el ticket de Odoo:
              </p>
              <textarea
                className="fi fm"
                rows={12}
                readOnly
                value={generateReportText(reportData)}
                style={{ resize: 'vertical', fontSize: '.82rem', lineHeight: 1.5, background: 'var(--bg-deep)' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  className="bg"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const text = generateReportText(reportData);
                    navigator.clipboard.writeText(text);
                    toast('Reporte copiado al portapapeles', 'success');
                  }}
                >
                  <IconCopy size={16} /> Copiar Reporte
                </button>
                <button className="bp" style={{ flex: 1 }} onClick={onSave}>
                  Finalizar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="fin">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center' }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx1)' }}>Nuevo Registro</h2>
                <p style={{ color: 'var(--tx3)', fontSize: '.8rem' }}>{nodeName}</p>
              </div>
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

          {/* Info general */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Información General</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="lbl">Tipo de Registro</label>
                <select className="fi" value={type} onChange={e => setType(e.target.value)}>
                  {Object.entries(REC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Turno</label>
                <select className="fi" value={shift} onChange={e => setShift(e.target.value)}>
                  <option value="dia">Día</option>
                  <option value="noche">Noche</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Fecha y Hora</label>
                <input className="fi" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <PersonnelMultiSelect
                  value={participants}
                  onChange={setParticipants}
                  staff={authorizedStaff}
                  label="Personal que realizó la inspección / actividad"
                />
              </div>
            </div>
          </div>

                    {/* Plantilla: Surtido de Combustible */}
          {type === 'surtido' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800 }}>SURTIDO</span>
                Registro de Despacho Real de Combustible
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 10 }}>
                Asienta los litros de gasoil suministrados y el horómetro actual de la planta eléctrica en este nodo.
              </div>

              {/* Guía informativa: Diferencia entre Surtido y Ajuste */}
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 14, padding: '10px 14px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⛽</span>
                <div>
                  <strong style={{ color: 'var(--tx1)' }}>Surtido Real de Combustible:</strong> Úsalo exclusivamente cuando se abastece combustible físico (desde cisterna o llenando la planta). En nodos con reserva, el surtido a la planta descuenta de la reserva externa.
                  <div style={{ marginTop: 4, color: 'var(--tx2)' }}>
                    Si observas que el nivel en sistema no coincide con la realidad física (vara o sensor), cambia el <strong>Tipo de Registro</strong> a <span style={{ color: '#a78bfa', fontWeight: 700 }}>"Ajuste / Calibración de Niveles"</span> para calibrar sin despachos ficticios.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label className="lbl">Planta Eléctrica</label>
                  <select className="fi" value={selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '')} onChange={e => setSelPlantTag(e.target.value)}>
                    {equipment.filter(e => e.type === 'GEN').map(eq => (
                      <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.capacity ? eq.capacity + ' kVA' : 'Generador'})</option>
                    ))}
                    {equipment.filter(e => e.type === 'GEN').length === 0 && (
                      <option value="GEN-PLT-00">Planta Eléctrica del Nodo</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="lbl">Destino del Combustible</label>
                  <select className="fi" value={fuelDest} onChange={e => setFuelDest(e.target.value)}>
                    <option value="Surtido Planta">Surtido Planta ({nodeTankInfo?.tanque_lts || 300} L máx{(nodeTankInfo?.cap_reserva_lts || 0) > 0 ? ', descuenta de la reserva' : ''})</option>
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <option value="Surtido Reserva">Surtido Reserva (Cisterna a Tanque - {nodeTankInfo?.cap_reserva_lts} L máx)</option>
                    )}
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <option value="Surtido Planta y Reserva">Surtido Planta y Reserva (Cisterna a Ambos)</option>
                    )}
                  </select>
                </div>

                {fuelDest !== 'Surtido Planta y Reserva' ? (
                  <div>
                    <label className="lbl">
                      {fuelDest === 'Surtido Reserva' ? 'Litros a Reserva (Lts)' : (fuelDest === 'Trasiego Interno' ? 'Litros a Trasegar a Planta (Lts)' : 'Litros a Planta (Lts)')}
                      {fuelDest === 'Surtido Planta' && (
                        <span style={{ marginLeft: 6, color: 'var(--blue)', fontSize: '.7rem' }}>
                          (Límite tanque: {nodeTankInfo?.tanque_lts || 300} Lts | Actual: {curSub} Lts)
                        </span>
                      )}
                      {fuelDest === 'Trasiego Interno' && (
                        <span style={{ marginLeft: 6, color: curRes > 0 ? 'var(--blue)' : '#f55b5d', fontSize: '.7rem' }}>
                          (Disp. en Reserva: {curRes} Lts)
                        </span>
                      )}
                    </label>
                    <input
                      className="fi fm"
                      type="number"
                      step="any"
                      placeholder="Ej: 100"
                      value={fuelLts}
                      max={fuelDest === 'Trasiego Interno' ? curRes : undefined}
                      onChange={e => setFuelLts(e.target.value)}
                    />
                    {fuelDest === 'Trasiego Interno' && (parseFloat(fuelLts) || 0) > curRes && (
                      <div style={{ color: '#f55b5d', fontSize: '.72rem', marginTop: 3, fontWeight: 600 }}>
                        Excede la reserva disponible ({curRes} Lts máx).
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="lbl">Litros a Planta (Lts)</label>
                      <input className="fi fm" type="number" step="any" placeholder="Ej: 80" value={fuelLtsPlanta} onChange={e => setFuelLtsPlanta(e.target.value)} />
                    </div>
                    <div>
                      <label className="lbl">Litros a Reserva (Lts)</label>
                      <input className="fi fm" type="number" step="any" placeholder="Ej: 200" value={fuelLtsReserva} onChange={e => setFuelLtsReserva(e.target.value)} />
                    </div>
                  </>
                )}

                <div>
                  <label className="lbl">Horómetro Actual de la Planta (Horas)</label>
                  <input className="fi fm" type="text" placeholder="Ej: 600:42:00 o 600" value={fuelHoro} onChange={e => setFuelHoro(e.target.value)} />
                </div>
              </div>

              {/* Indicador en vivo de Litros Totales en el Nodo */}
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Litros Totales de Combustible en el Nodo
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginTop: 2 }}>
                    {nodeTankInfo.matchingTanks && nodeTankInfo.matchingTanks.length > 1 ? (
                      <span>
                        Sub-tanque ({selPlantTag || 'Planta'}): <strong style={{ color: 'var(--tx1)' }}>{resultingSub} Lts</strong> | Reserva Compartida: <strong style={{ color: 'var(--tx1)' }}>{resultingRes} Lts</strong>
                      </span>
                    ) : (
                      <span>
                        Sub-tanque: <strong style={{ color: 'var(--tx1)' }}>{resultingSub} Lts</strong> | Reserva: <strong style={{ color: 'var(--tx1)' }}>{resultingRes} Lts</strong>
                      </span>
                    )}
                    {fuelDest === 'Trasiego Interno' && (
                      <span style={{ marginLeft: 8, color: '#21c0fa', fontSize: '.74rem', fontWeight: 600 }}>(Trasiego: -{parseFloat(fuelLts)||0}L de reserva a planta)</span>
                    )}
                    {fuelDest === 'Surtido Planta y Reserva' && (
                      <span style={{ marginLeft: 8, color: '#8b5cf6', fontSize: '.74rem', fontWeight: 600 }}>(Total despachado: +{addedTotalDespacho}L)</span>
                    )}
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--green)' }}>
                  {resultingTotal} <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Lts</span>
                </div>
              </div>
            </div>
          )}

          {/* Plantilla: Ajuste y Calibración de Niveles Reales */}
          {type === 'ajuste_combustible' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', fontWeight: 800 }}>AJUSTE / CALIBRACIÓN</span>
                Calibración de Niveles Reales por Medición Física
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 14 }}>
                Permite corregir discrepancias entre el sistema y la medición física con vara en sitio (por consumo de planta, evaporación o error previo). No simula despachos ficticios ni descuenta entre tanques.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label className="lbl">Planta Eléctrica</label>
                  <select className="fi" value={selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '')} onChange={e => setSelPlantTag(e.target.value)}>
                    {equipment.filter(e => e.type === 'GEN').map(eq => (
                      <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.capacity ? eq.capacity + ' kVA' : 'Generador'})</option>
                    ))}
                    {equipment.filter(e => e.type === 'GEN').length === 0 && (
                      <option value="GEN-PLT-00">Planta Eléctrica del Nodo</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="lbl">Motivo del Ajuste</label>
                  <select className="fi" value={adjustMotivo} onChange={e => setAdjustMotivo(e.target.value)}>
                    <option value="Medición física con vara en sitio">Medición física con vara en sitio</option>
                    <option value="Consumo de planta por corte eléctrico no asentado">Consumo de planta por corte eléctrico no asentado</option>
                    <option value="Corrección por error de técnico en surtido previo">Corrección por error de técnico en surtido previo</option>
                    <option value="Auditoría periódica de inventario">Auditoría periódica de inventario</option>
                    <option value="Otro motivo operativo">Otro motivo operativo</option>
                  </select>
                </div>

                <div>
                  <label className="lbl">
                    Nivel Real Sub-Tanque Planta (Lts)
                    <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: '.7rem' }}>(Cap: {nodeTankInfo?.tanque_lts || 300} L)</span>
                  </label>
                  <input
                    className="fi fm"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej: 80"
                    value={adjustSub}
                    onChange={e => setAdjustSub(e.target.value)}
                  />
                  <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 3 }}>
                    Nivel actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curSub} Lts</strong>
                    {parseFloat(adjustSub) !== curSub && !isNaN(parseFloat(adjustSub)) && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: (parseFloat(adjustSub) - curSub) >= 0 ? '#10b981' : '#f55b5d' }}>
                        ({(parseFloat(adjustSub) - curSub) >= 0 ? `+${(parseFloat(adjustSub) - curSub)}` : (parseFloat(adjustSub) - curSub)} L)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="lbl">
                    Nivel Real Reserva del Nodo (Lts)
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: '.7rem' }}>(Cap: {nodeTankInfo?.cap_reserva_lts} L)</span>
                    )}
                  </label>
                  <input
                    className="fi fm"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej: 160"
                    value={adjustRes}
                    onChange={e => setAdjustRes(e.target.value)}
                  />
                  <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 3 }}>
                    Nivel actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curRes} Lts</strong>
                    {parseFloat(adjustRes) !== curRes && !isNaN(parseFloat(adjustRes)) && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: (parseFloat(adjustRes) - curRes) >= 0 ? '#10b981' : '#f55b5d' }}>
                        ({(parseFloat(adjustRes) - curRes) >= 0 ? `+${(parseFloat(adjustRes) - curRes)}` : (parseFloat(adjustRes) - curRes)} L)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Horómetro Actual de la Planta (Horas)</label>
                  <input className="fi fm" type="text" placeholder="Ej: 600:42:00 o 600" value={fuelHoro} onChange={e => setFuelHoro(e.target.value)} />
                </div>
              </div>

              {/* Resumen del Balance tras Ajuste */}
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Balance Total Resultante en el Nodo tras Calibrar
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginTop: 2 }}>
                    Sub-tanque: <strong style={{ color: 'var(--tx1)' }}>{parseFloat(adjustSub)||0} Lts</strong> | Reserva: <strong style={{ color: 'var(--blue)' }}>{parseFloat(adjustRes)||0} Lts</strong>
                    <span style={{ marginLeft: 8, color: '#8b5cf6', fontSize: '.74rem', fontWeight: 600 }}>
                      (Ajuste directo sin descuento entre tanques)
                    </span>
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--green)' }}>
                  {(parseFloat(adjustSub)||0) + (parseFloat(adjustRes)||0)} <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Lts</span>
                </div>
              </div>
            </div>
          )}

          {/* Plantilla: Actualización Rápida de Cargas */}
          {type === 'actualizacion_carga' && (
            active.length === 0
              ? <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay equipos activos en este nodo.</p>
                <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Instalación</button>
              </div>
              : (() => {
                const groups = groupByBank(active);
                const powerGroups = groups.filter(g => g.eqs.some(e => e.type === 'ETP' || e.type === 'INV') || g.bat);

                if (powerGroups.length === 0) {
                  return (
                    <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                      <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay fuentes de poder ETP ni inversores registrados en este nodo.</p>
                      <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Equipo</button>
                    </div>
                  );
                }

                return (
                  <div>
                    <div className="card" style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: '.82rem', color: 'var(--tx1)', fontWeight: 600, marginBottom: 2 }}>
                        Actualización Rápida de Cargas por Banco
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx3)' }}>
                        Indica la carga de cada fuente ETP (DC y AC) e inversores por línea. La autonomía se recalcula automáticamente en tiempo real.
                      </div>
                    </div>

                    {powerGroups.map(({ bank, eqs, bat }) => {
                      const powerEqs = eqs.filter(e => e.type === 'ETP' || e.type === 'INV');
                      let bankAc = 0, bankDc = 0;
                      powerEqs.forEach(eq => {
                        const vals = meas[eq.tag] || {};
                        const ld = calcLoad(eq.type, vals);
                        bankAc += ld.ac;
                        bankDc += ld.dc;
                      });
                      const totalBankKW = bankAc + bankDc;
                      const aut = (bat && totalBankKW > 0) ? calcAutonomy(bat, bankAc, bankDc) : null;
                      const autColor = !aut ? 'var(--tx3)' : aut > 4 ? '#008000' : aut > 2 ? '#0166ff' : '#f55b5d';

                      return (
                        <div key={bank || '_ung'} className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                          {/* Encabezado del Banco y Autonomía en Vivo */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span className="badge" style={{ background: 'rgba(33, 192, 250,.18)', color: '#21c0fa', fontWeight: 700, fontSize: '.75rem' }}>
                                  {bank ? `Banco ${bank}` : 'General / Sin Banco'}
                                </span>
                                {bat ? (
                                  <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>
                                    {bat.tag} ({bat.batCapacity || '—'}Ah · {bat.batteryType || 'LFP'})
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '.74rem', color: 'var(--amber)' }}>
                                    Sin batería asociada
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Autonomía estimada:</span>
                                <span className="fm" style={{ fontSize: '1.2rem', fontWeight: 800, color: autColor }}>
                                  {aut !== null ? fmtHours(aut) : '—'}
                                </span>
                              </div>
                              <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                                Σ Carga: <strong style={{ color: '#0166ff' }}>{totalBankKW.toFixed(2)} kW</strong> (AC: {bankAc.toFixed(2)} · DC: {bankDc.toFixed(2)})
                              </div>
                            </div>
                          </div>

                          {/* Lista de Equipos (Solo ETP e Inversores) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {powerEqs.length === 0 ? (
                              <div style={{ fontSize: '.78rem', color: 'var(--tx3)', padding: '6px 0' }}>
                                No hay fuentes ETP ni inversores asociados a este banco.
                              </div>
                            ) : powerEqs.map(eq => {
                              const vals = meas[eq.tag] || {};
                              const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;

                              if (eq.type === 'ETP') {
                                const dc = parseFloat(vals.DC_load) || 0;
                                const ac = parseFloat(vals.AC_load) || 0;
                                const tot = dc + ac;

                                return (
                                  <div key={eq.id} style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                                        <span className="fm" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                                        <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Fuente de Poder</span>
                                      </div>
                                      <span className="fm" style={{ fontSize: '.84rem', color: tot > 0 ? '#008000' : 'var(--tx3)', fontWeight: 700 }}>
                                        Total Fuente: {tot.toFixed(2)} kW
                                      </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <MF label="DC Load" unit="kW" vals={vals} k="DC_load" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      <MF label="AC Load" unit="kW" vals={vals} k="AC_load" onChange={(k, v) => updM(eq.tag, k, v)} />
                                    </div>
                                  </div>
                                );
                              }

                              if (eq.type === 'INV') {
                                const is220 = eq.voltage === '220V';
                                const l1p = parseFloat(vals.L1_pot) || 0;
                                const l2p = parseFloat(vals.L2_pot) || 0;
                                const tot = parseFloat(vals.load_kw) || (l1p + l2p);

                                return (
                                  <div key={eq.id} style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                                        <span className="fm" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                                        {eq.voltage && <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{eq.voltage}</span>}
                                      </div>
                                      <span className="fm" style={{ fontSize: '.84rem', color: tot > 0 ? '#008000' : 'var(--tx3)', fontWeight: 700 }}>
                                        Total Inversor: {tot.toFixed(2)} kW
                                      </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: is220 ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                      <MF label="Potencia L1" unit="kW" vals={vals} k="L1_pot" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      <MF label="Carga L1" unit="%" vals={vals} k="L1_carga" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      {is220 && (
                                        <>
                                          <MF label="Potencia L2" unit="kW" vals={vals} k="L2_pot" onChange={(k, v) => updM(eq.tag, k, v)} />
                                          <MF label="Carga L2" unit="%" vals={vals} k="L2_carga" onChange={(k, v) => updM(eq.tag, k, v)} />
                                        </>
                                      )}
                                      <MF label="Carga Total" unit="kW" vals={vals} k="load_kw" onChange={(k, v) => updM(eq.tag, k, v)} />
                                    </div>
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
          )}

          {/* Mediciones — agrupadas por banco */}
          {type === 'inspeccion' && (
            active.length === 0
              ? <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay equipos activos en este nodo.</p>
                <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Instalación</button>
              </div>
              : (() => {
                const groups = groupByBank(active);

                return groups.map(({ bank, eqs, bat, orphanBats }) => (
                  <div key={bank || '_ung'} style={{ marginBottom: 20 }}>
                    {/* Equipos del grupo */}
                    {eqs.map(eq => {
                      const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;
                      return (
                        <div key={eq.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{eq.tag}</span>
                            {eq.voltage && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltage}</span>}
                            {eq.hasAcIn && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>AC/IN</span>}
                            {eq.hasAcOut && <span style={{ color: '#008000', fontSize: '.74rem' }}>AC/OUT</span>}
                            {eq.hasDcOut && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>DC/OUT</span>}
                            {eq.hasSolar && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>{eq.pvCount > 1 ? `PV (${eq.pvCount})` : 'PV'}</span>}
                            {eq.type === 'ETP' && eq.solarRegPercentage && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>{eq.solarRegPercentage}%</span>}
                            {eq.batteryType && eq.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{eq.batteryType}</span>}
                          </div>
                          <EqMeasurements eq={eq} vals={meas[eq.tag] || {}} onChange={(k, v) => updM(eq.tag, k, v)} />
                        </div>
                      );
                    })}
                    {/* Banco asociado al final del grupo */}
                    {bat && (() => {
                      const ti = EQ_TYPES.BAT;
                      return (
                        <div key={bat.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', background: 'rgba(33, 192, 250,.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>BAT</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{bat.tag}</span>
                            {bat.batteryType && bat.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batteryType}</span>}
                            {bat.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batCapacity}Ah</span>}
                            {bat.batCount && <span style={{ color: '#64748b', fontSize: '.74rem' }}>{bat.batCount} bat.</span>}
                          </div>
                          <EqMeasurements eq={bat} vals={meas[bat.tag] || {}} onChange={(k, v) => updM(bat.tag, k, v)} />
                        </div>
                      );
                    })()}
                    {/* Bancos huérfanos */}
                    {orphanBats && orphanBats.map(bat => {
                      const ti = EQ_TYPES.BAT;
                      return (
                        <div key={bat.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', background: 'rgba(33, 192, 250,.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>BAT</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{bat.tag}</span>
                            {bat.batteryType && bat.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batteryType}</span>}
                            {bat.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batCapacity}Ah</span>}
                          </div>
                          <EqMeasurements eq={bat} vals={meas[bat.tag] || {}} onChange={(k, v) => updM(bat.tag, k, v)} />
                        </div>
                      );
                    })}
                  </div>
                ));
              })()
          )}

          {/* Instalación */}
          {type === 'instalacion' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Equipo a Instalar</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Tag / Identificador del Equipo</label>
                  <input className="fi fm" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })} placeholder="Ej: INV00-PV-LFP00" />
                </div>
                <div>
                  <label className="lbl">Tipo</label>
                  <select className="fi" value={eqAction.type} onChange={e => setEqA({ ...eqAction, type: e.target.value })}>
                    {Object.entries(EQ_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {eqAction.type === 'INV' && <>
                  <div>
                    <label className="lbl">Modo Operación</label>
                    <select className="fi" value={eqAction.invMode} onChange={e => setEqA({ ...eqAction, invMode: e.target.value })}>
                      <option value="Cargador/Descargador">Inversor / Cargador</option>
                      <option value="Solo Inversor">Solo Inversor (Descargador)</option>
                      <option value="Solo Cargador">Solo Cargador</option>
                    </select>
                  </div>
                  {eqAction.invMode !== 'Solo Cargador' && <div>
                    <label className="lbl">Tensión de Salida AC</label>
                    <select className="fi" value={eqAction.voltage} onChange={e => setEqA({ ...eqAction, voltage: e.target.value })}>
                      <option value="110V">110V (1 Línea)</option>
                      <option value="220V">220V (2 Líneas)</option>
                    </select>
                  </div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, gridColumn: '1/-1' }}>
                    <label className="lbl" style={{ marginBottom: 0 }}>Conexiones</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[['hasAcIn', 'ENTRADA AC (Cargador)'],
                      ['hasAcOut', 'Salida AC'],
                      ['hasSolar', 'Entrada PV (Solar)']].map(([k, lbl]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!eqAction[k]} onChange={e => setEqA({ ...eqAction, [k]: e.target.checked })} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    {eqAction.hasSolar && (
                      <div style={{ marginTop: 4, maxWidth: 200 }}>
                        <label className="lbl" style={{ fontSize: '.76rem' }}>Cantidad de Módulos PV</label>
                        <input
                          className="fi fm"
                          type="number"
                          min="1"
                          max="10"
                          value={eqAction.pvCount || 1}
                          onChange={e => setEqA({ ...eqAction, pvCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>
                </>}
                {eqAction.type === 'ETP' && <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                    <label className="lbl" style={{ marginBottom: 0 }}>Conexiones Solares</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!eqAction.hasSolar} onChange={e => setEqA({ ...eqAction, hasSolar: e.target.checked })} />
                      Tiene Paneles Solares
                    </label>
                    {eqAction.hasSolar && (
                      <div style={{ marginTop: 4, maxWidth: 200 }}>
                        <label className="lbl" style={{ fontSize: '.76rem' }}>Cantidad de Módulos PV</label>
                        <input
                          className="fi fm"
                          type="number"
                          min="1"
                          max="10"
                          value={eqAction.pvCount || 1}
                          onChange={e => setEqA({ ...eqAction, pvCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="lbl">Efic. Regulación (%) - Opcional</label>
                    <input className="fi" type="number" value={eqAction.solarRegPercentage} onChange={e => setEqA({ ...eqAction, solarRegPercentage: e.target.value })} placeholder="Ej: 85" />
                  </div>
                </>}
                {(eqAction.type === 'BAT' || eqAction.type === 'ETP') && (
                  <div>
                    <label className="lbl">Voltaje Nominal (VDC)</label>
                    <input className="fi fm" value={eqAction.voltageDC} onChange={e => setEqA({ ...eqAction, voltageDC: e.target.value })} placeholder="Ej: 48" />
                  </div>
                )}
                {(eqAction.type === 'INV' || eqAction.type === 'BAT' || eqAction.type === 'ETP') && (
                  <div>
                    <label className="lbl">Tipo de Batería Principal</label>
                    <select className="fi" value={eqAction.batteryType} onChange={e => onBatTypeChange(e.target.value)}>
                      {BAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {eqAction.type === 'BAT' && <>
                  <div>
                    <label className="lbl">Capacidad Base (Ah)</label>
                    <input className="fi" type="number" step="any" value={eqAction.batCapacity} onChange={e => setEqA({ ...eqAction, batCapacity: e.target.value })} placeholder="Ej: 200" />
                  </div>
                  <div>
                    <label className="lbl">Número de Baterías (Bloques)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batCount} onChange={e => setEqA({ ...eqAction, batCount: e.target.value })} placeholder="Ej: 4" />
                  </div>
                  <div>
                    <label className="lbl">Salud del Banco (SoH %)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batSoH} onChange={e => setEqA({ ...eqAction, batSoH: e.target.value })} placeholder="Ej: 100 (opcional)" />
                  </div>
                  <div>
                    <label className="lbl">Profund. Descarga (DoD %)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batDoD} onChange={e => setEqA({ ...eqAction, batDoD: e.target.value })} placeholder="Ej: 95 (opcional)" />
                  </div>
                  <div>
                    <label className="lbl">Tipo de Celda</label>
                    <select className="fi" value={eqAction.batCellType} onChange={e => setEqA({ ...eqAction, batCellType: e.target.value })}>
                      {BAT_CELL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {eqAction.batCount > 0 && Array.from({ length: parseInt(eqAction.batCount) || 0 }).map((_, i) => (
                    <div key={i}>
                      <label className="lbl">Serial Batería #{i + 1} (Opcional)</label>
                      <input className="fi fm" value={eqAction.batSerials?.[i] || ''}
                        onChange={e => {
                          const arr = [...(eqAction.batSerials || [])];
                          arr[i] = e.target.value;
                          setEqA({ ...eqAction, batSerials: arr });
                        }} placeholder={`SN bloque ${i + 1}`} />
                    </div>
                  ))}
                </>}
                {eqAction.type === 'GEN' && <>
                  <div>
                    <label className="lbl">Capacidad de la Planta (KVA)</label>
                    <input className="fi" type="number" step="any" value={eqAction.capacity || ''} onChange={e => setEqA({ ...eqAction, capacity: e.target.value })} placeholder="Ej: 150" />
                  </div>
                  <div>
                    <label className="lbl">Fases</label>
                    <select className="fi" value={eqAction.phases || ''} onChange={e => setEqA({ ...eqAction, phases: e.target.value })}>
                      <option value="">-- Selecciona --</option>
                      <option value="Monofásica">Monofásica</option>
                      <option value="Trifásica">Trifásica</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Horómetro Inicial (H)</label>
                    <input className="fi" type="text" value={eqAction.horometer || ''} onChange={e => setEqA({ ...eqAction, horometer: e.target.value })} placeholder="Ej: 1058:19:00 o 100" />
                  </div>
                  <div>
                    <label className="lbl">Horómetro Último Mantenimiento (H)</label>
                    <input className="fi" type="text" value={eqAction.lastMaintenanceHorometer || ''} onChange={e => setEqA({ ...eqAction, lastMaintenanceHorometer: e.target.value })} placeholder="Ej: 1058:19:00 o 0" />
                  </div>
                  <div>
                    <label className="lbl">Intervalo de Mantenimiento (H)</label>
                    <input className="fi" type="number" step="any" value={eqAction.maintenanceInterval !== undefined ? eqAction.maintenanceInterval : 250} onChange={e => setEqA({ ...eqAction, maintenanceInterval: e.target.value })} placeholder="Ej: 250" />
                  </div>
                </>}
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Serial del Equipo Principal (Opcional)</label>
                  <input className="fi fm" value={eqAction.serial || ''} onChange={e => setEqA({ ...eqAction, serial: e.target.value })} placeholder="SN del equipo" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Notas del Equipo (opcional)</label>
                  <input className="fi" value={eqAction.notes} onChange={e => setEqA({ ...eqAction, notes: e.target.value })} placeholder="Modelo, observaciones, notas adicionales..." />
                </div>
              </div>
            </div>
          )}

          {/* Reemplazo/Retiro */}
          {type === 'reemplazo' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Equipo a Reemplazar / Retirar</h3>
              <div>
                <label className="lbl">Seleccionar Equipo</label>
                <select className="fi" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })}>
                  <option value="">-- Selecciona el equipo a retirar --</option>
                  {active.map(eq => <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.type})</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="lbl">Motivo del Retiro</label>
                <input className="fi" value={eqAction.notes} onChange={e => setEqA({ ...eqAction, notes: e.target.value })} placeholder="Falla, actualización, reubicación..." />
              </div>
            </div>
          )}

          {/* Correctivo */}
          {type === 'correctivo' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Detalle del Correctivo</h3>
              <div>
                <label className="lbl">Equipo afectado (opcional)</label>
                <select className="fi" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })}>
                  <option value="">-- General / sin equipo específico --</option>
                  {active.map(eq => <option key={eq.id} value={eq.tag}>{eq.tag}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div className="card" style={{ marginBottom: 20 }}>
            <label className="lbl">Observaciones</label>
            <textarea className="fi" rows={4} value={obs} onChange={e => setObs(e.target.value)} placeholder="Condiciones del nodo, anomalías detectadas, trabajos realizados..." style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
            <button className="bs" onClick={onCancel} disabled={saving} style={{ minWidth: 120 }}>Cancelar</button>
            <button className="bp" onClick={save} disabled={saving} style={{ minWidth: 180 }}>{saving ? 'Guardando...' : 'Guardar Registro'}</button>
          </div>
        </div>
      );
    }

export { RecordForm };
export default RecordForm;
