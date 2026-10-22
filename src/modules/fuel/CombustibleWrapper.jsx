import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useTransition, useContext } from 'react';
import { loadXLSX, loadHtml2Canvas } from '@/utils/exportLibs';
import { computeDispatchLevels, validateDispatch } from './fuelCalc';
import firebase, { db, TS, FieldValue } from '@/services/firebase';
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
        } catch (e) { return INITIAL_FUEL_REFILLS; }
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
        } catch (e) { return normalizeTanksList(INITIAL_FUEL_TANKS); }
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
              } catch(e) {}
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
                } catch(e) {}

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
        } catch (e) {}
      }, [refills]);

      useEffect(() => {
        try {
          localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tanks));
        } catch (e) {}
      }, [tanks]);

      // Estado de horómetros manuales y horas acumuladas por planta (persistencia local)
      const [customHorometers, setCustomHorometers] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_plant_horometers_v1');
          return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
      });
      const [showBatchHoroModal, setShowBatchHoroModal] = useState(false);

      useEffect(() => {
        try {
          localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(customHorometers));
        } catch (e) {}
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

    // ── COMPONENTE: LISTA RÁPIDA Y MODULAR DE PLANTAS ELÉCTRICAS ─────────────
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
    // ── VISTA 1: CONTROL DE SURTIDOS ─────────────────────────────────────────
    function SurtidosView({ refills = [], tanks = [], maintenances = [], customHorometers = {}, onUpdatePlantHorometer, onOpenBatchHoroModal, onOpenNewModal, onSelectPlant, onOpenAdjustModal, onDeleteRefill, toast }) {
      const [isDark, setIsDark] = useState(() => (document.documentElement.getAttribute('data-theme') || 'light') === 'dark');

      useEffect(() => {
        const updateTheme = () => {
          setIsDark((document.documentElement.getAttribute('data-theme') || 'light') === 'dark');
        };
        updateTheme();
        const obs = new MutationObserver(updateTheme);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
      }, []);

      // Sub-pestaña interna: 'historial' (por defecto) o 'reporte'
      const [surtidosTab, setSurtidosTab] = useState('historial'); // historial | reporte

      // Filtros
      const [regionFilter, setRegionFilter] = useState('all'); // all | zulia | falcon
      const [zonaFilter, setZonaFilter] = useState('all');
      const [semanaFilter, setSemanaFilter] = useState('all');
      const [lugarFilter, setLugarFilter] = useState('all');
      const [search, setSearch] = useState('');

      // Paginación para Historial de Despachos
      const [page, setPage] = useState(1);
      const [pageSize, setPageSize] = useState(15);

      // Reiniciar paginación al cambiar cualquier filtro
      useEffect(() => {
        setPage(1);
      }, [search, regionFilter, zonaFilter, semanaFilter, lugarFilter]);

      // Estado de reportes ejecutivos
      const [reportMode, setReportMode] = useState('cuadro'); // cuadro | monospace | lista | surtidos
      const [showTextReport, setShowTextReport] = useState(true);
      const [copySuccess, setCopySuccess] = useState(false);
      const [showImageModal, setShowImageModal] = useState(false);
      const [generatingImg, setGeneratingImg] = useState(false);

      const normFn = normalizeNodeName;

      // Función auxiliar para parsear fechas de surtido
      const parseRefillDate = str => {
        if (!str) return null;
        let datePart = String(str);
        if (datePart.includes(' / ')) {
          const parts = datePart.split(' / ');
          datePart = parts[parts.length - 1].trim();
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
          const d = new Date(datePart.replace(' ', 'T'));
          if (!isNaN(d.getTime())) return d;
        }
        const m = datePart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) {
          const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
          if (!isNaN(d.getTime())) return d;
        }
        const d = new Date(datePart);
        return isNaN(d.getTime()) ? null : d;
      };

      const uniqueSemanas = Array.from(new Set(refills.map(r => r.semana))).filter(Boolean);
      const uniqueZonas = Array.from(new Set(tanks.map(t => t.zona))).filter(Boolean).sort();
      const uniqueLugares = Array.from(new Set([...refills.map(r => r.lugar), ...tanks.map(t => t.lugar)])).filter(Boolean).sort();

      // Vercel Best Practice: rerender-use-deferred-value - Instant typing in search
      const deferredSearch = useDeferredValue(search);

      // Vercel Best Practice: js-index-maps - O(1) tank lookup Map instead of O(N*M) nested .find() loops
      const tanksLookup = useMemo(() => {
        const byTag = new Map();
        const byNormLugar = new Map();
        for (let i = 0; i < tanks.length; i++) {
          const t = tanks[i];
          if (t.tag) byTag.set(t.tag, t);
          const nl = normalizeNodeName(t.lugar);
          if (nl && !byNormLugar.has(nl)) byNormLugar.set(nl, t);
        }
        return { byTag, byNormLugar };
      }, [tanks]);

      // Vercel Best Practice: rerender-memo - Memoized filtered refills
      const filtered = useMemo(() => {
        const q = (deferredSearch || '').toLowerCase().trim();
        const regLow = regionFilter !== 'all' ? regionFilter.toLowerCase() : null;
        return refills.filter(r => {
          const matchingTank = (r.tag && tanksLookup.byTag.get(r.tag)) || tanksLookup.byNormLugar.get(normalizeNodeName(r.lugar)) || {};
          const tankRegion = (matchingTank.region || 'Zulia').toLowerCase();
          const tankZona = matchingTank.zona || '';

          if (regLow && tankRegion !== regLow) return false;
          if (zonaFilter !== 'all' && tankZona !== zonaFilter) return false;
          if (semanaFilter !== 'all' && r.semana !== semanaFilter) return false;
          if (lugarFilter !== 'all' && r.lugar !== lugarFilter) return false;
          if (q) {
            const matchLugar = (r.lugar || '').toLowerCase().includes(q);
            const matchTag = (r.tag || '').toLowerCase().includes(q);
            const matchTec = (r.tecnico || '').toLowerCase().includes(q);
            if (!matchLugar && !matchTag && !matchTec) return false;
          }
          return true;
        });
      }, [refills, tanksLookup, regionFilter, zonaFilter, semanaFilter, lugarFilter, deferredSearch]);

      // Vercel Best Practice: js-combine-iterations & rerender-memo - Single pass calculation
      const refillStats = useMemo(() => {
        let totalLitros = 0;
        let totPlanta = 0;
        let totReserva = 0;
        const lugaresSet = new Set();

        for (let i = 0; i < filtered.length; i++) {
          const r = filtered[i];
          const lts = parseFloat(r.litros) || 0;
          totalLitros += lts;
          if (r.lugar) lugaresSet.add(r.lugar);

          const lp = parseFloat(r.litros_planta) || 0;
          const lr = parseFloat(r.litros_reserva) || 0;
          if (lp > 0 || lr > 0) {
            totPlanta += lp;
            totReserva += lr;
          } else {
            const dest = r.destino || '';
            if (dest.includes('Planta')) {
              totPlanta += lts;
            } else {
              totReserva += lts;
            }
          }
        }
        const totalDespachos = filtered.length;
        const lugaresAtendidos = lugaresSet.size;
        const avgLitrosDespacho = totalDespachos > 0 ? Math.round(totalLitros / totalDespachos) : 0;
        return { totalLitros, totalDespachos, lugaresAtendidos, avgLitrosDespacho, totPlanta, totReserva };
      }, [filtered]);

      const { totalLitros, totalDespachos, lugaresAtendidos, avgLitrosDespacho, totPlanta, totReserva } = refillStats;
      const pctPlanta = totalLitros > 0 ? Math.round((totPlanta / totalLitros) * 100) : 0;
      const pctReserva = totalLitros > 0 ? (100 - pctPlanta) : 0;

      // Surtidos en los últimos 30 días
      const now = new Date();
      const maxRefillDate = filtered.reduce((max, r) => {
        const d = parseRefillDate(r.fecha);
        return d && (!max || d > max) ? d : max;
      }, null);
      const hasRecent = filtered.some(r => {
        const d = parseRefillDate(r.fecha);
        return d && (now - d) <= (30 * 24 * 60 * 60 * 1000) && (now - d) >= 0;
      });
      const refDate = hasRecent ? now : (maxRefillDate || now);
      const cutoff30Days = new Date(refDate.getTime() - (30 * 24 * 60 * 60 * 1000));

      const recentRefills = filtered.filter(r => {
        const d = parseRefillDate(r.fecha);
        return d && d >= cutoff30Days && d <= refDate;
      });
      const litrosUltimos30Dias = recentRefills.reduce((acc, r) => acc + (parseFloat(r.litros) || 0), 0);
      const despachosUltimos30Dias = recentRefills.length;

      // Paginación
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, filtered.length);
      const paginatedRefills = filtered.slice(startIndex, endIndex);

      // Cálculo de resumen ejecutivo con delta de horas operativas (H_act - H_surtido) y combustible consumido
      const getSitesSummaryData = () => {
        let filteredTanks = tanks;
        if (regionFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => (t.region || 'Zulia').toLowerCase() === regionFilter.toLowerCase());
        }
        if (zonaFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => t.zona === zonaFilter);
        }
        if (lugarFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => normFn(t.lugar) === normFn(lugarFilter));
        }
        if (search) {
          const q = search.toLowerCase();
          filteredTanks = filteredTanks.filter(t => 
            (t.lugar || '').toLowerCase().includes(q) || 
            (t.tag || '').toLowerCase().includes(q) || 
            (t.zona || '').toLowerCase().includes(q)
          );
        }

        return filteredTanks.map(t => {
          const sn = normFn(t.lugar);
          const siteTanks = tanks.filter(x => normFn(x.lugar) === sn);
          const isMulti = siteTanks.length > 1;
          const sharedRes = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.reserva_lts) || 0), 0);
          const sharedCapRes = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.cap_reserva || x.cap_reserva_lts) || 0), 0);
          const sumSub = siteTanks.reduce((acc, x) => acc + (parseFloat(x.subtanque_actual) || 0), 0);
          const totNodo = sumSub + sharedRes;

          // Buscar último surtido para esta planta específica por tag o por sitio
          const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
          const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

          // Horómetro del último surtido
          const hSur = lastRefill?.horometro ? parseHorometerToHours(lastRefill.horometro) : null;
          const hSurStr = lastRefill?.horometro ? formatCleanHoro(lastRefill.horometro) : '—';
          const fechaSur = lastRefill?.fecha || '—';

          // Ver si hay un valor ingresado manualmente en customHorometers
          const plantKey = t.tag || sn;
          const customEntry = customHorometers[plantKey] || (t.tag ? customHorometers[t.tag] : null);

          let hAct = null;
          let deltaH = null;

          if (customEntry) {
            if (customEntry.horometro_actual != null && !isNaN(customEntry.horometro_actual)) {
              hAct = parseFloat(customEntry.horometro_actual);
            }
            if (customEntry.delta_h != null && !isNaN(customEntry.delta_h)) {
              deltaH = parseFloat(customEntry.delta_h);
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

          // Horas de operación acumuladas desde el último surtido (Delta H)
          if (deltaH === null) {
            if (hAct !== null && hSur !== null && hAct >= hSur) {
              deltaH = parseFloat((hAct - hSur).toFixed(1));
            } else {
              deltaH = 0;
            }
          } else if (hAct === null && hSur !== null) {
            hAct = parseFloat((hSur + deltaH).toFixed(1));
          }

          const hActStr = hAct !== null ? formatCleanHoro(hAct) : '—';

          const consumoLh = parseFloat(t.consumo_lh) || 10;
          // Combustible consumido estimado desde último surtido
          const combustibleConsumido = Math.round(deltaH * consumoLh);

          // Stock neto disponible en nodo
          const subActual = parseFloat(t.subtanque_actual) || 0;
          const stockBruto = isMulti ? (subActual + Math.round(sharedRes / siteTanks.length)) : (subActual + sharedRes);
          const stockNeto = Math.max(0, Math.round(stockBruto - combustibleConsumido));

          // Autonomía neta
          const autNetoH = consumoLh > 0 ? parseFloat((stockNeto / consumoLh).toFixed(1)) : 0;
          const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));

          const isCrit = diasAutNeto < 1.5;
          const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
          const status = isCrit ? 'critico' : (isAlert ? 'alerta' : 'optimo');
          const statusLabel = isCrit ? 'Crítico' : (isAlert ? 'Alerta' : 'Óptimo');

          return {
            t,
            sn,
            plantKey,
            lugar: t.lugar,
            tag: t.tag,
            zona: t.zona,
            region: t.region || 'Zulia',
            equipo: t.equipo || t.tag,
            consumoLh,
            subActual,
            sharedRes,
            sharedCapRes,
            totNodo,
            lastRefill,
            fechaSur,
            hSur,
            hSurStr,
            hAct,
            hActStr,
            deltaH,
            combustibleConsumido,
            stockNeto,
            autNetoH,
            diasAutNeto,
            status,
            statusLabel,
            isMulti
          };
        });
      };

      // Generador del Reporte de Texto (Lista detallada con Delta H y Horómetros)
      const generateAutonomiaReport = () => {
        const data = getSitesSummaryData();
        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        const siteMap = new Map();
        data.forEach(item => {
          if (!siteMap.has(item.sn)) siteMap.set(item.sn, []);
          siteMap.get(item.sn).push(item);
        });

        let lines = [
          `Reporte de Autonomía y Combustible en Nodos (Coordinación de Grupos Electrógenos)`,
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Nodos: ${siteMap.size}`,
          ''
        ];

        let totNetoTotal = 0;
        let totConsumoTotal = 0;

        siteMap.forEach((plants, sn) => {
          const lugarName = plants[0]?.lugar || sn;
          const isMulti = plants.length > 1;
          const sharedRes = plants[0]?.sharedRes || 0;
          const sumSub = plants.reduce((acc, p) => acc + p.subActual, 0);
          const sumNeto = plants.reduce((acc, p) => acc + p.stockNeto, 0);
          const sumBurned = plants.reduce((acc, p) => acc + p.combustibleConsumido, 0);
          const sumConsumoLh = plants.reduce((acc, p) => acc + p.consumoLh, 0);
          const autTotH = sumConsumoLh > 0 ? Math.round(sumNeto / sumConsumoLh * 10) / 10 : 0;
          const diasAut = Math.round(autTotH / 24.0 * 10) / 10;

          totNetoTotal += sumNeto;
          totConsumoTotal += sumBurned;

          lines.push(`• ${lugarName}:`);
          if (isMulti) {
            plants.forEach(p => {
              lines.push(`  Planta ${p.tag}: Sub: ${p.subActual}L | Horo Act: ${p.hActStr} | Surtido: ${p.fechaSur} (${p.hSurStr}) | Op: +${p.deltaH}h (Consumo: ~${p.combustibleConsumido}L)`);
            });
            lines.push(`  Reserva: ${sharedRes} Lts | Stock Neto: ${sumNeto} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          } else {
            const p = plants[0];
            lines.push(`  Planta: ${p.subActual} Lts | Reserva: ${sharedRes} Lts | Stock Neto: ${sumNeto} Lts | Horo: ${p.hActStr} (+${p.deltaH}h op) | Autonomía: ${diasAut} Días (${autTotH}h)`);
          }
        });

        lines.push('');
        lines.push('══════════════════════════════════════════════');
        lines.push(`Total Gasoil Neto en Red: ${totNetoTotal.toLocaleString()} Lts | Consumo Est. Acumulado: ${totConsumoTotal.toLocaleString()} Lts`);

        return lines.join('\n');
      };

      // Generador del Reporte en Tabla Monospace (formato limpio y alineado para WhatsApp)
      const generateMonospaceTableReport = () => {
        const data = getSitesSummaryData();
        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        const pad = (s, len, right = false) => {
          const str = String(s || '');
          if (str.length > len) return str.slice(0, len - 1) + '…';
          return right ? str.padStart(len) : str.padEnd(len);
        };

        let lines = [
          '```',
          'AIRTEK ENERGY • REPORTE EJECUTIVO DE COMBUSTIBLE EN NODOS',
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Plantas: ${data.length}`,
          '─'.repeat(74),
          `${pad('NODO / PLANTA', 22)} | ${pad('ÚLT. SURTIDO', 12)} | ${pad('HORÓM.', 8)} | ${pad('OP.ACUM', 7)} | ${pad('GASOIL', 7, true)} | ${pad('AUTONOMÍA', 11)}`,
          '─'.repeat(74)
        ];

        let totalGasoil = 0;
        let totalConsumo = 0;

        data.forEach(item => {
          totalGasoil += item.stockNeto;
          totalConsumo += item.combustibleConsumido;

          const nodoCol = `${item.lugar.slice(0, 14)} (${item.tag.slice(0, 6)})`;
          const surCol = `${item.fechaSur.slice(0, 5)} ${item.hSurStr.slice(0, 6)}`;
          const horoCol = item.hActStr.slice(0, 8);
          const opCol = `+${item.deltaH.toFixed(1)}h`;
          const gasCol = `${item.stockNeto}L`;
          const autCol = `${item.diasAutNeto}d (${item.autNetoH}h)`;

          lines.push(`${pad(nodoCol, 22)} | ${pad(surCol, 12)} | ${pad(horoCol, 8)} | ${pad(opCol, 7)} | ${pad(gasCol, 7, true)} | ${pad(autCol, 11)}`);
        });

        lines.push('─'.repeat(74));
        lines.push(`TOTAL GASOIL EN RED: ${totalGasoil.toLocaleString()} Lts | CONSUMO EST.: ${totalConsumo.toLocaleString()} Lts`);
        lines.push('```');

        return lines.join('\n');
      };

      // Generador del Reporte de Despachos Semanales
      const generateSurtidosReport = () => {
        const titleSemana = semanaFilter !== 'all' ? ` - ${semanaFilter}` : '';
        let text = `Reporte de Surtidos de Combustible (Coordinación de Grupos Electrógenos)${titleSemana}\n\n`;
        filtered.forEach(r => {
          text += `${r.lugar}: ${r.litros} Lts (${r.destino || 'Reserva'}) | Total en Nodo: ${r.total_nodo || '—'} Lts\n`;
        });
        text += `\nTotal Litros Despachados: ${totalLitros} Lts en ${totalDespachos} despachos.`;
        return text;
      };

      const generateTextReport = () => {
        if (reportMode === 'monospace') return generateMonospaceTableReport();
        if (reportMode === 'lista') return generateAutonomiaReport();
        return generateSurtidosReport();
      };

      const copyReport = () => {
        const text = generateTextReport();
        navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          if (toast) toast('¡Reporte de texto copiado al portapapeles!', 'success');
          setTimeout(() => setCopySuccess(false), 2200);
        });
      };

      // Copiar cuadro como imagen usando html2canvas (con fondo adaptativo neutro #121214 / #ffffff)
      const copyExecutiveImage = async () => {
        const html2canvas = await loadHtml2Canvas();
        const cardEl = document.getElementById('airtek-executive-fuel-card-surtidos');
        if (!cardEl) return;
        setGeneratingImg(true);
        setTimeout(() => {
          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
            canvas.toBlob(blob => {
              if (navigator.clipboard && navigator.clipboard.write) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                  setGeneratingImg(false);
                  if (toast) toast('¡Cuadro copiado como imagen! Pégalo directamente en WhatsApp con Ctrl + V.', 'success');
                }).catch(() => {
                  const link = document.createElement('a');
                  link.download = `reporte_combustible_${Date.now()}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                  setGeneratingImg(false);
                  if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                });
              } else {
                const link = document.createElement('a');
                link.download = `reporte_combustible_${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                setGeneratingImg(false);
                if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
              }
            });
          }).catch(e => {
            setGeneratingImg(false);
            if (toast) toast('Error al generar imagen: ' + e.message, 'error');
          });
        }, 120);
      };

      const downloadExecutiveImage = async () => {

        const html2canvas = await loadHtml2Canvas();
        const cardEl = document.getElementById('airtek-executive-fuel-card-surtidos');
        if (!cardEl) return;
        setGeneratingImg(true);
        setTimeout(() => {
          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
            const link = document.createElement('a');
            link.download = `reporte_combustible_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setGeneratingImg(false);
            if (toast) toast('¡Imagen PNG descargada con éxito!', 'success');
          }).catch(e => {
            setGeneratingImg(false);
            if (toast) toast('Error al descargar: ' + e.message, 'error');
          });
        }, 120);
      };

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(r => ({
          'LUGAR / NODO': r.lugar,
          'TAG PLANTA': r.tag,
          'FECHA': r.fecha,
          'SEMANA': r.semana,
          'LITROS SURTIDOS': r.litros,
          'DESTINO': r.destino,
          'SUB-TANQUE (Lts)': r.subtanque_lts,
          'RESERVA (Lts)': r.reserva_lts,
          'TOTAL EN NODO (Lts)': r.total_nodo,
          'HORÓMETRO ACTUAL': r.horometro,
          'HORAS DE TRABAJO': r.horas_trabajo,
          'TÉCNICO / CUADRILLA': r.tecnico,
          'OBSERVACIONES': r.obs
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Surtidos de Combustible');
        XLSX.writeFile(wb, 'reporte_surtidos_combustible_' + Date.now() + '.xlsx');
      };

      const summaryData = getSitesSummaryData();
      const totalStockNeto = summaryData.reduce((acc, x) => acc + x.stockNeto, 0);
      const totalHorasOp = summaryData.reduce((acc, x) => acc + x.deltaH, 0);
      const totalConsumoEst = summaryData.reduce((acc, x) => acc + x.combustibleConsumido, 0);
      const optCount = summaryData.filter(x => x.diasAutNeto >= 3).length;
      const alertCount = summaryData.filter(x => x.diasAutNeto >= 1.5 && x.diasAutNeto < 3).length;
      const critCount = summaryData.filter(x => x.diasAutNeto < 1.5).length;

      return (
        <div>
          {/* Header Superior con Título y Acciones Principales */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Control de Surtidos de Combustible
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Registro, trazabilidad histórica y reportes ejecutivos de combustible para plantas eléctricas.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', fontSize: '.84rem' }}
                onClick={() => onOpenAdjustModal && onOpenAdjustModal(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Calibrar Niveles
              </button>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '.84rem' }}
                onClick={onOpenBatchHoroModal}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Actualizar Horómetros
              </button>
              <button className="bp" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={onOpenNewModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Registrar Surtido
              </button>
            </div>
          </div>

          {/* Componente Modular: Lista Rápida de Plantas Eléctricas */}
          <PlantasQuickList
            tanks={tanks}
            onSelectPlant={onSelectPlant || onOpenNewModal}
            onAdjustPlant={onOpenAdjustModal}
          />

          {/* Sub-navegación por Pestañas Internas (Segmented Control Corporativo) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setSurtidosTab('historial')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 18px',
                  borderRadius: 8,
                  fontSize: '.82rem',
                  fontWeight: surtidosTab === 'historial' ? 700 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: surtidosTab === 'historial' ? 'var(--primary)' : 'transparent',
                  color: surtidosTab === 'historial' ? '#ffffff' : 'var(--tx2)',
                  boxShadow: surtidosTab === 'historial' ? '0 2px 8px rgba(1, 102, 255, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Historial de Despachos
                <span style={{
                  fontSize: '.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: surtidosTab === 'historial' ? 'rgba(255,255,255,0.22)' : (isDark ? '#27272a' : '#e2e8f0'),
                  color: surtidosTab === 'historial' ? '#ffffff' : 'var(--tx2)',
                  fontWeight: 700
                }}>
                  {filtered.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSurtidosTab('reporte')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 18px',
                  borderRadius: 8,
                  fontSize: '.82rem',
                  fontWeight: surtidosTab === 'reporte' ? 700 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: surtidosTab === 'reporte' ? 'var(--primary)' : 'transparent',
                  color: surtidosTab === 'reporte' ? '#ffffff' : 'var(--tx2)',
                  boxShadow: surtidosTab === 'reporte' ? '0 2px 8px rgba(1, 102, 255, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                Reportes & Cuadro WhatsApp
              </button>
            </div>

            {surtidosTab === 'historial' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="bs" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '.82rem' }} onClick={exportExcel}>
                  <IconExcel size={15} color="#10b981" />
                  Descargar Excel
                </button>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              PESTAÑA 1: HISTORIAL DE DESPACHOS (ENFOQUE 100% EN TABLA Y MÉTRICAS DE SURTIDO)
              ══════════════════════════════════════════════════════════════════════ */}
          {surtidosTab === 'historial' && (
            <div>
              {/* Tarjetas KPI de Despacho */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                {/* KPI 1: Total Suministrado */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><rect x="6" y="7" width="6" height="5" rx="1"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Suministrado</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--tx1)', margin: '2px 0' }}>{totalLitros.toLocaleString()} Lts</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{lugaresAtendidos} sitios atendidos</div>
                  </div>
                </div>

                {/* KPI 2: Total Despachos */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(33, 192, 250, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#21c0fa', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Despachos</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#21c0fa', margin: '2px 0' }}>{totalDespachos}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Promedio: ~{avgLitrosDespacho} Lts/despacho</div>
                  </div>
                </div>

                {/* KPI 3: Suministro Últimos 30 Días */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Surtido en 30 Días</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', margin: '2px 0' }}>{litrosUltimos30Dias.toLocaleString()} Lts</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{despachosUltimos30Dias} despachos en el ciclo</div>
                  </div>
                </div>

                {/* KPI 4: Destino Planta vs Reserva */}
                <div className="card" style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Destino Combustible</div>
                    <div style={{ fontSize: '.72rem', fontWeight: 700 }}>
                      <span style={{ color: '#21c0fa' }}>{pctPlanta}%</span> <span style={{ color: 'var(--tx3)' }}>/</span> <span style={{ color: 'var(--primary)' }}>{pctReserva}%</span>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 7, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', display: 'flex', marginTop: 8, border: '1px solid var(--border)' }}>
                    <div style={{ width: `${pctPlanta}%`, background: '#21c0fa', transition: 'width 0.3s ease' }} title={`Planta: ${totPlanta.toLocaleString()} Lts (${pctPlanta}%)`} />
                    <div style={{ width: `${pctReserva}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }} title={`Reserva: ${totReserva.toLocaleString()} Lts (${pctReserva}%)`} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--tx3)', marginTop: 6 }}>
                    <span>Plt: <strong style={{ color: 'var(--tx1)' }}>{totPlanta.toLocaleString()}L</strong></span>
                    <span>Res: <strong style={{ color: 'var(--tx1)' }}>{totReserva.toLocaleString()}L</strong></span>
                  </div>
                </div>
              </div>

              {/* Barra de Filtros Compacta Integrada */}
              <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                    {/* Búsqueda Rápida */}
                    <div style={{ position: 'relative', minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                      <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input
                        className="fi"
                        type="text"
                        placeholder="Buscar lugar, tag o técnico..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '7px 12px 7px 30px', fontSize: '.82rem', width: '100%' }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', padding: 2, fontSize: '.75rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Filtro Región */}
                    <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 130 }}>
                      <option value="all">Todas las Regiones</option>
                      <option value="zulia">Zulia</option>
                      <option value="falcon">Falcón</option>
                    </select>

                    {/* Filtro Zona */}
                    <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 140 }}>
                      <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                      {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>

                    {/* Filtro Semana */}
                    <select className="fi" value={semanaFilter} onChange={e => setSemanaFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 140 }}>
                      <option value="all">Todas las Semanas ({uniqueSemanas.length})</option>
                      {uniqueSemanas.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Filtro Lugar */}
                    <select className="fi" value={lugarFilter} onChange={e => setLugarFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 150 }}>
                      <option value="all">Todos los Lugares ({uniqueLugares.length})</option>
                      {uniqueLugares.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    {/* Botón Limpiar Filtros */}
                    {(search || regionFilter !== 'all' || zonaFilter !== 'all' || semanaFilter !== 'all' || lugarFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setRegionFilter('all');
                          setZonaFilter('all');
                          setSemanaFilter('all');
                          setLugarFilter('all');
                        }}
                        className="bs"
                        style={{ padding: '6px 12px', fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--tx2)' }}
                        title="Limpiar todos los filtros"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabla Histórica de Surtidos con Paginación Inmediata */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                        <th style={{ padding: '12px 16px' }}>Lugar / Planta</th>
                        <th style={{ padding: '12px 14px' }}>Fecha & Semana</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Litros Suministrados</th>
                        <th style={{ padding: '12px 14px' }}>Destino</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total en Nodo</th>
                        <th style={{ padding: '12px 14px' }}>Horómetro</th>
                        <th style={{ padding: '12px 14px' }}>Técnico / Obs</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRefills.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--tx3)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              </svg>
                              <div style={{ fontWeight: 600, fontSize: '.92rem', color: 'var(--tx2)' }}>No se encontraron registros de surtidos</div>
                              <div style={{ fontSize: '.78rem' }}>Intenta ajustar o limpiar los filtros seleccionados.</div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedRefills.map((r, i) => (
                          <tr key={r.id || i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{r.lugar}</div>
                              <div style={{ fontSize: '.74rem', color: 'var(--blue)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{r.tag}</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div className="fm" style={{ fontWeight: 600, color: 'var(--tx1)' }}>{r.fecha}</div>
                              <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{r.semana}</div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span className="fm" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
                                +{r.litros} Lts
                              </span>
                              {(r.destino === 'Surtido Planta y Reserva' || (r.litros_planta > 0 && r.litros_reserva > 0)) && (
                                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>
                                  Plt: {r.litros_planta}L | Res: {r.litros_reserva}L
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {(() => {
                                const d = r.destino || 'Surtido Reserva';
                                let bg = 'rgba(1, 102, 255, 0.12)';
                                let color = 'var(--blue)';
                                if (d.includes('Planta y Reserva') || d === 'Ambos' || d === 'Distribuido') {
                                  bg = 'rgba(139, 92, 246, 0.15)'; color = '#8b5cf6';
                                } else if (d.includes('Planta') || d === 'Sub-tanque') {
                                  bg = 'rgba(33, 192, 250, 0.12)'; color = '#21c0fa';
                                }
                                return (
                                  <span className="badge" style={{ background: bg, color, fontWeight: 700 }}>
                                    {d}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div className="fm" style={{ fontWeight: 700, color: 'var(--green)' }}>{r.total_nodo} Lts</div>
                              <div style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>Sub: {r.subtanque_lts}L | Res: {r.reserva_lts}L</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{r.horometro}</div>
                              {r.horas_trabajo && <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Trabajadas: {r.horas_trabajo}</div>}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontSize: '.8rem', color: 'var(--tx1)', fontWeight: 600 }}>{r.tecnico}</div>
                              {r.obs && <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{r.obs}</div>}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  className="bs"
                                  style={{ padding: '5px 10px', fontSize: '.74rem', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                  onClick={() => {
                                    const text = generateFuelReportText({ nodeName: r.lugar, date: r.fecha, record: r, tanks });
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                      navigator.clipboard.writeText(text).then(() => {
                                        if (toast) toast('¡Mensaje de surtido para WhatsApp copiado al portapapeles!', 'success');
                                      });
                                    }
                                  }}
                                  title="Copiar mensaje de este surtido para WhatsApp"
                                >
                                  <IconCopy size={12} />
                                  WhatsApp
                                </button>
                                {onDeleteRefill && (
                                  <button
                                    className="bd"
                                    style={{ padding: '5px 10px', fontSize: '.74rem', borderRadius: 6, color: '#f55b5d', borderColor: 'rgba(245, 91, 93, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                    onClick={() => {
                                      if (window.confirm(`¿Deseas eliminar este registro de surtido (${r.litros}L en ${r.lugar})? Se revertirán los niveles de combustible y el horómetro a sus valores anteriores.`)) {
                                        onDeleteRefill(r);
                                      }
                                    }}
                                    title="Eliminar surtido y revertir valores"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer de Paginación */}
                {filtered.length > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 18px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    fontSize: '.8rem',
                    color: 'var(--tx2)',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        Mostrando <strong style={{ color: 'var(--tx1)' }}>{filtered.length === 0 ? 0 : startIndex + 1}</strong> – <strong style={{ color: 'var(--tx1)' }}>{endIndex}</strong> de <strong style={{ color: 'var(--tx1)' }}>{filtered.length}</strong> despachos
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                        <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>Por página:</span>
                        <select
                          value={pageSize}
                          onChange={e => {
                            setPageSize(Number(e.target.value));
                            setPage(1);
                          }}
                          className="fi"
                          style={{ padding: '3px 8px', fontSize: '.76rem', width: 'auto', minWidth: 60 }}
                        >
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="bs"
                        disabled={page <= 1}
                        onClick={() => setPage(1)}
                        style={{ padding: '5px 10px', fontSize: '.76rem', opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                        title="Primera página"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="bs"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ padding: '5px 12px', fontSize: '.76rem', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ‹ Anterior
                      </button>

                      <span style={{ padding: '0 8px', fontSize: '.78rem', fontWeight: 600, color: 'var(--tx1)' }}>
                        Página {page} de {totalPages}
                      </span>

                      <button
                        type="button"
                        className="bs"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        style={{ padding: '5px 12px', fontSize: '.76rem', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                      >
                        Siguiente ›
                      </button>
                      <button
                        type="button"
                        className="bs"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                        style={{ padding: '5px 10px', fontSize: '.76rem', opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                        title="Última página"
                      >
                        »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              PESTAÑA 2: REPORTES EJECUTIVOS & CUADRO WHATSAPP
              ══════════════════════════════════════════════════════════════════════ */}
          {surtidosTab === 'reporte' && (
            <div>
              {/* Barra Superior del Reporte: Selector de Formato y Botones de Exportación */}
              <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="fd" style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Formato de Reporte
                    </span>
                    <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'cuadro' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'cuadro' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'cuadro' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'cuadro' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('cuadro')}
                      >
                        Cuadro Gráfico
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'monospace' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'monospace' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'monospace' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'monospace' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('monospace')}
                      >
                        Tabla en Texto (WhatsApp)
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'lista' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'lista' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'lista' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'lista' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('lista')}
                      >
                        Lista Detallada
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'surtidos' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'surtidos' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'surtidos' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'surtidos' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('surtidos')}
                      >
                        Despachos Semanales
                      </button>
                    </div>
                  </div>

                  {/* Acciones de Exportación */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {reportMode === 'cuadro' ? (
                      <>
                        <button
                          className="bp"
                          disabled={generatingImg}
                          style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={copyExecutiveImage}
                        >
                          <IconCopy size={14} />
                          {generatingImg ? 'Generando Imagen...' : 'Copiar como Imagen para WhatsApp'}
                        </button>
                        <button
                          className="bs"
                          disabled={generatingImg}
                          style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={downloadExecutiveImage}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Descargar PNG
                        </button>
                        <button
                          className="bs"
                          style={{ padding: '6px 12px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => setShowImageModal(true)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                          Pantalla Completa
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="bs" style={{ padding: '5px 12px', fontSize: '.74rem' }} onClick={() => setShowTextReport(!showTextReport)}>
                          {showTextReport ? 'Ocultar' : 'Mostrar'}
                        </button>
                        <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={copyReport}>
                          <IconCopy size={14} />
                          {copySuccess ? '¡Copiado!' : 'Copiar Reporte'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Filtros específicos para el reporte */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Región:</label>
                    <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todas las Regiones</option>
                      <option value="zulia">Zulia</option>
                      <option value="falcon">Falcón</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Zona:</label>
                    <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todas las Zonas</option>
                      {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Lugar:</label>
                    <select className="fi" value={lugarFilter} onChange={e => setLugarFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todos los Lugares</option>
                      {uniqueLugares.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  {(regionFilter !== 'all' || zonaFilter !== 'all' || lugarFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setRegionFilter('all');
                        setZonaFilter('all');
                        setLugarFilter('all');
                      }}
                      className="bs"
                      style={{ padding: '4px 10px', fontSize: '.72rem', color: 'var(--tx2)' }}
                    >
                      Restablecer filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Vista Previa: Cuadro Gráfico o Textarea */}
              {reportMode === 'cuadro' ? (
                <div style={{ overflowX: 'auto', background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}`, padding: 8 }}>
                  <div
                    id="airtek-executive-fuel-card-surtidos"
                    style={{
                      minWidth: '980px',
                      padding: '24px 26px',
                      background: isDark ? '#121214' : '#ffffff',
                      borderRadius: 14,
                      fontFamily: "'Outfit', 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
                      color: isDark ? '#f8fafc' : '#090d16',
                      boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.85)' : '0 10px 30px rgba(0,0,0,0.06)',
                      border: isDark ? '1px solid #26262a' : '1px solid #e2e8f0'
                    }}
                  >
                    {/* Banner Superior */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '2px solid rgba(1, 102, 255, 0.3)' : '2px solid rgba(1, 102, 255, 0.25)', paddingBottom: 14, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: '.76rem', fontWeight: 800, color: isDark ? '#21c0fa' : '#0166ff', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                          AIRTEK ENERGY • COORDINACIÓN DE GRUPOS ELECTRÓGENOS
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: isDark ? '#ffffff' : '#090d16', letterSpacing: '-0.02em', marginTop: 1 }}>
                          ESTADO DE GASOIL & OPERACIÓN DE PLANTAS
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: isDark ? 'rgba(1, 102, 255, 0.15)' : 'rgba(1, 102, 255, 0.08)', border: isDark ? '1px solid rgba(1, 102, 255, 0.35)' : '1px solid rgba(1, 102, 255, 0.25)', fontSize: '.76rem', fontWeight: 700, color: isDark ? '#60a5fa' : '#0166ff', marginBottom: 3 }}>
                          Región: {regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS'} {zonaFilter !== 'all' ? `• ${zonaFilter}` : ''}
                        </div>
                        <div style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                          Fecha de Corte: {new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Resumen KPI Ejecutivo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Gasoil Neto</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#38bdf8' : '#0284c7', marginTop: 2 }}>{totalStockNeto.toLocaleString()} Lts</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Horas Op. Acumuladas</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#f59e0b' : '#d97706', marginTop: 2 }}>+{totalHorasOp.toFixed(1)} h</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Consumo Est. Acumulado</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#ef4444' : '#dc2626', marginTop: 2 }}>~{totalConsumoEst.toLocaleString()} Lts</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Semáforo de Nodos</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: '.72rem', fontWeight: 800 }}>
                          <span style={{ color: isDark ? '#10b981' : '#15803d' }}>{optCount} Ópt</span>
                          <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>•</span>
                          <span style={{ color: isDark ? '#f59e0b' : '#d97706' }}>{alertCount} Alert</span>
                          <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>•</span>
                          <span style={{ color: isDark ? '#ef4444' : '#dc2626' }}>{critCount} Crít</span>
                        </div>
                      </div>
                    </div>

                    {/* Tabla Gráfica Ejecutiva */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: isDark ? '#141416' : '#f1f5f9', borderBottom: isDark ? '2px solid #27272a' : '2px solid #cbd5e1', color: isDark ? '#a1a1aa' : '#475569', textTransform: 'uppercase', fontSize: '.66rem', letterSpacing: '.06em' }}>
                          <th style={{ padding: '9px 12px' }}>Lugar / Nodo</th>
                          <th style={{ padding: '9px 10px' }}>Planta & Tag</th>
                          <th style={{ padding: '9px 10px' }}>Último Surtido</th>
                          <th style={{ padding: '9px 10px' }}>Horómetro Actual</th>
                          <th style={{ padding: '9px 10px', textAlign: 'center' }}>Horas Op. Acum.</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right' }}>Gasoil Neto</th>
                          <th style={{ padding: '9px 10px' }}>Autonomía Neta</th>
                          <th style={{ padding: '9px 12px', textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.map((item, idx) => {
                          const badgeColor = item.status === 'critico' ? (isDark ? '#ef4444' : '#dc2626') : (item.status === 'alerta' ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#10b981' : '#15803d'));
                          const badgeBg = item.status === 'critico' ? (isDark ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.12)') : (item.status === 'alerta' ? (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(217,119,6,0.12)') : (isDark ? 'rgba(16,185,129,0.15)' : 'rgba(21,128,61,0.12)'));

                          return (
                            <tr key={idx} style={{ borderBottom: isDark ? '1px solid #222226' : '1px solid #e2e8f0', background: (idx % 2 === 0) ? (isDark ? '#141416' : '#ffffff') : (isDark ? '#18181b' : '#f8fafc') }}>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ fontWeight: 800, color: isDark ? '#ffffff' : '#090d16', fontSize: '.8rem' }}>{item.lugar}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#64748b' : '#64748b' }}>{item.zona}</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, color: isDark ? '#e2e8f0' : '#0166ff', fontFamily: "'JetBrains Mono', monospace" }}>{item.tag}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#38bdf8' : '#0284c7' }}>Consumo: {item.consumoLh} L/h</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#090d16' }}>{item.fechaSur}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {item.hSurStr}</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {generatingImg ? (
                                  <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace" }}>
                                    {item.hActStr}
                                  </div>
                                ) : (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={item.hAct !== null ? item.hAct : ''}
                                      placeholder={item.hSur !== null ? item.hSur : '0'}
                                      onChange={e => onUpdatePlantHorometer && onUpdatePlantHorometer(item.tag || item.sn, {
                                        horometro_actual: e.target.value,
                                        hSur: item.hSur
                                      })}
                                      style={{
                                        width: '74px',
                                        background: isDark ? '#0e0e10' : '#ffffff',
                                        border: isDark ? '1px solid #3f3f46' : '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        color: isDark ? '#38bdf8' : '#0166ff',
                                        fontSize: '.74rem',
                                        fontWeight: 700,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        padding: '2px 6px',
                                        textAlign: 'right',
                                        outline: 'none'
                                      }}
                                      title="Clic para editar horómetro actual (calcula Delta H automáticamente)"
                                    />
                                    <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>h</span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                {generatingImg ? (
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: '.72rem',
                                    fontWeight: 800,
                                    background: item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(217, 119, 6, 0.12)') : (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.1)'),
                                    color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff'),
                                    border: `1px solid ${item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)') : (isDark ? 'rgba(33, 192, 250, 0.3)' : 'rgba(1, 102, 255, 0.25)')}`
                                  }}>
                                    +{item.deltaH.toFixed(1)} h
                                  </span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                      <span style={{ fontSize: '.72rem', fontWeight: 800, color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff') }}>+</span>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={item.deltaH !== undefined && item.deltaH !== null ? item.deltaH : ''}
                                        placeholder="0.0"
                                        onChange={e => onUpdatePlantHorometer && onUpdatePlantHorometer(item.tag || item.sn, {
                                          delta_h: e.target.value,
                                          hSur: item.hSur
                                        })}
                                        style={{
                                          width: '56px',
                                          background: item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(217, 119, 6, 0.12)') : (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.08)'),
                                          border: `1px solid ${item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(217, 119, 6, 0.35)') : (isDark ? 'rgba(33, 192, 250, 0.35)' : 'rgba(1, 102, 255, 0.25)')}`,
                                          borderRadius: '6px',
                                          color: item.deltaH > 20 ? '#f59e0b' : '#38bdf8',
                                          fontSize: '.72rem',
                                          fontWeight: 800,
                                          fontFamily: "'JetBrains Mono', monospace",
                                          padding: '2px 4px',
                                          textAlign: 'center',
                                          outline: 'none'
                                        }}
                                        title="Clic para editar horas trabajadas post-surtido (calcula horómetro actual)"
                                      />
                                      <span style={{ fontSize: '.68rem', fontWeight: 700, color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff') }}>h</span>
                                    </div>
                                    {item.combustibleConsumido > 0 && (
                                      <div style={{ fontSize: '.64rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 }}>
                                        ~{item.combustibleConsumido} L quemados
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <div style={{ fontSize: '.92rem', fontWeight: 900, color: isDark ? '#10b981' : '#15803d' }}>{item.stockNeto.toLocaleString()} Lts</div>
                                <div style={{ fontSize: '.64rem', color: isDark ? '#64748b' : '#64748b' }}>Sub: {item.subActual}L | Res: {item.sharedRes}L</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 800, color: badgeColor, fontSize: '.84rem' }}>{item.diasAutNeto} Días</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b' }}>({item.autNetoH} hrs)</div>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '.68rem', fontWeight: 800, background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}33` }}>
                                  {item.statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pie del Cuadro Gráfico */}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: isDark ? '1px solid #26262a' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.66rem', color: isDark ? '#71717a' : '#64748b' }}>
                      <div>Airtek Energy • Coordinación de Grupos Electrógenos • Horas de Operación Acumuladas = Horo Actual - Horo Surtido</div>
                      <div>Generado el {new Date().toLocaleString('es-VE')}</div>
                    </div>
                  </div>
                </div>
              ) : (
                showTextReport && (
                  <textarea
                    className="fi fm"
                    readOnly
                    value={generateTextReport()}
                    style={{
                      width: '100%',
                      height: 220,
                      fontSize: '.82rem',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      background: 'var(--bg-surface)',
                      color: 'var(--tx1)',
                      padding: '12px 14px',
                      borderRadius: 8
                    }}
                  />
                )
              )}
            </div>
          )}

          {/* Modal de Pantalla Completa para Exportación de Imagen */}
          {showImageModal && (
            <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div className="card fin" style={{ width: '95%', maxWidth: 1060, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 className="fd" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Exportador de Cuadro Gráfico para WhatsApp
                    </h3>
                    <p style={{ fontSize: '.8rem', color: 'var(--tx3)', margin: '4px 0 0' }}>
                      Genera la imagen en alta resolución lista para copiar y pegar directamente en WhatsApp con Ctrl + V.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="bp"
                      disabled={generatingImg}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                      onClick={copyExecutiveImage}
                    >
                      <IconCopy size={16} />
                      {generatingImg ? 'Generando Imagen...' : 'Copiar Imagen (Pegar en WhatsApp)'}
                    </button>
                    <button
                      className="bs"
                      disabled={generatingImg}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '.84rem' }}
                      onClick={downloadExecutiveImage}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Descargar PNG
                    </button>
                    <button className="bs" onClick={() => setShowImageModal(false)} style={{ padding: '8px 14px' }}>
                      ✕ Cerrar
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', padding: 8, background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}` }}>
                  <div style={{ fontSize: '.8rem', color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
                    Haz clic en <strong>"Copiar Imagen"</strong> para llevarla directo al portapapeles y pegarla con <strong>Ctrl + V</strong> en WhatsApp.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      );
    }
    // ── VISTA 2: ESTADO DE TANQUES & AUTONOMÍA ────────────────────────────────
    function TanquesAutonomiaView({ tanks = [], refills = [], maintenances = [], customHorometers = {}, onUpdatePlantHorometer, onOpenBatchHoroModal, toast }) {
      const [isDark, setIsDark] = useState(() => (document.documentElement.getAttribute('data-theme') || 'light') === 'dark');

      useEffect(() => {
        const updateTheme = () => {
          setIsDark((document.documentElement.getAttribute('data-theme') || 'light') === 'dark');
        };
        updateTheme();
        const obs = new MutationObserver(updateTheme);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
      }, []);
      const [regionFilter, setRegionFilter] = useState('all');
      const [zonaFilter, setZonaFilter] = useState('all');
      const [statusFilter, setStatusFilter] = useState('all');
      const [search, setSearch] = useState('');
      const [showTextReport, setShowTextReport] = useState(false);
      const [copySuccess, setCopySuccess] = useState(false);
      const [showImageModal, setShowImageModal] = useState(false);
      const [generatingImg, setGeneratingImg] = useState(false);
      const [modalZoneFilter, setModalZoneFilter] = useState('all');

      const normFn = normalizeNodeName;

      const uniqueZonas = Array.from(new Set(tanks.map(t => t.zona))).filter(Boolean).sort();

      // Cálculo de métricas avanzadas (Delta H, consumo y stock neto) para cada planta
      const enrichedTanks = tanks.map(t => {
        const sn = normFn(t.lugar);
        const siteTanks = tanks.filter(x => normFn(x.lugar) === sn);
        const isMultiPlant = siteTanks.length > 1;
        const sharedReserva = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.reserva_lts) || 0), 0);
        const sharedCapReserva = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.cap_reserva || x.cap_reserva_lts) || 0), 0);
        const sumSubtanques = siteTanks.reduce((acc, x) => acc + (parseFloat(x.subtanque_actual) || 0), 0);
        const totNodo = sumSubtanques + sharedReserva;

        // Buscar último surtido por tag o sitio
        const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
        const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

        const hSur = lastRefill?.horometro ? parseHorometerToHours(lastRefill.horometro) : null;
        const hSurStr = lastRefill?.horometro ? formatCleanHoro(lastRefill.horometro) : '—';
        const fechaSur = lastRefill?.fecha || '—';

        // Ver si hay un valor ingresado manualmente en customHorometers
        const plantKey = t.tag || sn;
        const customEntry = customHorometers[plantKey] || (t.tag ? customHorometers[t.tag] : null);

        let hAct = null;
        let deltaH = null;

        if (customEntry) {
          if (customEntry.horometro_actual != null && !isNaN(customEntry.horometro_actual)) {
            hAct = parseFloat(customEntry.horometro_actual);
          }
          if (customEntry.delta_h != null && !isNaN(customEntry.delta_h)) {
            deltaH = parseFloat(customEntry.delta_h);
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

        // Horas de operación acumuladas desde el último surtido
        if (deltaH === null) {
          if (hAct !== null && hSur !== null && hAct >= hSur) {
            deltaH = parseFloat((hAct - hSur).toFixed(1));
          } else {
            deltaH = 0;
          }
        } else if (hAct === null && hSur !== null) {
          hAct = parseFloat((hSur + deltaH).toFixed(1));
        }

        const hActStr = hAct !== null ? formatCleanHoro(hAct) : '—';

        const consumoLh = parseFloat(t.consumo_lh) || 10;
        const combustibleConsumido = Math.round(deltaH * consumoLh);

        const subActual = parseFloat(t.subtanque_actual) || 0;
        const stockBruto = isMultiPlant ? (subActual + Math.round(sharedReserva / siteTanks.length)) : (subActual + sharedReserva);
        const stockNeto = Math.max(0, Math.round(stockBruto - combustibleConsumido));

        const autNetoH = consumoLh > 0 ? parseFloat((stockNeto / consumoLh).toFixed(1)) : 0;
        const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));

        const isCrit = diasAutNeto < 1.5;
        const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
        const status = isCrit ? 'critico' : (isAlert ? 'alerta' : 'optimo');
        const statusText = isCrit ? 'Crítico (<1.5d)' : isAlert ? 'Alerta (1.5-3d)' : 'Óptimo (>3d)';
        const badgeColor = isCrit ? '#ef4444' : isAlert ? '#f59e0b' : '#10b981';
        const badgeBg = isCrit ? 'rgba(239,68,68,0.12)' : isAlert ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';

        return {
          ...t,
          sn,
          plantKey,
          isMultiPlant,
          sharedReserva,
          sharedCapReserva,
          sumSubtanques,
          totNodo,
          lastRefill,
          fechaSur,
          hSur,
          hSurStr,
          hAct,
          hActStr,
          deltaH,
          combustibleConsumido,
          stockNeto,
          autNetoH,
          diasAutNeto,
          status,
          statusText,
          badgeColor,
          badgeBg
        };
      });

      const filtered = enrichedTanks.filter(t => {
        const tankRegion = (t.region || 'Zulia').toLowerCase();
        if (regionFilter !== 'all' && tankRegion !== regionFilter.toLowerCase()) return false;
        if (zonaFilter !== 'all' && t.zona !== zonaFilter) return false;
        if (statusFilter !== 'all') {
          if (statusFilter === 'optimo' && t.status !== 'optimo') return false;
          if (statusFilter === 'alerta' && t.status !== 'alerta') return false;
          if (statusFilter === 'critico' && t.status !== 'critico') return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const matchLugar = (t.lugar || '').toLowerCase().includes(q);
          const matchEq = (t.equipo || '').toLowerCase().includes(q);
          const matchTag = (t.tag || '').toLowerCase().includes(q);
          const matchZona = (t.zona || '').toLowerCase().includes(q);
          if (!matchLugar && !matchEq && !matchTag && !matchZona) return false;
        }
        return true;
      });

      const totalLtsRedNeto = filtered.reduce((acc, t) => acc + t.stockNeto, 0);
      const totalHorasOpRed = filtered.reduce((acc, t) => acc + t.deltaH, 0);
      const totalConsumoEstRed = filtered.reduce((acc, t) => acc + t.combustibleConsumido, 0);
      const optimos = filtered.filter(t => t.status === 'optimo').length;
      const alertas = filtered.filter(t => t.status === 'alerta').length;
      const criticos = filtered.filter(t => t.status === 'critico').length;

      const generateAutonomiaReportText = () => {
        const uniqueSites = [];
        const seen = new Set();
        filtered.forEach(t => {
          const sn = normFn(t.lugar);
          if (!seen.has(sn)) {
            seen.add(sn);
            uniqueSites.push(sn);
          }
        });

        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        let lines = [
          `Reporte de Autonomía y Combustible en Nodos (Coordinación de Grupos Electrógenos)`,
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Nodos Listados: ${uniqueSites.length}`,
          ''
        ];

        let totSub = 0;
        let totRes = 0;

        uniqueSites.forEach(sn => {
          const st = filtered.filter(t => normFn(t.lugar) === sn);
          const lugarName = st[0]?.lugar || sn;
          const isMulti = st.length > 1;

          const sharedRes = st.reduce((max, t) => Math.max(max, parseFloat(t.reserva_lts) || 0), 0);
          const sumSub = st.reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
          const totNodo = sumSub + sharedRes;

          totSub += sumSub;
          totRes += sharedRes;

          const totalConsumo = st.reduce((acc, t) => acc + (parseFloat(t.consumo_lh) || 10), 0);
          const autTotH = totalConsumo > 0 ? Math.round(totNodo / totalConsumo * 10) / 10 : 0;
          const diasAut = Math.round(autTotH / 24.0 * 10) / 10;

          if (isMulti) {
            const subsDetail = st.map(t => `${t.tag}: ${t.subtanque_actual}L`).join(', ');
            lines.push(`• ${lugarName}:`);
            lines.push(`  Planta: ${sumSub} Lts (${subsDetail}) | Reserva: ${sharedRes} Lts | Total: ${totNodo} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          } else {
            lines.push(`• ${lugarName}:`);
            lines.push(`  Planta: ${sumSub} Lts | Reserva: ${sharedRes} Lts | Total: ${totNodo} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          }
        });

        lines.push('');
        lines.push('══════════════════════════════════════════════');
        lines.push(`Total Gasoil: ${totSub + totRes} Lts (Plantas: ${totSub} Lts | Reservas: ${totRes} Lts)`);

        return lines.join('\n');
      };

      const copyReport = () => {
        const text = generateAutonomiaReportText();
        navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2200);
          if (toast) toast('¡Reporte copiado al portapapeles!', 'success');
        });
      };

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(t => ({
          'ZONA': t.zona,
          'LUGAR / DATACENTER': t.lugar,
          'EQUIPO': t.equipo,
          'TAG PLANTA': t.tag,
          'POTENCIA (kVA)': t.kva,
          'ÚLTIMO SURTIDO FECHA': t.fechaSur,
          'HORÓMETRO ÚLTIMO SURTIDO': t.hSurStr,
          'HORÓMETRO ACTUAL': t.hActStr,
          'HORAS OP. ACUMULADAS': t.deltaH,
          'CONSUMO ESTIMADO (Lts)': t.combustibleConsumido,
          'SUB-TANQUE (Lts)': t.subtanque_actual,
          'CAPACIDAD SUB-TANQUE (Lts)': t.tanque_lts,
          'RESERVA ACTUAL (Lts)': t.reserva_lts,
          'CAPACIDAD RESERVA (Lts)': t.cap_reserva,
          'TOTAL EN NODO (Lts)': (t.subtanque_actual || 0) + (t.reserva_lts || 0),
          'CONSUMO (L/h)': t.consumo_lh,
          'GASOIL NETO REAL (Lts)': t.stockNeto,
          'AUTONOMÍA NETA (h)': t.autNetoH,
          'AUTONOMÍA NETA (Días)': t.diasAutNeto,
          'ESTADO': t.statusText
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Autonomía de Combustible');
        XLSX.writeFile(wb, 'reporte_autonomia_combustible_' + Date.now() + '.xlsx');
      };

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Estado de Tanques y Autonomía de Combustible
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Monitoreo de almacenamiento de gasoil, consumos y proyección de días de respaldo continuo.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                onClick={onOpenBatchHoroModal}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Actualizar Horómetros
              </button>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                onClick={() => setShowImageModal(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Cuadro para WhatsApp
              </button>
              <button className="bs" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={exportExcel}>
                <IconExcel size={16} color="#10b981" />
                Descargar Excel
              </button>
            </div>
          </div>

          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            {/* Card 1: Total Gasoil Neto */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 22h12M4 9h10M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Gasoil Neto</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--tx1)', marginTop: 2, whiteSpace: 'nowrap' }}>{totalLtsRedNeto.toLocaleString()} Lts</div>
              </div>
            </div>

            {/* Card 2: Horas Op. Acumuladas */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Horas Op. Acumuladas</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b', marginTop: 2, whiteSpace: 'nowrap' }}>+{totalHorasOpRed.toFixed(1)} h</div>
              </div>
            </div>

            {/* Card 3: Nodos Óptimos (>3D) */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Nodos Óptimos (&gt;3d)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>{optimos}</div>
              </div>
            </div>

            {/* Card 4: Nodos Críticos (<1.5D) */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Nodos Críticos (&lt;1.5d)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444', marginTop: 2 }}>{criticos}</div>
              </div>
            </div>
          </div>

          {/* Formato de Texto Rápido para WhatsApp / Slack */}
          <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="fd" style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Reporte Rápido de Autonomía y Stock para WhatsApp
                </span>
                <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>
                  (Con Horómetros y Horas de Operación Acumuladas)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="bs" style={{ padding: '4px 10px', fontSize: '.72rem' }} onClick={() => setShowTextReport(!showTextReport)}>
                  {showTextReport ? 'Ocultar' : 'Mostrar'}
                </button>
                <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={copyReport}>
                  <IconCopy size={14} />
                  {copySuccess ? '¡Copiado!' : 'Copiar Reporte'}
                </button>
              </div>
            </div>

            {showTextReport && (
              <textarea
                className="fi fm"
                readOnly
                value={generateAutonomiaReportText()}
                style={{
                  width: '100%',
                  height: 160,
                  fontSize: '.82rem',
                  lineHeight: 1.55,
                  resize: 'vertical',
                  background: 'var(--bg-surface)',
                  color: 'var(--tx1)',
                  padding: '10px 14px',
                  borderRadius: 8
                }}
              />
            )}
          </div>

          {/* Filtros */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Región</label>
                <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todas las Regiones</option>
                  <option value="zulia">Zulia</option>
                  <option value="falcon">Falcón</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Zona Geográfica</label>
                <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                  {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Estado de Autonomía</label>
                <select className="fi" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todos los Estados</option>
                  <option value="optimo">Óptimos (&gt;3 días)</option>
                  <option value="alerta">Alerta (1.5 - 3 días)</option>
                  <option value="critico">Críticos (&lt;1.5 días)</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Búsqueda</label>
                <input className="fi" type="text" placeholder="Buscar lugar o planta..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 14px', fontSize: '.84rem' }} />
              </div>
            </div>
          </div>

          {/* Tabla de Autonomías con Horas de Operación Acumuladas */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '12px 16px' }}>Lugar / Datacenter</th>
                    <th style={{ padding: '12px 14px' }}>Equipo & Consumo</th>
                    <th style={{ padding: '12px 14px' }}>Último Surtido & Horas Op.</th>
                    <th style={{ padding: '12px 14px' }}>Sub-tanque</th>
                    <th style={{ padding: '12px 14px' }}>Reserva Externa</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Gasoil Neto</th>
                    <th style={{ padding: '12px 14px' }}>Autonomía Neta</th>
                    <th style={{ padding: '12px 14px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => {
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{t.lugar}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{t.zona}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx1)' }}>{t.equipo}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--blue)', fontFamily: "'JetBrains Mono', monospace" }}>{t.tag} • {t.consumo_lh} L/h</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '.76rem', color: 'var(--tx1)', fontWeight: 600 }}>{t.fechaSur} (Horo: {t.hSurStr})</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Horómetro Actual (calcula Delta H automáticamente)">
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>H.Act:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={t.hAct !== null ? t.hAct : ''}
                                placeholder={t.hSur !== null ? t.hSur : '0'}
                                onChange={(e) => onUpdatePlantHorometer && onUpdatePlantHorometer(t.tag || t.sn, { horometro_actual: e.target.value, hSur: t.hSur })}
                                style={{
                                  width: '68px',
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '5px',
                                  color: 'var(--blue)',
                                  fontSize: '.74rem',
                                  fontWeight: 700,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  padding: '2px 4px',
                                  textAlign: 'right'
                                }}
                              />
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="Horas acumuladas trabajadas post-surtido (Delta H)">
                              <span style={{ fontSize: '.74rem', fontWeight: 800, color: t.deltaH > 20 ? '#f59e0b' : 'var(--blue)' }}>+</span>
                              <input
                                type="number"
                                step="0.1"
                                value={t.deltaH !== undefined && t.deltaH !== null ? t.deltaH : ''}
                                placeholder="0.0"
                                onChange={(e) => onUpdatePlantHorometer && onUpdatePlantHorometer(t.tag || t.sn, { delta_h: e.target.value, hSur: t.hSur })}
                                style={{
                                  width: '54px',
                                  background: t.deltaH > 20 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-surface)',
                                  border: `1px solid ${t.deltaH > 20 ? 'rgba(245, 158, 11, 0.45)' : 'var(--border)'}`,
                                  borderRadius: '5px',
                                  color: t.deltaH > 20 ? '#f59e0b' : 'var(--tx1)',
                                  fontSize: '.74rem',
                                  fontWeight: 800,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  padding: '2px 4px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h op</span>
                            </div>
                          </div>
                          {t.combustibleConsumido > 0 && (
                            <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 2 }}>
                              ~{t.combustibleConsumido}L quemados ({t.consumoLh} L/h)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{t.subtanque_actual} / {t.tanque_lts} Lts</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: t.sharedReserva > 0 ? 'var(--green)' : 'var(--tx3)' }}>
                            {t.sharedReserva} {t.sharedCapReserva > 0 ? `/ ${t.sharedCapReserva}` : ''} Lts
                          </div>
                          {t.isMultiPlant && (
                            <div style={{ fontSize: '.68rem', color: 'var(--blue)', fontWeight: 600, marginTop: 1 }}>
                              (Compartida en Datacenter)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx1)' }}>{t.stockNeto.toLocaleString()} Lts</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)' }}>Bruto: {t.totNodo}L</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: t.badgeColor }}>
                            {t.diasAutNeto} Días
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>({t.autNetoH} horas continuas)</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, fontSize: '.74rem', fontWeight: 700, background: t.badgeBg, color: t.badgeColor }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.badgeColor }} />
                            {t.statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de Exportación de Cuadro en Imagen para WhatsApp */}
          {showImageModal && (() => {
            const modalTanks = filtered.filter(t => {
              if (modalZoneFilter === 'dc_sedes') return t.tipo === 'datacenter' || t.tipo === 'sede';
              if (modalZoneFilter === 'maracaibo') return t.zona === 'Maracaibo' && t.tipo === 'nodo';
              if (modalZoneFilter === 'col') return t.zona === 'Costa Oriental del Lago';
              if (modalZoneFilter === 'subregiones') return !['Maracaibo', 'Costa Oriental del Lago', 'San Francisco', 'Móvil'].includes(t.zona) || t.zona.includes('Guajira') || t.zona.includes('Perijá') || t.zona.includes('Cañada') || t.zona.includes('Lossada');
              return true;
            });

            const modalTotNeto = modalTanks.reduce((acc, t) => acc + (t.stockNeto || 0), 0);
            const modalTotSub = modalTanks.reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
            const modalTotRes = modalTanks.reduce((acc, t) => acc + (parseFloat(t.sharedReserva) || 0), 0);
            const modalTotDeltaH = modalTanks.reduce((acc, t) => acc + (t.deltaH || 0), 0);
            const modalTotConsumo = modalTanks.reduce((acc, t) => acc + (t.combustibleConsumido || 0), 0);
            const modalOptimos = modalTanks.filter(t => t.status === 'optimo').length;
            const modalAlertas = modalTanks.filter(t => t.status === 'alerta').length;
            const modalCriticos = modalTanks.filter(t => t.status === 'critico').length;

            const dcTanks = modalTanks.filter(t => t.tipo === 'datacenter');
            const sedeTanks = modalTanks.filter(t => t.tipo === 'sede');
            const mcboTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona === 'Maracaibo');
            const colTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona === 'Costa Oriental del Lago');
            const subregTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona !== 'Maracaibo' && t.zona !== 'Costa Oriental del Lago');
            const auxTanks = modalTanks.filter(t => t.tipo === 'auxiliar');

            const groups = [
              { title: 'Datacenters de Misión Crítica', items: dcTanks, iconColor: '#0166ff', badge: 'Tier III High-Availability' },
              { title: 'Sedes Principales & Oficinas Administrativas', items: sedeTanks, iconColor: '#21c0fa', badge: 'Continuidad de Operaciones' },
              { title: 'Nodos Zona Maracaibo & Atlantis', items: mcboTanks, iconColor: '#38bdf8', badge: 'Red Troncal Metropolitana' },
              { title: 'Nodos Costa Oriental del Lago (COL)', items: colTanks, iconColor: '#06b6d4', badge: 'Red Troncal Este' },
              { title: 'Nodos Sub Regiones (Guajira, Perijá, Cañada, Lossada)', items: subregTanks, iconColor: '#8b5cf6', badge: 'Red Foránea & Sub-regiones' },
              { title: 'Unidades Móviles & Generadores Auxiliares', items: auxTanks, iconColor: '#f59e0b', badge: 'Respaldo Móvil' }
            ].filter(g => g.items.length > 0);

            const activeZoneLabel = modalZoneFilter === 'dc_sedes' ? 'Datacenters & Sedes' :
              modalZoneFilter === 'maracaibo' ? 'Zona Maracaibo' :
              modalZoneFilter === 'col' ? 'Costa Oriental del Lago' :
              modalZoneFilter === 'subregiones' ? 'Sub Regiones' : 'Toda la Red';

            return (
              <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div className="card fin" style={{ width: '96%', maxWidth: 1120, maxHeight: '92vh', overflowY: 'auto', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  {/* Header del Modal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0166ff', boxShadow: '0 0 10px #0166ff' }} />
                        Exportador de Cuadro Gráfico para WhatsApp
                      </h3>
                      <p style={{ fontSize: '.8rem', color: 'var(--tx3)', margin: '4px 0 0' }}>
                        Diseño corporativo oficial Airtek Energy en alta definición. Listo para copiar al portapapeles y pegar directo con <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>Ctrl + V</kbd>.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="bp"
                        disabled={generatingImg}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', fontSize: '.84rem' }}
                        onClick={async () => {
                          const cardEl = document.getElementById('airtek-executive-fuel-card');
                          if (!cardEl) return;
                          const html2canvas = await loadHtml2Canvas();
                          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
                            canvas.toBlob(blob => {
                              if (navigator.clipboard && navigator.clipboard.write) {
                                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                                  setGeneratingImg(false);
                                  if (toast) toast('¡Imagen copiada al portapapeles! Pégala en WhatsApp con Ctrl + V.', 'success');
                                }).catch(() => {
                                  const link = document.createElement('a');
                                  link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                                  link.href = canvas.toDataURL('image/png');
                                  link.click();
                                  setGeneratingImg(false);
                                  if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                                });
                              } else {
                                const link = document.createElement('a');
                                link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                                link.href = canvas.toDataURL('image/png');
                                link.click();
                                setGeneratingImg(false);
                                if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                              }
                            });
                          }).catch(e => {
                            setGeneratingImg(false);
                            if (toast) toast('Error al generar imagen: ' + e.message, 'error');
                          });
                        }}
                      >
                        <IconCopy size={16} />
                        {generatingImg ? 'Generando Imagen...' : 'Copiar Imagen (WhatsApp)'}
                      </button>
                      <button
                        className="bs"
                        disabled={generatingImg}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: '.84rem' }}
                        onClick={async () => {
                          const cardEl = document.getElementById('airtek-executive-fuel-card');
                          if (!cardEl) return;
                          const html2canvas = await loadHtml2Canvas();
                          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
                            const link = document.createElement('a');
                            link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            setGeneratingImg(false);
                            if (toast) toast('¡Imagen PNG descargada con éxito!', 'success');
                          }).catch(e => {
                            setGeneratingImg(false);
                            if (toast) toast('Error: ' + e.message, 'error');
                          });
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Descargar PNG
                      </button>
                      <button className="bs" onClick={() => setShowImageModal(false)} style={{ padding: '9px 16px' }}>
                        ✕ Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Selector Rápido de Zona / Grupo */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Corte Visual:
                    </span>
                    {[
                      { id: 'all', label: 'Toda la Red', count: filtered.length },
                      { id: 'dc_sedes', label: 'Datacenters & Sedes', count: filtered.filter(t => t.tipo === 'datacenter' || t.tipo === 'sede').length },
                      { id: 'maracaibo', label: 'Maracaibo', count: filtered.filter(t => t.zona === 'Maracaibo' && t.tipo === 'nodo').length },
                      { id: 'col', label: 'Costa Oriental', count: filtered.filter(t => t.zona === 'Costa Oriental del Lago').length },
                      { id: 'subregiones', label: 'Sub Regiones', count: filtered.filter(t => !['Maracaibo', 'Costa Oriental del Lago', 'San Francisco', 'Móvil'].includes(t.zona) || t.zona.includes('Guajira') || t.zona.includes('Perijá') || t.zona.includes('Cañada') || t.zona.includes('Lossada')).length }
                    ].map(btn => {
                      const isActive = modalZoneFilter === btn.id;
                      return (
                        <button
                          key={btn.id}
                          onClick={() => setModalZoneFilter(btn.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontSize: '.75rem',
                            fontWeight: 700,
                            fontFamily: "'Montserrat', sans-serif",
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            background: isActive ? 'linear-gradient(135deg, #0166ff 0%, #21c0fa 100%)' : 'var(--bg-surface)',
                            color: isActive ? '#ffffff' : 'var(--tx2)',
                            border: isActive ? '1px solid #0166ff' : '1px solid var(--border)',
                            boxShadow: isActive ? '0 2px 10px rgba(1, 102, 255, 0.35)' : 'none'
                          }}
                        >
                          <span>{btn.label}</span>
                          <span style={{
                            background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-elevated)',
                            color: isActive ? '#ffffff' : 'var(--tx3)',
                            padding: '1px 6px',
                            borderRadius: 10,
                            fontSize: '.68rem',
                            fontWeight: 800
                          }}>
                            {btn.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Previsualización del Cuadro Gráfico (Elemento capturado por html2canvas) */}
                  <div style={{ overflowX: 'auto', padding: 12, background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 14, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}` }}>
                    <div
                      id="airtek-executive-fuel-card"
                      style={{
                        width: '1060px',
                        padding: '28px 32px',
                        background: isDark ? '#121214' : '#ffffff',
                        borderRadius: 16,
                        fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        color: isDark ? '#f8fafc' : '#090d16',
                        boxShadow: isDark ? '0 25px 50px rgba(0,0,0,0.85)' : '0 10px 30px rgba(0,0,0,0.06)',
                        border: isDark ? '1px solid #26262a' : '1px solid #e2e8f0'
                      }}
                    >
                      {/* Banner Superior Corporativo Airtek */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '2px solid rgba(1, 102, 255, 0.35)' : '2px solid rgba(1, 102, 255, 0.25)', paddingBottom: 18, marginBottom: 20 }}>
                        <div>
                          <div style={{ fontSize: '.78rem', fontWeight: 800, color: isDark ? '#21c0fa' : '#0166ff', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                            AIRTEK ENERGY • COORDINACIÓN DE GRUPOS ELECTRÓGENOS
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#ffffff' : '#090d16', letterSpacing: '-0.02em', marginTop: 2, fontFamily: "'Heading Pro Wide', 'Outfit', 'Montserrat', sans-serif" }}>
                            ESTADO DE COMBUSTIBLE & AUTONOMÍA EN NODOS
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, background: isDark ? 'rgba(1, 102, 255, 0.15)' : 'rgba(1, 102, 255, 0.08)', border: isDark ? '1px solid rgba(1, 102, 255, 0.4)' : '1px solid rgba(1, 102, 255, 0.25)', fontSize: '.8rem', fontWeight: 800, color: isDark ? '#60a5fa' : '#0166ff', marginBottom: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#21c0fa', boxShadow: '0 0 8px #21c0fa' }} />
                            <span>{activeZoneLabel.toUpperCase()}</span>
                            {regionFilter !== 'all' && <span>• {regionFilter.toUpperCase()}</span>}
                          </div>
                          <div style={{ fontSize: '.74rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                            Fecha de Corte: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong> • {new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Resumen KPI Ejecutivo (4 Tarjetas con Indicadores Clave) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
                        {/* KPI 1 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #0166ff, #21c0fa)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Total Gasoil Neto</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#21c0fa" strokeWidth="2.2"><path d="M3 2v20M21 2v20M12 2v20M3 12h18"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#38bdf8' : '#0284c7', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            {modalTotNeto.toLocaleString()} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4, display: 'flex', gap: 6 }}>
                            <span>Sub: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTotSub.toLocaleString()}L</strong></span>
                            <span>•</span>
                            <span>Res: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTotRes.toLocaleString()}L</strong></span>
                          </div>
                        </div>

                        {/* KPI 2 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Horas Op. Acumuladas</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#f59e0b' : '#d97706', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            +{modalTotDeltaH.toFixed(1)} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>hrs</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4 }}>
                            Operación registrada post-surtido
                          </div>
                        </div>

                        {/* KPI 3 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #ef4444, #f87171)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Consumo Estimado</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#ef4444' : '#dc2626', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            ~{modalTotConsumo.toLocaleString()} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4 }}>
                            Combustible consumido en ciclo
                          </div>
                        </div>

                        {/* KPI 4 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Semáforo de Disponibilidad</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(21, 128, 61, 0.12)', color: isDark ? '#10b981' : '#15803d', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(21, 128, 61, 0.25)'}` }}>
                              {modalOptimos} Ópt
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.12)', color: isDark ? '#f59e0b' : '#d97706', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)'}` }}>
                              {modalAlertas} Alert
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.12)', color: isDark ? '#ef4444' : '#dc2626', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(220, 38, 38, 0.25)'}` }}>
                              {modalCriticos} Crít
                            </span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 6 }}>
                            Total: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTanks.length}</strong> plantas monitoreadas
                          </div>
                        </div>
                      </div>

                      {/* Tabla Estilizada con Agrupación y Barras Visuales de Autonomía */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: isDark ? '#141416' : '#f1f5f9', borderBottom: isDark ? '2px solid #27272a' : '2px solid #cbd5e1', color: isDark ? '#a1a1aa' : '#475569', textTransform: 'uppercase', fontSize: '.66rem', letterSpacing: '.06em' }}>
                            <th style={{ padding: '10px 14px' }}>Lugar / Nodo</th>
                            <th style={{ padding: '10px 10px' }}>Planta & Tag</th>
                            <th style={{ padding: '10px 10px' }}>Último Surtido</th>
                            <th style={{ padding: '10px 10px' }}>Horómetro Actual</th>
                            <th style={{ padding: '10px 10px', textAlign: 'center' }}>Horas Op. (+Δh)</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gasoil Neto</th>
                            <th style={{ padding: '10px 12px' }}>Autonomía Neta</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((grp, gIdx) => {
                            const groupTotLts = grp.items.reduce((acc, t) => acc + (t.stockNeto || 0), 0);
                            return (
                              <React.Fragment key={gIdx}>
                                {/* Separador de Grupo / Categoría */}
                                <tr style={{ background: isDark ? 'linear-gradient(90deg, rgba(1, 102, 255, 0.15) 0%, #18181b 100%)' : 'linear-gradient(90deg, rgba(1, 102, 255, 0.08) 0%, rgba(241, 245, 249, 0.95) 100%)', borderTop: isDark ? '2px solid rgba(1, 102, 255, 0.35)' : '2px solid rgba(1, 102, 255, 0.2)', borderBottom: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                                  <td colSpan={8} style={{ padding: '7px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: grp.iconColor }} />
                                        <span style={{ fontSize: '.75rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#090d16', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                                          {grp.title}
                                        </span>
                                        <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>
                                          {grp.items.length} {grp.items.length === 1 ? 'unidad' : 'unidades'}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '.72rem', color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                                        Total Grupo: {groupTotLts.toLocaleString()} Lts
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Filas del Grupo */}
                                {grp.items.map((t, idx) => {
                                  const autPct = Math.min(100, Math.round((t.diasAutNeto / 7) * 100));
                                  const barGradient = t.diasAutNeto >= 3 ? 'linear-gradient(90deg, #10b981, #34d399)' :
                                    t.diasAutNeto >= 1.5 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)';

                                  return (
                                    <tr key={idx} style={{ borderBottom: isDark ? '1px solid #222226' : '1px solid #e2e8f0', background: (idx % 2 === 0) ? (isDark ? '#141416' : '#ffffff') : (isDark ? '#18181b' : '#f8fafc') }}>
                                      <td style={{ padding: '9px 14px' }}>
                                        <div style={{ fontWeight: 800, color: isDark ? '#ffffff' : '#090d16', fontSize: '.84rem' }}>{t.lugar}</div>
                                        <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                          <span>{t.zona}</span>
                                          {t.kva && <span>• {t.kva} kVA</span>}
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace", fontSize: '.8rem' }}>{t.tag}</div>
                                        <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>Consumo: {t.consumo_lh} L/h</div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#090d16' }}>{t.fechaSur}</div>
                                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {t.hSurStr}</div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace", fontSize: '.84rem' }}>
                                          {t.hActStr}
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: 6,
                                          fontSize: '.72rem',
                                          fontWeight: 800,
                                          background: t.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(217, 119, 6, 0.12)') : (t.deltaH > 0 ? (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.1)') : (isDark ? 'rgba(100, 116, 139, 0.15)' : 'rgba(100, 116, 139, 0.08)')),
                                          color: t.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (t.deltaH > 0 ? (isDark ? '#38bdf8' : '#0166ff') : (isDark ? '#94a3b8' : '#64748b')),
                                          border: `1px solid ${t.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)') : (t.deltaH > 0 ? (isDark ? 'rgba(33, 192, 250, 0.3)' : 'rgba(1, 102, 255, 0.25)') : (isDark ? 'rgba(100, 116, 139, 0.3)' : 'rgba(100, 116, 139, 0.2)'))}`
                                        }}>
                                          +{t.deltaH.toFixed(1)} h
                                        </span>
                                        {t.combustibleConsumido > 0 && (
                                          <div style={{ fontSize: '.64rem', color: isDark ? '#ef4444' : '#dc2626', fontWeight: 600, marginTop: 2 }}>
                                            ~{t.combustibleConsumido} L quemados
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                        <div style={{ fontSize: '.96rem', fontWeight: 900, color: isDark ? '#10b981' : '#15803d', fontFamily: "'JetBrains Mono', monospace" }}>
                                          {t.stockNeto.toLocaleString()} <span style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                                        </div>
                                        <div style={{ fontSize: '.64rem', color: isDark ? '#64748b' : '#64748b' }}>
                                          Sub: {t.subtanque_actual}L | Res: {t.sharedReserva}L
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                          <span style={{ fontWeight: 800, color: t.badgeColor, fontSize: '.9rem' }}>{t.diasAutNeto} Días</span>
                                          <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>({t.autNetoH}h)</span>
                                        </div>
                                        {/* Barra Visual de Nivel de Autonomía */}
                                        <div style={{ width: '100%', maxWidth: 110, height: 5, background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                                          <div style={{
                                            width: `${autPct}%`,
                                            height: '100%',
                                            background: barGradient,
                                            borderRadius: 3
                                          }} />
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          padding: '3px 9px',
                                          borderRadius: 6,
                                          fontSize: '.7rem',
                                          fontWeight: 800,
                                          background: t.badgeBg,
                                          color: t.badgeColor,
                                          border: `1px solid ${t.badgeColor}40`
                                        }}>
                                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.badgeColor, boxShadow: `0 0 6px ${t.badgeColor}` }} />
                                          {t.statusText}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Footer Oficial del Cuadro */}
                      <div style={{ marginTop: 18, paddingTop: 12, borderTop: isDark ? '1px solid #26262a' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.7rem', color: isDark ? '#71717a' : '#64748b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isDark ? '#10b981' : '#15803d' }} />
                          <span>Airtek Energy • Coordinación de Grupos Electrógenos • Monitoreo de Red 24/7</span>
                        </div>
                        <div>
                          Generado el {new Date().toLocaleString('es-VE')} • Sistema Oficial
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}</div>
      );
    }

    // ── VISTA 3: MANTENIMIENTO & HORÓMETROS ───────────────────────────────────
    function MantenimientoPlantasView({ maintenances, onOpenNewModal, toast }) {
      const [statusFilter, setStatusFilter] = useState('all');
      const [search, setSearch] = useState('');

      const filtered = maintenances.filter(m => {
        if (statusFilter !== 'all' && m.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchPlanta = (m.planta || '').toLowerCase().includes(q);
          const matchTag = (m.tag || '').toLowerCase().includes(q);
          if (!matchPlanta && !matchTag) return false;
        }
        return true;
      });

      const optimos = maintenances.filter(m => m.status === 'optimo').length;
      const alertas = maintenances.filter(m => m.status === 'alerta').length;
      const criticos = maintenances.filter(m => m.status === 'critico').length;

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(m => ({
          'PLANTA / LUGAR': m.planta,
          'TAG': m.tag,
          'POTENCIA (kVA)': m.kva,
          'FECHA ÚLTIMO MTTO': m.fecha,
          'HORÓMETRO MTTO': m.horometro_mtto,
          'HORÓMETRO ACTUAL': m.horometro_actual,
          'HORAS TRABAJADAS': m.horas_trabajadas,
          'INTERVALO (H)': m.intervalo,
          'HORAS RESTANTES (H/MTTO)': m.horas_restantes,
          'LITROS ACEITE': m.litros_aceite,
          'FILTRO ACEITE': m.filtro_aceite,
          'FILTRO TRAMPA AGUA': m.filtro_trampa,
          'FILTRO COMBUSTIBLE': m.filtro_comb,
          'FILTRO AIRE': m.filtro_aire,
          'PRÓXIMO CAMBIO': m.prox_cambio,
          'OBSERVACIONES': m.obs
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Mantenimiento de Plantas');
        XLSX.writeFile(wb, 'reporte_mantenimiento_plantas_' + Date.now() + '.xlsx');
      };

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Control de Horómetros y Mantenimiento Preventivo
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Seguimiento de horas de operación, ciclo de 250h y recambio de aceite y filtros.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={onOpenNewModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Registrar Mantenimiento
              </button>
              <button className="bs" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={exportExcel}>
                <IconExcel size={16} color="#10b981" />
                Descargar Excel
              </button>
            </div>
          </div>

          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <IconCheckCircle size={22} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Al Día (&gt;50h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{optimos}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Próximo (20-50h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{alertas}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <IconAlertTriangle size={22} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Urgente / Vencido</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{criticos}</div>
              </div>
            </div>
          </div>

          {/* Tabla de Mantenimientos */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '12px 16px' }}>Planta / Ubicación</th>
                    <th style={{ padding: '12px 14px' }}>Último Mantenimiento</th>
                    <th style={{ padding: '12px 14px' }}>Horómetro Actual</th>
                    <th style={{ padding: '12px 14px' }}>Horas Trabajadas</th>
                    <th style={{ padding: '12px 14px' }}>Horas Restantes (H/MTTO)</th>
                    <th style={{ padding: '12px 14px' }}>Filtros & Aceite</th>
                    <th style={{ padding: '12px 14px' }}>Próximo Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => {
                    const isCrit = m.status === 'critico';
                    const isAlert = m.status === 'alerta';
                    const badgeColor = isCrit ? '#ef4444' : isAlert ? '#f59e0b' : '#10b981';
                    const pctLife = Math.max(0, Math.min(100, Math.round((m.horas_restantes / m.intervalo) * 100)));

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{m.planta}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--blue)' }}>{m.tag} &middot; {m.kva} kVA</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 600, color: 'var(--tx1)' }}>{m.fecha}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>En horómetro: {m.horometro_mtto}h</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="fm" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.95rem' }}>{m.horometro_actual}h</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="fm" style={{ fontWeight: 700, color: 'var(--blue)' }}>+{m.horas_trabajadas}h</span>
                        </td>
                        <td style={{ padding: '12px 14px', minWidth: 150 }}>
                          <div className="fm" style={{ fontWeight: 800, fontSize: '1.05rem', color: badgeColor, marginBottom: 4 }}>
                            {m.horas_restantes}h
                          </div>
                          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                            <div style={{ width: `${pctLife}%`, height: '100%', background: badgeColor, borderRadius: 3 }} />
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '.76rem', color: 'var(--tx1)', fontWeight: 600 }}>Aceite: {m.litros_aceite} ({m.filtro_aceite})</div>
                          <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>Comb: {m.filtro_comb} | Aire: {m.filtro_aire}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{m.prox_cambio}</div>
                          {m.obs && <div style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>{m.obs}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
