import { useState, useEffect } from 'react';


import { SurtidosView } from '@/modules/fuel/views/SurtidosView';
import { PlantasQuickList } from '@/modules/fuel/views/PlantasQuickList';
import { TanquesAutonomiaView } from '@/modules/fuel/views/TanquesAutonomiaView';
import { MantenimientoPlantasView } from '@/modules/fuel/views/MantenimientoPlantasView';
import { AdjustFuelLevelModal } from '@/modules/fuel/components/AdjustFuelLevelModal';
import { UpdateHorometersModal } from '@/modules/fuel/components/UpdateHorometersModal';
import { NewFuelRefillModal } from '@/modules/fuel/components/NewFuelRefillModal';
import { NewMaintenanceModal } from '@/modules/fuel/components/NewMaintenanceModal';
import firebase, { db, TS } from '@/services/firebase';


import { normalizeNodeName, formatCleanHoro } from '@/utils/formatters';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, INITIAL_FUEL_REFILLS, persistNodeFuelUpdate, revertFuelTanks } from './fuelUtils';

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

        
export default CombustibleWrapper;
export { CombustibleWrapper, SurtidosView, TanquesAutonomiaView, MantenimientoPlantasView, PlantasQuickList, NewFuelRefillModal, AdjustFuelLevelModal, NewMaintenanceModal, UpdateHorometersModal };
