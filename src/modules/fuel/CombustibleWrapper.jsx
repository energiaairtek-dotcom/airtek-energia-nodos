import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { loadXLSX, loadHtml2Canvas } from '@/utils/exportLibs';
import { computeDispatchLevels, validateDispatch } from './fuelCalc';
import { SurtidosView } from '@/modules/fuel/views/SurtidosView';
import { PlantasQuickList } from '@/modules/fuel/views/PlantasQuickList';
import { TanquesAutonomiaView } from '@/modules/fuel/views/TanquesAutonomiaView';
import { MantenimientoPlantasView } from '@/modules/fuel/views/MantenimientoPlantasView';
import firebase, { db, TS } from '@/services/firebase';
import { useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { IconExcel, IconAlertTriangle, IconCheckCircle, IconCopy } from '@/components/icons';
import { normalizeNodeName, formatCleanHoro, parseHorometerToHours } from '@/utils/formatters';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, INITIAL_FUEL_REFILLS, persistNodeFuelUpdate, revertFuelTanks, generateFuelReportText } from './fuelUtils';

    function CombustibleWrapper({ userProfile, toast }) {
      const [tab, setTab] = useState('surtidos'); // surtidos | tanques | mtto
      const [refills, setRefills] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_fuel_refills_v12');
          return saved ? JSON.parse(saved) : INITIAL_FUEL_REFILLS;
        } catch { return INITIAL_FUEL_REFILLS; }
      });
      const direct100LTags = ['LTUN-PLT-00'];
      const normalizeTanksList = (rawList) => {
        const baseList = rawList || [];
        // 1. Agregación de reservas compartidas por sede física
        const siteReserveMap = new Map();
        baseList.forEach(t => {
          const sKey = normalizeNodeName(t.lugar);
          const cRes = parseFloat(t.cap_reserva_lts != null ? t.cap_reserva_lts : t.cap_reserva) || 0;
          const aRes = parseFloat(t.reserva_lts) || 0;
          const cur = siteReserveMap.get(sKey) || { capRes: 0, actRes: 0 };
          siteReserveMap.set(sKey, {
            capRes: Math.max(cur.capRes, cRes),
            actRes: Math.max(cur.actRes, aRes)
          });
        });

        return baseList.map(t => {
          const lNorm = (t.lugar || '').toLowerCase();
          const sKey = normalizeNodeName(t.lugar);
          const isDirect100 = direct100LTags.includes(t.tag) ||
            lNorm.includes('tunas');

          let subCap = parseFloat(t.tanque_lts) || 0;
          const siteRes = siteReserveMap.get(sKey) || { capRes: 0, actRes: 0 };
          let resCap = siteRes.capRes;
          let subAct = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
          let resAct = siteRes.actRes;

          // Auto-sanar discrepancias históricas en El Callao y 18 de Octubre
          if (sKey.includes('callao')) {
            if (resCap < 2500) resCap = 2500;
            if (resAct === 0) resAct = 1259.0;
          }
          if (sKey.includes('18 de octubre')) {
            if (resCap < 240) resCap = 240;
            if (resAct === 0) resAct = 230.0;
          }
          // Nuevas reservas de 1000L instaladas en Pomona, Ojeda, Marite y Cañada
          if (sKey.includes('pomona') || sKey.includes('ojeda') || sKey.includes('marite') || sKey.includes('cañada')) {
            if (resCap < 1000) resCap = 1000;
            if (resAct === 0) resAct = 1000.0;
          }

          if (isDirect100) {
            subCap = 100.0;
            resCap = 0;
            resAct = 0.0;
          }

          // LÍMITES FÍSICOS ESTRICTOS: El nivel de un tanque NUNCA puede superar su capacidad nominal
          const clampedSub = subCap > 0 ? Math.min(subCap, Math.max(0, subAct)) : Math.max(0, subAct);
          const clampedRes = resCap > 0 ? Math.min(resCap, Math.max(0, resAct)) : 0;
          const cons = t.consumo_lh || 4.0;
          const autH = Number((clampedSub / cons).toFixed(1));
          const totNodo = clampedSub + clampedRes;
          const autTotH = Number((totNodo / cons).toFixed(1));

          return {
            ...t,
            tanque_lts: subCap,
            subtanque_actual: clampedSub,
            cap_reserva: resCap,
            cap_reserva_lts: resCap,
            reserva_lts: clampedRes,
            cant_faltante: Math.max(0, subCap - clampedSub),
            aut_tanque_h: autH,
            aut_total_h: autTotH,
            dias_aut: Number((autTotH / 24).toFixed(2))
          };
        });
      };

      const [tanks, setTanks] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_fuel_tanks_v13');
          const loaded = saved ? JSON.parse(saved) : INITIAL_FUEL_TANKS;
          return normalizeTanksList(loaded);
        } catch { return normalizeTanksList(INITIAL_FUEL_TANKS); }
      });
      // Leer filtros/aceite de INITIAL_MAINTENANCE_LOG como catálogo de referencia
      const [maintenances, setMaintenances] = useState(INITIAL_MAINTENANCE_LOG);
      const [mttoLoaded, setMttoLoaded] = useState(false);

      // Cargar horómetros REALES desde Firestore/BD para cada planta GEN
      useEffect(() => {
        if (!db || mttoLoaded) return;
        const loadFromDB = async () => {
          try {
            const nodesSnap = await db.collection('energy_nodes').get();
            const updates = [];
            const dbRefills = [];

            for (const nDoc of nodesSnap.docs) {
              // Cargar surtidos registrados en este nodo
              try {
                const recSnap = await nDoc.ref.collection('energy_records').where('type', '==', 'surtido').get();
                recSnap.forEach(rDoc => {
                  const rd = rDoc.data();
                  const rDate = rd.date?.toDate ? rd.date.toDate() : new Date(rd.date);
                  dbRefills.push({
                    id: 'db_' + rDoc.id,
                    fecha: rDate.toLocaleDateString('es-VE'),
                    semana: 'Semana Actual',
                    lugar: nDoc.data().name || nDoc.id,
                    tag: rd.generatorTag || '',
                    litros: rd.fuelLiters || 0,
                    destino: rd.fuelDestination || 'Reserva',
                    subtanque_lts: rd.fuelDestination === 'Sub-tanque' ? (rd.fuelTotalLevel || 0) : 0,
                    reserva_lts: rd.fuelDestination === 'Reserva' ? (rd.fuelTotalLevel || 0) : 0,
                    total_nodo: rd.fuelTotalLevel || rd.fuelLiters || 0,
                    horometro: rd.fuelHorometer ? (String(rd.fuelHorometer).includes('h') ? rd.fuelHorometer : `${rd.fuelHorometer} h`) : '',
                    horas_trabajo: '',
                    tecnico: rd.technicianName || 'Técnico',
                    obs: rd.observations || '',
                    rawDate: rDate.getTime()
                  });
                });
              } catch {}
              const eqSnap = await nDoc.ref.collection('energy_equipment').where('type', '==', 'GEN').get();
              eqSnap.forEach(eDoc => {
                const d = eDoc.data();
                const seedMatch = INITIAL_MAINTENANCE_LOG.find(m => m.tag === d.tag);
                const seedLastM = seedMatch ? (parseFloat(seedMatch.horometro_mtto) || 0) : 0;
                const seedCurrH = seedMatch ? (parseFloat(seedMatch.horometro_actual) || 0) : 0;
                const dbLastM = parseFloat(d.lastMaintenanceHorometer) || 0;
                const dbCurrH = parseFloat(d.horometer) || 0;

                let customH = 0;
                let customMtto = 0;
                try {
                  const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
                  if (ch[d.tag]) {
                    if (ch[d.tag].horometro_actual !== undefined) customH = parseFloat(ch[d.tag].horometro_actual) || 0;
                    if (ch[d.tag].horometro_mtto !== undefined) customMtto = parseFloat(ch[d.tag].horometro_mtto) || 0;
                  }
                } catch {}

                const finalLastM = Math.max(seedLastM, dbLastM, customMtto);
                const resolvedExplicitH = Math.max(dbCurrH, customH);
                const finalCurrH = resolvedExplicitH > 0 
                  ? Math.max(resolvedExplicitH, finalLastM) 
                  : (finalLastM > 0 ? finalLastM : seedCurrH);
                const finalInterval = parseFloat(d.maintenanceInterval) || (seedMatch ? seedMatch.intervalo : 250);

                // Auto-sync Firestore con los valores reales si estaban desactualizados
                if (dbCurrH < finalCurrH || dbLastM < finalLastM) {
                  eDoc.ref.update({
                    horometer: finalCurrH,
                    lastMaintenanceHorometer: finalLastM,
                    maintenanceInterval: finalInterval
                  }).catch(console.error);
                }

                updates.push({
                  tag: d.tag,
                  horometer: finalCurrH,
                  lastMaintenanceHorometer: finalLastM,
                  maintenanceInterval: finalInterval,
                  capacity: d.capacity || (seedMatch ? seedMatch.kva : ''),
                  nodeId: nDoc.id,
                  nodeName: nDoc.data().name || nDoc.id
                });
              });
            }
            if (dbRefills.length > 0) {
              setRefills(prev => {
                const existingIds = prev.map(r => r.id);
                const newOnes = dbRefills.filter(r => !existingIds.includes(r.id));
                if (newOnes.length > 0) {
                  return [...newOnes, ...prev];
                }
                return prev;
              });
            }

            if (updates.length > 0) {
              setMaintenances(prev => {
                const merged = prev.map(m => {
                  const match = updates.find(u => u.tag === m.tag);
                  if (match) {
                    const horasTrabajadas = Math.max(0, parseFloat((match.horometer - match.lastMaintenanceHorometer).toFixed(1)));
                    const horasRestantes = parseFloat((match.maintenanceInterval - horasTrabajadas).toFixed(1));
                    const proxCambio = (match.lastMaintenanceHorometer + match.maintenanceInterval).toFixed(1) + ' h';
                    let status = 'optimo';
                    if (horasRestantes <= 0) status = 'critico';
                    else if (horasRestantes <= 20) status = 'critico';
                    else if (horasRestantes <= 50) status = 'alerta';
                    return {
                      ...m,
                      horometro_actual: match.horometer,
                      horometro_mtto: match.lastMaintenanceHorometer,
                      horas_trabajadas: horasTrabajadas,
                      horas_restantes: horasRestantes,
                      intervalo: match.maintenanceInterval,
                      prox_cambio: proxCambio,
                      status,
                      kva: match.capacity || m.kva,
                      nodeId: match.nodeId
                    };
                  }
                  return m;
                });
                // Agregar plantas de BD que no están en INITIAL_MAINTENANCE_LOG
                const existingTags = merged.map(m => m.tag);
                updates.forEach(u => {
                  if (!existingTags.includes(u.tag)) {
                    const horasTrabajadas = parseFloat((u.horometer - u.lastMaintenanceHorometer).toFixed(1));
                    const horasRestantes = parseFloat((u.maintenanceInterval - horasTrabajadas).toFixed(1));
                    let status = 'optimo';
                    if (horasRestantes <= 0) status = 'critico';
                    else if (horasRestantes <= 20) status = 'critico';
                    else if (horasRestantes <= 50) status = 'alerta';
                    merged.push({
                      id: 'db_' + u.tag,
                      planta: u.nodeName,
                      tag: u.tag,
                      kva: u.capacity || '—',
                      fecha: '—',
                      horometro_mtto: u.lastMaintenanceHorometer,
                      horometro_actual: u.horometer,
                      horas_trabajadas: horasTrabajadas,
                      intervalo: u.maintenanceInterval,
                      horas_restantes: horasRestantes,
                      litros_aceite: '—',
                      filtro_aceite: '—',
                      filtro_trampa: '—',
                      filtro_comb: '—',
                      filtro_aire: '—',
                      prox_cambio: (u.lastMaintenanceHorometer + u.maintenanceInterval).toFixed(1) + ' h',
                      obs: 'Datos cargados de BD',
                      status,
                      nodeId: u.nodeId
                    });
                  }
                });
                return merged;
              });
            }
            setMttoLoaded(true);
          } catch (e) {
            console.error('Error loading maintenance from DB:', e);
            setMttoLoaded(true);
          }
        };
        loadFromDB();
      }, [mttoLoaded]);

      const [showNewRefillModal, setShowNewRefillModal] = useState(false);
      const [selectedPlantForRefill, setSelectedPlantForRefill] = useState(null);
      const [showAdjustLevelModal, setShowAdjustLevelModal] = useState(false);
      const [selectedPlantForAdjust, setSelectedPlantForAdjust] = useState(null);
      const [showNewMttoModal, setShowNewMttoModal] = useState(false);

      // Guardar cambios en persistencia local
      useEffect(() => {
        try {
          localStorage.setItem('airtek_fuel_refills_v12', JSON.stringify(refills));
        } catch {}
      }, [refills]);

      useEffect(() => {
        try {
          localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tanks));
        } catch {}
      }, [tanks]);

      // Estado de horómetros manuales y horas acumuladas por planta (persistencia local)
      const [customHorometers, setCustomHorometers] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_plant_horometers_v1');
          return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
      });
      const [showBatchHoroModal, setShowBatchHoroModal] = useState(false);

      useEffect(() => {
        try {
          localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(customHorometers));
        } catch {}
      }, [customHorometers]);

      // Actualizar horómetro/horas acumuladas de una planta de forma bidireccional
      const handleUpdatePlantHorometer = (plantKey, updates) => {
        if (!plantKey) return;
        const { horometro_actual, delta_h, hSur } = updates;
        const parsedHSur = (hSur !== undefined && hSur !== null) ? parseFloat(hSur) : 0;

        let finalHAct = (horometro_actual !== undefined && horometro_actual !== null && horometro_actual !== '') 
          ? parseFloat(horometro_actual) : null;
        let finalDelta = (delta_h !== undefined && delta_h !== null && delta_h !== '') 
          ? parseFloat(delta_h) : null;

        if (finalHAct !== null && !isNaN(finalHAct)) {
          finalDelta = Math.max(0, parseFloat((finalHAct - parsedHSur).toFixed(1)));
        } else if (finalDelta !== null && !isNaN(finalDelta)) {
          finalHAct = parseFloat((parsedHSur + finalDelta).toFixed(1));
        }

        setCustomHorometers(prev => ({
          ...prev,
          [plantKey]: {
            ...(prev[plantKey] || {}),
            horometro_actual: finalHAct,
            delta_h: finalDelta,
            updatedAt: new Date().toISOString()
          }
        }));

        // Sincronizar con maintenances y Firestore si hay valor numérico
        if (finalHAct !== null && !isNaN(finalHAct) && finalHAct > 0) {
          const normFn = normalizeNodeName;
          setMaintenances(prev => prev.map(m => {
            if (m.tag ? m.tag === plantKey : normFn(m.planta) === normFn(plantKey)) {
              const horasTrab = parseFloat((finalHAct - m.horometro_mtto).toFixed(1));
              const horasRest = parseFloat((m.intervalo - horasTrab).toFixed(1));
              let status = 'optimo';
              if (horasRest <= 0 || horasRest <= 20) status = 'critico';
              else if (horasRest <= 50) status = 'alerta';
              return { ...m, horometro_actual: finalHAct, horas_trabajadas: horasTrab, horas_restantes: horasRest, status };
            }
            return m;
          }));

          if (db) {
            db.collection('energy_nodes').get().then(nodesSnap => {
              for (const nDoc of nodesSnap.docs) {
                nDoc.ref.collection('energy_equipment')
                  .where('type', '==', 'GEN')
                  .where('tag', '==', plantKey)
                  .get().then(eqSnap => {
                    if (!eqSnap.empty) {
                      eqSnap.docs[0].ref.update({ horometer: finalHAct }).catch(console.error);
                    }
                  }).catch(console.error);
              }
            }).catch(console.error);
          }
        }
      };

      // Guardar lote completo desde el modal de horómetros
      const handleBatchUpdateHorometers = (updatedEntries) => {
        setCustomHorometers(prev => {
          const merged = { ...prev };
          Object.keys(updatedEntries).forEach(k => {
            merged[k] = {
              ...(merged[k] || {}),
              ...updatedEntries[k],
              updatedAt: new Date().toISOString()
            };
          });
          return merged;
        });

        const normFn = normalizeNodeName;
        setMaintenances(prev => prev.map(m => {
          const entry = m.tag ? updatedEntries[m.tag] : Object.entries(updatedEntries).find(([k]) => normFn(k) === normFn(m.planta))?.[1];
          if (entry && entry.horometro_actual != null) {
            const hAct = parseFloat(entry.horometro_actual);
            if (!isNaN(hAct) && hAct > 0) {
              const horasTrab = parseFloat((hAct - m.horometro_mtto).toFixed(1));
              const horasRest = parseFloat((m.intervalo - horasTrab).toFixed(1));
              let status = 'optimo';
              if (horasRest <= 0 || horasRest <= 20) status = 'critico';
              else if (horasRest <= 50) status = 'alerta';
              return { ...m, horometro_actual: hAct, horas_trabajadas: horasTrab, horas_restantes: horasRest, status };
            }
          }
          return m;
        }));

        if (toast) toast('Horómetros y horas de operación actualizados correctamente.', 'success');
      };



      const handleAddRefill = async (newRefill) => {
        setRefills(prev => [newRefill, ...prev]);
        
        const normFn = normalizeNodeName;
        const targetNorm = normFn(newRefill.lugar);

        // 1. Actualizar niveles del tanque correspondiente y sincronizar reserva compartida con todas las plantas hermanas
        const capResOfR = x => parseFloat(x.cap_reserva_lts != null ? x.cap_reserva_lts : x.cap_reserva) || 0;
        setTanks(prev => {
          const siteCapRes = prev.filter(x => normFn(x.lugar) === targetNorm).reduce((m, x) => Math.max(m, capResOfR(x)), 0);
          return prev.map(t => {
            const tNorm = normFn(t.lugar);
            const exactNode = tNorm === targetNorm;
            const isPlant = newRefill.tag ? t.tag === newRefill.tag : exactNode;
            if (!isPlant && !exactNode) return t;
            const subCap = parseFloat(t.tanque_lts) || 0;
            const effectiveCapRes = exactNode && siteCapRes > 0 ? siteCapRes : capResOfR(t);
            const curS = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
            const newS = isPlant ? (subCap > 0 ? Math.min(subCap, Math.max(0, Number(newRefill.subtanque_lts) || 0)) : (Number(newRefill.subtanque_lts) || 0)) : curS;
            const newR = exactNode ? (effectiveCapRes > 0 ? Math.min(effectiveCapRes, Math.max(0, Number(newRefill.reserva_lts) || 0)) : Math.max(0, Number(newRefill.reserva_lts) || 0)) : (parseFloat(t.reserva_lts) || 0);
            const autTotal = t.consumo_lh > 0 ? Number(((newS + newR) / t.consumo_lh).toFixed(1)) : t.aut_total_h;
            return {
              ...t,
              cap_reserva: effectiveCapRes,
              cap_reserva_lts: effectiveCapRes,
              subtanque_actual: newS,
              reserva_lts: newR,
              aut_total_h: autTotal,
              dias_aut: Number((autTotal / 24).toFixed(2)),
              horometro_actual: (isPlant && newRefill.horometro && newRefill.horometro !== '—') ? newRefill.horometro : t.horometro_actual
            };
          });
        });

        // 2. Persistir en Firestore (energy_nodes/{id}/fuel/state y node.fuelState) y LocalStorage centralizado
        await persistNodeFuelUpdate({
          db,
          nodeName: newRefill.lugar,
          plantTag: newRefill.tag,
          resultingSub: newRefill.subtanque_lts,
          resultingRes: newRefill.reserva_lts,
          resultingTotal: newRefill.total_nodo,
          addedTotalDespacho: newRefill.litros,
          resultingLtsP: newRefill.litros_planta || 0,
          resultingLtsR: newRefill.litros_reserva || 0,
          fuelDest: newRefill.destino,
          fuelHoro: newRefill.horometro,
          userProfile
        });

        // 3. Registrar el despacho en la subcolección energy_records del nodo en Firestore
        if (db) {
          try {
            const nodesSnap = await db.collection('energy_nodes').get();
            for (const nDoc of nodesSnap.docs) {
              const nData = nDoc.data();
              const nNorm = normFn(nData.name || nDoc.id);
              if (nNorm === targetNorm || (targetNorm && nNorm.includes(targetNorm)) || (nNorm && targetNorm.includes(nNorm))) {
                await nDoc.ref.collection('energy_records').add({
                  type: 'surtido',
                  date: TS(),
                  generatorTag: newRefill.tag,
                  fuelLiters: newRefill.litros,
                  fuelDestination: newRefill.destino,
                  fuelTotalLevel: newRefill.total_nodo,
                  fuelSubLevel: newRefill.subtanque_lts,
                  fuelSubtankLevel: newRefill.subtanque_lts,
                  fuelLitersPlanta: newRefill.litros_planta || 0,
                  fuelLitersReserva: newRefill.litros_reserva || 0,
                  fuelPrevSub: newRefill.prev_subtanque_lts ?? null,
                  fuelPrevRes: newRefill.prev_reserva_lts ?? null,
                  fuelReserveLevel: newRefill.reserva_lts,
                  fuelHorometer: newRefill.horometro,
                  technicianName: newRefill.tecnico,
                  observations: newRefill.obs || '',
                  createdBy: userProfile?.name || 'Técnico',
                  createdAt: TS()
                });
                break;
              }
            }
          } catch (recErr) {
            console.warn('Error saving surtido record to node energy_records:', recErr);
          }
        }

        // 4. Si el surtido incluye horómetro, sincronizar con maintenances y BD
        if (newRefill.horometro && newRefill.horometro !== '—' && newRefill.tag) {
          const horoStr = String(newRefill.horometro);
          let parsedHoro = 0;
          const hMatch = horoStr.match(/(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m)?/i);
          if (hMatch) {
            parsedHoro = parseFloat(hMatch[1]) + (parseInt(hMatch[2] || 0) / 60);
          } else {
            parsedHoro = parseFloat(horoStr.replace(/[^0-9.]/g, '')) || 0;
          }

          if (parsedHoro > 0) {
            setMaintenances(prev => prev.map(m => {
              if (m.tag === newRefill.tag) {
                const horasTrab = parseFloat((parsedHoro - m.horometro_mtto).toFixed(1));
                const horasRest = parseFloat((m.intervalo - horasTrab).toFixed(1));
                let status = 'optimo';
                if (horasRest <= 0 || horasRest <= 20) status = 'critico';
                else if (horasRest <= 50) status = 'alerta';
                return { ...m, horometro_actual: parsedHoro, horas_trabajadas: horasTrab, horas_restantes: horasRest, status };
              }
              return m;
            }));

            if (db) {
              try {
                const nodesSnap = await db.collection('energy_nodes').get();
                for (const nDoc of nodesSnap.docs) {
                  const eqSnap = await nDoc.ref.collection('energy_equipment')
                    .where('type', '==', 'GEN')
                    .where('tag', '==', newRefill.tag)
                    .get();
                  if (!eqSnap.empty) {
                    await eqSnap.docs[0].ref.update({ horometer: parsedHoro });
                    break;
                  }
                }
              } catch (e) {
                console.error('Error syncing refill horometer to DB:', e);
              }
            }
          }
        }

        if (toast) toast('Surtido registrado exitosamente.', 'success');
        setShowNewRefillModal(false);
      };

      const handleAdjustFuelLevel = async (adjustData) => {
        const {
          plant,
          newSub,
          newRes,
          newCapSub,
          newCapRes,
          newTotal,
          newConsumoLh,
          newDiasAut,
          newHorometro,
          diffRes,
          diffSub,
          motivo,
          tecnico,
          fecha,
          obs
        } = adjustData;

        const normFn = normalizeNodeName;
        const targetNorm = normFn(plant.lugar);

        // 1. Parsear horómetro si se proporcionó
        let parsedHoroFloat = null;
        if (newHorometro && newHorometro !== '—') {
          const hMatch = String(newHorometro).match(/(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*m)?/i);
          if (hMatch) {
            parsedHoroFloat = parseFloat(hMatch[1]) + (parseInt(hMatch[2] || 0) / 60);
          } else {
            const rawFloat = parseFloat(String(newHorometro).replace(/[^0-9.]/g, ''));
            if (!isNaN(rawFloat)) parsedHoroFloat = rawFloat;
          }
        }

        // 2. Actualizar tanks en memoria: datos propios de la planta (tanque, consumo, horómetro) SOLO para su tag;
        //    la reserva (nivel y capacidad) se comparte únicamente con plantas del mismo nodo que tienen reserva
        const capResSel = (newCapRes != null && !isNaN(newCapRes)) ? Number(newCapRes) : (parseFloat(plant.cap_reserva_lts) || 0);
        setTanks(prev => prev.map(t => {
          const tNorm = normFn(t.lugar);
          const exactNode = tNorm === targetNorm;
          const isPlant = plant.tag ? t.tag === plant.tag : exactNode;
          const tResCap = parseFloat(t.cap_reserva_lts != null ? t.cap_reserva_lts : t.cap_reserva) || 0;
          const shareRes = !isPlant && exactNode && tResCap > 0 && capResSel > 0;
          if (isPlant) {
            const consLh = newConsumoLh != null && !isNaN(newConsumoLh) && newConsumoLh > 0 ? Number(newConsumoLh) : (t.consumo_lh || 1);
            const capSubVal = newCapSub != null && !isNaN(newCapSub) && newCapSub > 0 ? Number(newCapSub) : t.tanque_lts;
            const capResVal = capResSel;
            const autTotal = Number((newTotal / consLh).toFixed(1));
            const diasAut = newDiasAut != null && !isNaN(newDiasAut) && newDiasAut > 0 ? Number(newDiasAut) : Number((autTotal / 24).toFixed(2));
            const horoStr = newHorometro ? newHorometro : t.horometro_actual;
            return {
              ...t,
              tanque_lts: capSubVal,
              cap_reserva: capResVal,
              cap_reserva_lts: capResVal,
              subtanque_actual: newSub,
              reserva_lts: newRes,
              consumo_lh: consLh,
              aut_tanque_h: Number((newSub / consLh).toFixed(1)),
              aut_total_h: autTotal,
              dias_aut: diasAut,
              horometro_actual: horoStr
            };
          }
          if (shareRes) {
            const sSub = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
            const consT = t.consumo_lh > 0 ? t.consumo_lh : 1;
            const autT = Number(((sSub + newRes) / consT).toFixed(1));
            return {
              ...t,
              cap_reserva: capResSel,
              cap_reserva_lts: capResSel,
              reserva_lts: newRes,
              aut_total_h: autT,
              dias_aut: Number((autT / 24).toFixed(2))
            };
          }
          return t;
        }));

        // 3. Sincronizar Horómetro con Control de Mantenimiento en tiempo real
        if (parsedHoroFloat != null && !isNaN(parsedHoroFloat) && parsedHoroFloat > 0) {
          const plantTag = plant.tag;
          setMaintenances(prev => prev.map(m => {
            const mNorm = normFn(m.planta);
            if (plantTag ? m.tag === plantTag : mNorm === targetNorm) {
              const horasTrab = parseFloat((parsedHoroFloat - m.horometro_mtto).toFixed(1));
              const horasRest = parseFloat((m.intervalo - horasTrab).toFixed(1));
              let status = 'optimo';
              if (horasRest <= 0 || horasRest <= 20) status = 'critico';
              else if (horasRest <= 50) status = 'alerta';
              return {
                ...m,
                horometro_actual: parsedHoroFloat,
                horas_trabajadas: horasTrab,
                horas_restantes: horasRest,
                status
              };
            }
            return m;
          }));

          // Actualizar customHorometers para persistencia local
          setCustomHorometers(prev => ({
            ...prev,
            [plantTag || plant.lugar]: {
              horometro_actual: parsedHoroFloat,
              rawInput: newHorometro,
              updatedAt: new Date().toISOString()
            }
          }));

          // Sincronizar con Firestore equipment GEN
          if (db) {
            try {
              const nodesSnap = await db.collection('energy_nodes').get();
              for (const nDoc of nodesSnap.docs) {
                const eqSnap = await nDoc.ref.collection('energy_equipment')
                  .where('type', '==', 'GEN')
                  .where('tag', '==', plantTag)
                  .get();
                if (!eqSnap.empty) {
                  await eqSnap.docs[0].ref.update({ horometer: parsedHoroFloat });
                  break;
                }
              }
            } catch (eqErr) {
              console.warn('Error sincronizando horómetro con equipment:', eqErr);
            }
          }
        }

        // 4. Persistir en Firestore (energy_nodes/{id}/fuel/state y node.fuelState) y LocalStorage
        await persistNodeFuelUpdate({
          db,
          nodeName: plant.lugar,
          plantTag: plant.tag,
          resultingSub: newSub,
          resultingRes: newRes,
          resultingTotal: newTotal,
          addedTotalDespacho: 0,
          resultingLtsP: 0,
          resultingLtsR: 0,
          fuelDest: `Calibración (${motivo})`,
          fuelHoro: newHorometro || plant.horometro_actual || '',
          userProfile
        });

        // 5. Registrar auditoría en subcolección energy_records del nodo
        if (db) {
          try {
            const nodesSnap = await db.collection('energy_nodes').get();
            for (const nDoc of nodesSnap.docs) {
              const nData = nDoc.data();
              const nNorm = normFn(nData.name || nDoc.id);
              if (nNorm === targetNorm || (targetNorm && nNorm.includes(targetNorm)) || (nNorm && targetNorm.includes(nNorm))) {
                await nDoc.ref.collection('energy_records').add({
                  type: 'ajuste_combustible',
                  date: TS(),
                  generatorTag: plant.tag,
                  fuelTotalLevel: newTotal,
                  fuelSubLevel: newSub,
                  fuelReserveLevel: newRes,
                  fuelCapacitySub: newCapSub != null ? newCapSub : (plant.tanque_lts || 0),
                  fuelCapacityRes: newCapRes != null ? newCapRes : (plant.cap_reserva_lts || 0),
                  fuelHorometer: newHorometro || plant.horometro_actual || '',
                  diffReserve: diffRes,
                  diffSub: diffSub,
                  adjustmentReason: motivo,
                  technicianName: tecnico,
                  observations: obs || '',
                  createdBy: userProfile?.name || 'Técnico',
                  createdAt: TS()
                });
                break;
              }
            }
          } catch (e) {
            console.warn('Error saving fuel adjustment record:', e);
          }
        }

        if (toast) toast(`Planta ${plant.lugar} (${plant.tag}) calibrada y configurada exitosamente.`, 'success');
        setShowAdjustLevelModal(false);
        setSelectedPlantForAdjust(null);
      };

      const handleDeleteRefill = async (refillToDelete) => {
        // 1. Remover de refills
        const updatedRefills = refills.filter(r => r.id !== refillToDelete.id);
        setRefills(updatedRefills);

        // 2. Revertir niveles: sub-tanque solo de la planta del surtido, reserva solo en plantas del nodo con reserva
        let revertedTanksList = [];
        setTanks(prev => {
          revertedTanksList = revertFuelTanks(prev, {
            lugar: refillToDelete.lugar,
            tag: refillToDelete.tag,
            destino: refillToDelete.destino,
            litros: refillToDelete.litros,
            litrosPlanta: refillToDelete.litros_planta,
            litrosReserva: refillToDelete.litros_reserva,
            prevSub: refillToDelete.prev_subtanque_lts,
            prevRes: refillToDelete.prev_reserva_lts,
            resSub: refillToDelete.subtanque_lts,
            resRes: refillToDelete.reserva_lts
          });
          return revertedTanksList;
        });

        // Persistir tanques revertidos en Firestore para el nodo
        const normFnRev = normalizeNodeName;
        const targetNormRev = normFnRev(refillToDelete.lugar);
        const revT = (revertedTanksList.length > 0 ? revertedTanksList : tanks).find(t => (refillToDelete.tag && t.tag === refillToDelete.tag) || normFnRev(t.lugar) === targetNormRev);
        if (revT) {
          await persistNodeFuelUpdate({
            db,
            nodeName: refillToDelete.lugar,
            plantTag: refillToDelete.tag,
            resultingSub: revT.subtanque_actual,
            resultingRes: revT.reserva_lts,
            resultingTotal: (parseFloat(revT.subtanque_actual) || 0) + (parseFloat(revT.reserva_lts) || 0),
            addedTotalDespacho: 0,
            fuelDest: 'Reversión de Surtido Eliminado',
            fuelHoro: revT.horometro_actual || '',
            userProfile
          });
        }

        // 3. Revertir horómetro de la planta al anterior
        if (refillToDelete.tag) {
          const remainingForPlant = updatedRefills.filter(r => r.tag === refillToDelete.tag && r.horometro);
          let prevHorometer = 0;
          if (remainingForPlant.length > 0) {
            const prevHoroStr = String(remainingForPlant[0].horometro);
            const hMatch = prevHoroStr.match(/(\d+)h\s*(\d+)?m?/);
            if (hMatch) {
              prevHorometer = parseInt(hMatch[1]) + (parseInt(hMatch[2] || 0) / 60);
            } else {
              prevHorometer = parseFloat(prevHoroStr) || 0;
            }
          } else {
            const seed = INITIAL_MAINTENANCE_LOG.find(m => m.tag === refillToDelete.tag);
            if (seed) prevHorometer = seed.horometro_actual;
          }

          if (prevHorometer > 0) {
            setTanks(prev => prev.map(t => t.tag === refillToDelete.tag ? { ...t, horometro_actual: formatCleanHoro(prevHorometer) } : t));
            setMaintenances(prev => prev.map(m => {
              if (m.tag === refillToDelete.tag) {
                const horasTrab = parseFloat((prevHorometer - m.horometro_mtto).toFixed(1));
                const horasRest = parseFloat((m.intervalo - horasTrab).toFixed(1));
                let status = 'optimo';
                if (horasRest <= 0 || horasRest <= 20) status = 'critico';
                else if (horasRest <= 50) status = 'alerta';
                return { ...m, horometro_actual: prevHorometer, horas_trabajadas: horasTrab, horas_restantes: horasRest, status };
              }
              return m;
            }));

            if (db) {
              try {
                const nodesSnap = await db.collection('energy_nodes').get();
                for (const nDoc of nodesSnap.docs) {
                  const eqSnap = await nDoc.ref.collection('energy_equipment')
                    .where('type', '==', 'GEN')
                    .where('tag', '==', refillToDelete.tag)
                    .get();
                  if (!eqSnap.empty) {
                    await eqSnap.docs[0].ref.update({ horometer: prevHorometer });
                    break;
                  }
                }
              } catch (e) {
                console.error('Error reverting refill horometer in DB:', e);
              }
            }
          }
        }

        // 4. Si el surtido fue creado como un registro en un nodo, eliminarlo también del historial del nodo en Firestore
        if (db && refillToDelete.id) {
          try {
            const rawId = refillToDelete.id.startsWith('db_') ? refillToDelete.id.replace('db_', '') : (refillToDelete.id.startsWith('r_rec_') ? refillToDelete.id.replace('r_rec_', '') : '');
            if (rawId) {
              const nodesSnap = await db.collection('energy_nodes').get();
              for (const nDoc of nodesSnap.docs) {
                const recRef = nDoc.ref.collection('energy_records').doc(rawId);
                const recDoc = await recRef.get();
                if (recDoc.exists) {
                  await recRef.delete();
                  break;
                }
              }
            }
          } catch(e) {
            console.error('Error deleting record from node:', e);
          }
        }

        if (toast) toast('Surtido eliminado y valores restaurados correctamente en todo el sistema.', 'info');
      };

      const handleAddMaintenance = async (newMtto) => {
        // Actualizar el estado local
        setMaintenances(prev => {
          // Si existe la planta por tag, actualizar sus datos
          const idx = prev.findIndex(m => m.tag === newMtto.tag);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...newMtto };
            return updated;
          }
          return [newMtto, ...prev];
        });

        // Sincronizar con Firestore: actualizar lastMaintenanceHorometer en el equipo
        if (db && newMtto.tag && newMtto.horometro_mtto != null) {
          try {
            const nodesSnap = await db.collection('energy_nodes').get();
            for (const nDoc of nodesSnap.docs) {
              const eqSnap = await nDoc.ref.collection('energy_equipment')
                .where('type', '==', 'GEN')
                .where('tag', '==', newMtto.tag)
                .get();
              if (!eqSnap.empty) {
                const eDoc = eqSnap.docs[0];
                await eDoc.ref.update({
                  lastMaintenanceHorometer: parseFloat(newMtto.horometro_mtto) || 0,
                  horometer: parseFloat(newMtto.horometro_actual) || eDoc.data().horometer || 0
                });
                break;
              }
            }
          } catch (e) {
            console.error('Error syncing maintenance to DB:', e);
          }
        }

        if (toast) toast('Mantenimiento asentado exitosamente.', 'success');
        setShowNewMttoModal(false);
      };

      return (
        <div className="fin">
          {/* Segmented Control de Pestañas */}
          <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'center' }}>
            <div className="segmented-control">
              <button className={`segmented-btn ${tab === 'surtidos' ? 'active' : ''}`} onClick={() => setTab('surtidos')}>
                Control de Surtidos
              </button>
              <button className={`segmented-btn ${tab === 'tanques' ? 'active' : ''}`} onClick={() => setTab('tanques')}>
                Tanques y Autonomía
              </button>
              <button className={`segmented-btn ${tab === 'mtto' ? 'active' : ''}`} onClick={() => setTab('mtto')}>
                Mantenimiento de Plantas
              </button>
            </div>
          </div>

          {tab === 'surtidos' && (
            <SurtidosView
              refills={refills}
              tanks={tanks}
              maintenances={maintenances}
              customHorometers={customHorometers}
              onUpdatePlantHorometer={handleUpdatePlantHorometer}
              onOpenBatchHoroModal={() => setShowBatchHoroModal(true)}
              onOpenNewModal={() => {
                setSelectedPlantForRefill(null);
                setShowNewRefillModal(true);
              }}
              onSelectPlant={(plant) => {
                setSelectedPlantForRefill(plant);
                setShowNewRefillModal(true);
              }}
              onOpenAdjustModal={(plant) => {
                setSelectedPlantForAdjust(plant);
                setShowAdjustLevelModal(true);
              }}
              onDeleteRefill={handleDeleteRefill}
              toast={toast}
            />
          )}

          {tab === 'tanques' && (
            <TanquesAutonomiaView
              tanks={tanks}
              refills={refills}
              maintenances={maintenances}
              customHorometers={customHorometers}
              onUpdatePlantHorometer={handleUpdatePlantHorometer}
              onOpenBatchHoroModal={() => setShowBatchHoroModal(true)}
              toast={toast}
            />
          )}

          {tab === 'mtto' && (
            <MantenimientoPlantasView
              maintenances={maintenances}
              onOpenNewModal={() => setShowNewMttoModal(true)}
              toast={toast}
            />
          )}

          {showBatchHoroModal && (
            <UpdateHorometersModal
              tanks={tanks}
              refills={refills}
              maintenances={maintenances}
              customHorometers={customHorometers}
              onSave={handleBatchUpdateHorometers}
              onClose={() => setShowBatchHoroModal(false)}
              toast={toast}
            />
          )}

          {showNewRefillModal && (
            <NewFuelRefillModal
              tanks={tanks}
              userProfile={userProfile}
              preselectedPlant={selectedPlantForRefill}
              onSave={handleAddRefill}
              onClose={() => {
                setShowNewRefillModal(false);
                setSelectedPlantForRefill(null);
              }}
              toast={toast}
            />
          )}

          {showNewMttoModal && (
            <NewMaintenanceModal
              tanks={tanks}
              userProfile={userProfile}
              onSave={handleAddMaintenance}
              onClose={() => setShowNewMttoModal(false)}
            />
          )}

          {showAdjustLevelModal && (
            <AdjustFuelLevelModal
              tanks={tanks}
              preselectedPlant={selectedPlantForAdjust}
              userProfile={userProfile}
              onSave={handleAdjustFuelLevel}
              onClose={() => {
                setShowAdjustLevelModal(false);
                setSelectedPlantForAdjust(null);
              }}
              toast={toast}
            />
          )}
        </div>
      );
    }

    // ── MODAL: REGISTRAR NUEVO SURTIDO ───────────────────────────────────────
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
    // ── MODAL: CALIBRACIÓN Y AJUSTE DE NIVEL REAL DE COMBUSTIBLE ─────────────
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
    function NewMaintenanceModal({ tanks, userProfile, onSave, onClose }) {
      const [planta, setPlanta] = useState(tanks[0]?.lugar || '');
      const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
      const [horometroMtto, setHorometroMtto] = useState('');
      const [litrosAceite, setLitrosAceite] = useState('15 L');
      const [filtroAceite, setFiltroAceite] = useState('');
      const [filtroTrampa, setFiltroTrampa] = useState('');
      const [filtroComb, setFiltroComb] = useState('');
      const [filtroAire, setFiltroAire] = useState('No cambiado');
      const [intervalo, setIntervalo] = useState(250);
      const [obs, setObs] = useState('');

      const selTank = tanks.find(t => t.lugar === planta) || tanks[0];

      const handleSave = () => {
        if (!horometroMtto) {
          alert('Ingresa el horómetro al momento del mantenimiento.');
          return;
        }
        const hMtto = parseFloat(horometroMtto) || 0;
        const prox = hMtto + (parseFloat(intervalo) || 250);

        onSave({
          id: 'm_' + Date.now(),
          planta,
          tag: selTank?.equipo || 'PLT-GEN',
          kva: selTank?.kva || 100,
          fecha,
          horometro_mtto: hMtto,
          horometro_actual: hMtto,
          horas_trabajadas: 0,
          intervalo: parseFloat(intervalo) || 250,
          horas_restantes: parseFloat(intervalo) || 250,
          litros_aceite: litrosAceite,
          filtro_aceite: filtroAceite || 'Cambiado',
          filtro_trampa: filtroTrampa || 'N/A',
          filtro_comb: filtroComb || 'Cambiado',
          filtro_aire: filtroAire || 'No cambiado',
          prox_cambio: prox + ' h',
          obs,
          status: 'optimo'
        });
      };

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease' }} onClick={onClose}>
          <div className="card fin" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 540, padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="fd" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Asentar Mantenimiento Preventivo
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Planta / Generador</label>
                <select className="fi" value={planta} onChange={e => setPlanta(e.target.value)}>
                  {tanks.map(t => <option key={t.id} value={t.lugar}>{t.lugar} ({t.equipo})</option>)}
                </select>
              </div>

              <div>
                <label className="lbl">Fecha de Mantenimiento</label>
                <input className="fi" type="text" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Horómetro al Momento del Cambio</label>
                <input className="fi fm" type="number" step="any" placeholder="Ej: 1450" value={horometroMtto} onChange={e => setHorometroMtto(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Litros de Aceite Colocados</label>
                <input className="fi" type="text" placeholder="Ej: 15 L" value={litrosAceite} onChange={e => setLitrosAceite(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Intervalo de Mantenimiento (Horas)</label>
                <input className="fi fm" type="number" value={intervalo} onChange={e => setIntervalo(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Aceite (Código/Marca)</label>
                <input className="fi" type="text" placeholder="Ej: Qualid QL-51649" value={filtroAceite} onChange={e => setFiltroAceite(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro Trampa de Agua</label>
                <input className="fi" type="text" placeholder="Ej: Fleetguard FS1280" value={filtroTrampa} onChange={e => setFiltroTrampa(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Combustible</label>
                <input className="fi" type="text" placeholder="Ej: Fliplus 33405" value={filtroComb} onChange={e => setFiltroComb(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Aire</label>
                <input className="fi" type="text" placeholder="Ej: Original / No cambiado" value={filtroAire} onChange={e => setFiltroAire(e.target.value)} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Observaciones del Mantenimiento</label>
                <textarea className="fi" rows={2} placeholder="Detalles de la intervención..." value={obs} onChange={e => setObs(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" style={{ flex: 1 }} onClick={handleSave}>
                Guardar Mantenimiento
              </button>
              <button className="bs" style={{ flex: 1 }} onClick={onClose}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      );
    }


    
    // ── MODAL: ACTUALIZACIÓN RÁPIDA DE HORÓMETROS (BIDIRECCIONAL) ─────────────
    function UpdateHorometersModal({ tanks = [], refills = [], maintenances = [], customHorometers = {}, onSave, onClose, toast }) {
      const normFn = normalizeNodeName;

      // Inicializar el estado de edición local para todas las plantas
      const [entries, setEntries] = useState(() => {
        const map = {};
        tanks.forEach(t => {
          const sn = normFn(t.lugar);
          const plantKey = t.tag || sn;
          const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
          const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

          const hSur = lastRefill?.horometro ? parseHorometerToHours(lastRefill.horometro) : null;
          const hSurStr = lastRefill?.horometro ? formatCleanHoro(lastRefill.horometro) : '—';
          const fechaSur = lastRefill?.fecha || '—';

          const custom = customHorometers[plantKey] || (t.tag ? customHorometers[t.tag] : null);
          let hAct = null;
          let deltaH = null;

          if (custom) {
            if (custom.horometro_actual != null && !isNaN(custom.horometro_actual)) {
              hAct = parseFloat(custom.horometro_actual);
            }
            if (custom.delta_h != null && !isNaN(custom.delta_h)) {
              deltaH = parseFloat(custom.delta_h);
            }
          }

          if (hAct === null) {
            const mMtto = maintenances.find(m => m.tag ? (t.tag && m.tag === t.tag) : normFn(m.planta).includes(sn));
            if (mMtto && mMtto.horometro_actual != null) {
              hAct = typeof mMtto.horometro_actual === 'number' ? mMtto.horometro_actual : parseHorometerToHours(mMtto.horometro_actual);
            }
            if (hAct === null && t.horometro_actual != null) {
              hAct = typeof t.horometro_actual === 'number' ? t.horometro_actual : parseHorometerToHours(t.horometro_actual);
            }
            if (hAct === null && hSur !== null) {
              hAct = hSur;
            }
          }

          if (deltaH === null) {
            if (hAct !== null && hSur !== null && hAct >= hSur) {
              deltaH = parseFloat((hAct - hSur).toFixed(1));
            } else {
              deltaH = 0;
            }
          } else if (hAct === null && hSur !== null) {
            hAct = parseFloat((hSur + deltaH).toFixed(1));
          }

          map[plantKey] = {
            plantKey,
            tag: t.tag,
            lugar: t.lugar,
            zona: t.zona,
            region: t.region || 'Zulia',
            equipo: t.equipo || t.tag,
            consumoLh: parseFloat(t.consumo_lh) || 10,
            subActual: parseFloat(t.subtanque_actual) || 0,
            reservaLts: parseFloat(t.reserva_lts) || 0,
            hSur,
            hSurStr,
            fechaSur,
            horometro_actual: hAct !== null ? hAct : (hSur !== null ? hSur : ''),
            delta_h: deltaH !== null ? deltaH : 0
          };
        });
        return map;
      });

      const [search, setSearch] = useState('');
      const [regionFilter, setRegionFilter] = useState('all');
      const [zonaFilter, setZonaFilter] = useState('all');

      // Modificación bidireccional desde Horómetro Actual -> calcula Delta H
      const handleHoroActualChange = (key, val) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          const hSur = cur.hSur !== null ? cur.hSur : 0;
          let newDelta = cur.delta_h;
          if (val === '') {
            newDelta = 0;
          } else {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              newDelta = Math.max(0, parseFloat((parsed - hSur).toFixed(1)));
            }
          }
          return {
            ...prev,
            [key]: {
              ...cur,
              horometro_actual: val,
              delta_h: newDelta
            }
          };
        });
      };

      // Modificación bidireccional desde Horas Op. (Delta H) -> calcula Horómetro Actual
      const handleDeltaHChange = (key, val) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          const hSur = cur.hSur !== null ? cur.hSur : 0;
          let newHoro = cur.horometro_actual;
          if (val === '') {
            newHoro = hSur;
          } else {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) {
              newHoro = parseFloat((hSur + parsed).toFixed(1));
            }
          }
          return {
            ...prev,
            [key]: {
              ...cur,
              delta_h: val,
              horometro_actual: newHoro
            }
          };
        });
      };

      // Restablecer planta individual a 0 delta
      const handleResetPlant = (key) => {
        setEntries(prev => {
          const cur = prev[key];
          if (!cur) return prev;
          return {
            ...prev,
            [key]: {
              ...cur,
              delta_h: 0,
              horometro_actual: cur.hSur !== null ? cur.hSur : 0
            }
          };
        });
      };

      // Guardar todos los cambios
      const handleSave = () => {
        const payload = {};
        Object.keys(entries).forEach(k => {
          const e = entries[k];
          const hAct = e.horometro_actual !== '' ? parseFloat(e.horometro_actual) : null;
          const dH = e.delta_h !== '' ? parseFloat(e.delta_h) : 0;
          payload[k] = {
            horometro_actual: !isNaN(hAct) ? hAct : null,
            delta_h: !isNaN(dH) ? dH : 0,
            hSur: e.hSur
          };
        });
        onSave(payload);
        onClose();
      };

      const plantList = Object.values(entries);
      const uniqueZonas = Array.from(new Set(plantList.map(p => p.zona))).filter(Boolean).sort();

      const filteredList = plantList.filter(p => {
        if (regionFilter !== 'all' && (p.region || '').toLowerCase() !== regionFilter.toLowerCase()) return false;
        if (zonaFilter !== 'all' && p.zona !== zonaFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!p.lugar.toLowerCase().includes(q) && !(p.tag || '').toLowerCase().includes(q) && !(p.zona || '').toLowerCase().includes(q)) {
            return false;
          }
        }
        return true;
      });

      const totalModificadas = plantList.filter(p => (parseFloat(p.delta_h) || 0) > 0).length;

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card fin" style={{ width: '96%', maxWidth: 1100, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)' }}>
            
            {/* Header del Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0166ff 0%, #21c0fa 100%)', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </span>
                  Actualización Rápida de Horómetros & Horas de Operación
                </h3>
                <p style={{ fontSize: '.82rem', color: 'var(--tx3)', margin: '6px 0 0', maxWidth: 780 }}>
                  Ingresa manualmente el <strong>Horómetro Actual</strong> o las <strong>Horas Trabajadas (Delta H)</strong> de cada planta. El cálculo es bidireccional y recalcula el combustible consumido y la autonomía en tiempo real.
                </p>
              </div>
              <button
                type="button"
                className="bs"
                onClick={onClose}
                style={{ padding: '6px 12px', fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
                title="Cerrar ventana"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Cerrar
              </button>
            </div>

            {/* Filtros Rápidos */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <input
                  type="text"
                  className="fi"
                  placeholder="Buscar nodo, tag de planta o zona..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ padding: '7px 12px', fontSize: '.82rem' }}
                />
              </div>
              <div>
                <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '.82rem' }}>
                  <option value="all">Todas las Regiones</option>
                  <option value="zulia">Zulia</option>
                  <option value="falcon">Falcón</option>
                </select>
              </div>
              <div>
                <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '7px 12px', fontSize: '.82rem' }}>
                  <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                  {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx3)', display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                <span>Mostrando: <strong style={{ color: 'var(--tx1)' }}>{filteredList.length}</strong> plantas</span>
                <span>•</span>
                <span style={{ color: '#f59e0b' }}>Con Horas Op: <strong>{totalModificadas}</strong></span>
              </div>
            </div>

            {/* Tabla Editable */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.82rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-elevated)' }}>
                  <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.68rem', letterSpacing: '.05em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '10px 14px' }}>Lugar / Nodo</th>
                    <th style={{ padding: '10px 12px' }}>Planta & Tag</th>
                    <th style={{ padding: '10px 12px' }}>Último Surtido</th>
                    <th style={{ padding: '10px 12px', width: 140 }}>Horómetro Actual</th>
                    <th style={{ padding: '10px 12px', width: 130, textAlign: 'center' }}>Horas Op. (Δh)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Consumo Est.</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gasoil Neto</th>
                    <th style={{ padding: '10px 12px' }}>Autonomía</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((p, idx) => {
                    const deltaHNum = parseFloat(p.delta_h) || 0;
                    const consumoEst = Math.round(deltaHNum * p.consumoLh);
                    const stockTotal = p.subActual + p.reservaLts;
                    const stockNeto = Math.max(0, Math.round(stockTotal - consumoEst));
                    const autNetoH = p.consumoLh > 0 ? parseFloat((stockNeto / p.consumoLh).toFixed(1)) : 0;
                    const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));
                    const isCrit = diasAutNeto < 1.5;
                    const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
                    const badgeColor = isCrit ? '#ef4444' : (isAlert ? '#f59e0b' : '#10b981');
                    const badgeBg = isCrit ? 'rgba(239,68,68,0.12)' : (isAlert ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: (idx % 2 === 0) ? 'var(--bg-card)' : 'transparent' }}>
                        <td style={{ padding: '8px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.84rem' }}>{p.lugar}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)' }}>{p.zona}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.78rem' }}>{p.tag}</div>
                          <div style={{ fontSize: '.66rem', color: 'var(--tx3)' }}>{p.consumoLh} L/h</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: '.76rem' }}>{p.fechaSur}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {p.hSurStr}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              step="0.1"
                              className="fi fm"
                              value={p.horometro_actual}
                              onChange={e => handleHoroActualChange(p.plantKey, e.target.value)}
                              placeholder={p.hSur !== null ? p.hSur : '0'}
                              style={{
                                width: 88,
                                padding: '4px 6px',
                                fontSize: '.8rem',
                                fontWeight: 700,
                                color: 'var(--blue)',
                                textAlign: 'right'
                              }}
                              title="Ingresa el horómetro actual (calcula Delta H automáticamente)"
                            />
                            <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '.76rem', fontWeight: 800, color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)' }}>+</span>
                            <input
                              type="number"
                              step="0.1"
                              className="fi fm"
                              value={p.delta_h}
                              onChange={e => handleDeltaHChange(p.plantKey, e.target.value)}
                              placeholder="0.0"
                              style={{
                                width: 66,
                                padding: '4px 6px',
                                fontSize: '.8rem',
                                fontWeight: 800,
                                textAlign: 'center',
                                color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)',
                                background: deltaHNum > 20 ? 'rgba(245, 158, 11, 0.15)' : undefined,
                                borderColor: deltaHNum > 20 ? 'rgba(245, 158, 11, 0.45)' : undefined
                              }}
                              title="Ingresa horas acumuladas post-surtido (calcula horómetro actual)"
                            />
                            <span style={{ fontSize: '.7rem', fontWeight: 700, color: deltaHNum > 20 ? '#f59e0b' : 'var(--blue)' }}>h</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontWeight: 700, color: consumoEst > 0 ? '#ef4444' : 'var(--tx3)', fontSize: '.8rem' }}>
                            {consumoEst > 0 ? `~${consumoEst} L` : '0 L'}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontWeight: 800, color: 'var(--tx1)', fontSize: '.84rem' }}>
                            {stockNeto.toLocaleString()} L
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: '.72rem', fontWeight: 800, background: badgeBg, color: badgeColor }}>
                            {diasAutNeto} Días ({autNetoH}h)
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="bs"
                            onClick={() => handleResetPlant(p.plantKey)}
                            style={{ padding: '3px 8px', fontSize: '.68rem', opacity: deltaHNum > 0 ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Restablecer horas acumuladas a 0"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                            Reset
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: '.76rem', color: 'var(--tx3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--blue)', flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Al ingresar el horómetro actual o las horas acumuladas, ambos se calculan automáticamente y se actualizan en reportes, WhatsApp y descargas de Excel.</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="bs" onClick={onClose} style={{ padding: '8px 16px', fontSize: '.84rem' }}>
                  Cancelar
                </button>
                <button className="bp" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: '.84rem' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Guardar Horómetros
                </button>
              </div>
            </div>

          </div>
        </div>
      );
    }


export default CombustibleWrapper;
export { CombustibleWrapper, SurtidosView, TanquesAutonomiaView, MantenimientoPlantasView, PlantasQuickList, NewFuelRefillModal, AdjustFuelLevelModal, NewMaintenanceModal, UpdateHorometersModal };
