import { normalizeNodeName, formatCleanHoro } from '@/utils/formatters';
import { TS } from '@/services/firebase';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, INITIAL_FUEL_REFILLS } from './fuelData';

export { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, INITIAL_FUEL_REFILLS };

// Persistencia centralizada del estado de combustible en Firestore y LocalStorage
export async function persistNodeFuelUpdate({
  db,
  nodeId,
  nodeName,
  plantTag,
  resultingSub,
  resultingRes,
  resultingTotal,
  addedTotalDespacho,
  resultingLtsP = 0,
  resultingLtsR = 0,
  resultingCapRes = null,
  fuelDest = 'Surtido Reserva',
  fuelHoro = '',
  userProfile = {}
}) {
  const normFn = normalizeNodeName;
  const targetNorm = normFn(nodeName);

  // Base vigente de tanques: la calibrada por el usuario (localStorage) si existe.
  // Antes se usaba siempre la semilla, así que un cambio de capacidad se revertía
  // en el siguiente surtido.
  const readCurrentTanks = () => {
    try {
      const raw = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
      return Array.isArray(raw) && raw.length > 0 ? raw : INITIAL_FUEL_TANKS;
    } catch (e) {
      return INITIAL_FUEL_TANKS;
    }
  };
  const baseTanks = readCurrentTanks();

  // 1. Persistir en Firestore si db está disponible
  if (db) {
    try {
      let targetNodeId = nodeId;
      if (!targetNodeId) {
        try {
          const nodesSnap = await db.collection('energy_nodes').get();
          for (const nDoc of nodesSnap.docs) {
            const nData = nDoc.data();
            const nNorm = normFn(nData.name || nDoc.id);
            if (nNorm === targetNorm || (targetNorm && nNorm.includes(targetNorm)) || (nNorm && targetNorm.includes(nNorm))) {
              targetNodeId = nDoc.id;
              break;
            }
          }
        } catch (e) {
          console.warn('Error buscando nodo por nombre:', e);
        }
      }

      if (targetNodeId) {
        const capResOf = x => parseFloat(x.cap_reserva_lts != null ? x.cap_reserva_lts : x.cap_reserva) || 0;
        const siteMatchingTanks = baseTanks.filter(x => normFn(x.lugar) === targetNorm);
        const siteCapRes = siteMatchingTanks.reduce((m, x) => Math.max(m, capResOf(x)), 0);

        const fuelPayload = {
          reserva_lts: Number(resultingRes) || 0,
          subtanque_actual: Number(resultingSub) || 0,
          total_nodo_lts: Number(resultingTotal) || 0,
          lastRefillDate: new Date(),
          lastRefillLiters: Number(addedTotalDespacho) || 0,
          lastRefillPlanta: Number(resultingLtsP) || 0,
          lastRefillReserva: Number(resultingLtsR) || 0,
          lastRefillDestino: fuelDest || 'Surtido Reserva',
          lastRefillTag: plantTag || '',
          lastRefillHoro: fuelHoro || '',
          updatedBy: userProfile?.name || 'Técnico',
          updatedAt: TS()
        };

        // Solo se sobrescribe la capacidad si se conoce; si no, se deja la que
        // ya estaba en Firestore en lugar de escribir un 0 que la borraría.
        if (siteCapRes > 0) {
          fuelPayload.cap_reserva_lts = siteCapRes;
        } else if (resultingCapRes != null && Number(resultingCapRes) > 0) {
          fuelPayload.cap_reserva_lts = Number(resultingCapRes);
        }

        const batch = db.batch();
        const stateDocRef = db.collection('energy_nodes').doc(targetNodeId).collection('fuel').doc('state');
        const nodeDocRef = db.collection('energy_nodes').doc(targetNodeId);

        batch.set(stateDocRef, fuelPayload, { merge: true });
        batch.set(nodeDocRef, { fuelState: fuelPayload }, { merge: true });
        await batch.commit();
      }
    } catch (fsErr) {
      console.warn('Advertencia al persistir combustible en Firestore:', fsErr);
    }
  }

  // 2. Persistir en LocalStorage (airtek_fuel_tanks_v13) con coincidencia normalizada y reserva compartida
  try {
    const capResOf = x => parseFloat(x.cap_reserva_lts != null ? x.cap_reserva_lts : x.cap_reserva) || 0;
    const siteCapRes = baseTanks.filter(x => normFn(x.lugar) === targetNorm).reduce((m, x) => Math.max(m, capResOf(x)), 0);
    const updatedTanks = baseTanks.map(t => {
      const tNorm = normFn(t.lugar);
      const exactNode = tNorm === targetNorm;
      const isPlant = plantTag ? t.tag === plantTag : (exactNode || (targetNorm && tNorm.includes(targetNorm)) || (tNorm && targetNorm.includes(tNorm)));
      const subCap = parseFloat(t.tanque_lts) || 0;
      const effectiveCapRes = exactNode && siteCapRes > 0 ? siteCapRes : capResOf(t);
      if (!isPlant && !exactNode) return t;
      const curS = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
      const newS = isPlant ? (subCap > 0 ? Math.min(subCap, Math.max(0, Number(resultingSub) || 0)) : (Number(resultingSub) || 0)) : curS;
      const newR = exactNode ? (effectiveCapRes > 0 ? Math.min(effectiveCapRes, Math.max(0, Number(resultingRes) || 0)) : Math.max(0, Number(resultingRes) || 0)) : (parseFloat(t.reserva_lts) || 0);
      const autTotal = t.consumo_lh > 0 ? Number(((newS + newR) / t.consumo_lh).toFixed(1)) : t.aut_total_h;
      return {
        ...t,
        cap_reserva: effectiveCapRes,
        cap_reserva_lts: effectiveCapRes,
        subtanque_actual: newS,
        reserva_lts: newR,
        aut_total_h: autTotal,
        dias_aut: Number((autTotal / 24).toFixed(2))
      };
    });
    localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(updatedTanks));
  } catch (lsErr) {
    console.warn('Error guardando tanques en LocalStorage:', lsErr);
  }

  // 3. Notificar a componentes locales en tiempo real
  try {
    window.dispatchEvent(new CustomEvent('airtek_fuel_updated', {
      detail: {
        nodeId,
        nodeName,
        plantTag,
        resultingRes: Number(resultingRes) || 0,
        resultingSub: Number(resultingSub) || 0,
        resultingTotal: Number(resultingTotal) || 0
      }
    }));
  } catch (e) {}
}

// Revierte el efecto de un surtido sobre los tanques: sub-tanque SOLO de la planta (por tag)
// y reserva compartida SOLO en las plantas del mismo nodo que realmente tienen reserva.
export function revertFuelTanks(tanksList, r) {
  const normFn = normalizeNodeName;
  const target = normFn(r.lugar);
  const capRes = x => parseFloat(x.cap_reserva_lts != null ? x.cap_reserva_lts : x.cap_reserva) || 0;
  return tanksList.map(t => {
    const exactNode = normFn(t.lugar) === target;
    const isPlant = r.tag ? t.tag === r.tag : exactNode;
    const resCap = capRes(t);
    const subCap = parseFloat(t.tanque_lts) || 0;
    const shareRes = exactNode && resCap > 0;
    if (!isPlant && !shareRes) return t;

    let dSub = 0, dRes = 0;
    const hasPrev = r.prevSub != null && r.resSub != null && !isNaN(parseFloat(r.prevSub)) && !isNaN(parseFloat(r.resSub));
    if (hasPrev) {
      dSub = parseFloat(r.resSub) - parseFloat(r.prevSub);
      dRes = (r.prevRes != null && r.resRes != null) ? (parseFloat(r.resRes) - parseFloat(r.prevRes)) : 0;
    } else {
      const d = r.destino || 'Surtido Reserva';
      const l = parseFloat(r.litros) || 0;
      const lP = parseFloat(r.litrosPlanta) || 0;
      const lR = parseFloat(r.litrosReserva) || 0;
      if (d === 'Surtido Reserva' || d === 'Reserva') { dRes = l; }
      else if (d === 'Surtido Planta' || d === 'Sub-tanque' || d === 'Trasiego Interno') { dSub = lP || l; dRes = -(lP || l); }
      else { dSub = lP || (l / 2); dRes = lR || (l / 2); }
    }

    let sub = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
    let res = parseFloat(t.reserva_lts) || 0;
    if (isPlant) sub = Math.max(0, sub - dSub);
    if (subCap > 0) sub = Math.min(subCap, sub);
    if (shareRes) {
      res = Math.max(0, res - dRes);
      res = Math.min(resCap, res);
    }
    const total = sub + res;
    const autTotal = t.consumo_lh > 0 ? Number((total / t.consumo_lh).toFixed(1)) : t.aut_total_h;
    const out = { ...t, subtanque_actual: sub, reserva_lts: res, aut_total_h: autTotal, dias_aut: Number((autTotal / 24).toFixed(2)) };
    if (isPlant && r.prevHoro) out.horometro_actual = r.prevHoro;
    return out;
  });
}

// Generador de Formato de Texto de Surtido para WhatsApp / Reportes
export function generateFuelReportText({ nodeName, date, record, equipment = [], tanks = [] }) {
  const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date || Date.now()));
  let fechaStr;
  if (typeof date === 'string' && date.includes('/')) {
    fechaStr = date;
  } else {
    const diaNum = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    fechaStr = `${diaNum}/${mes}/${anio}`;
  }

  // Nombre de la sede limpio (ej. "Nodo Comedor" -> "Comedor", "Comedor" -> "Comedor")
  let cleanNode = (nodeName || record?.lugar || 'Nodo').trim();
  cleanNode = cleanNode.replace(/^nodo\s+/i, '').trim();

  // Buscar tanques de este nodo
  const normFn = normalizeNodeName;
  const nodeNorm = normFn(cleanNode);
  const siteTanks = (tanks && tanks.length > 0 ? tanks : INITIAL_FUEL_TANKS).filter(t => {
    const tNorm = normFn(t.lugar);
    return tNorm === nodeNorm || (nodeNorm && tNorm.includes(nodeNorm)) || (tNorm && nodeNorm.includes(tNorm));
  });
  const siteMaxRes = siteTanks.reduce((max, t) => Math.max(max, t.reserva_lts || 0), 0);
  const currentReserva = record?.fuelReserveLevel !== undefined 
    ? record.fuelReserveLevel 
    : (record?.reserva_lts !== undefined ? record.reserva_lts : siteMaxRes);

  // Generadores del nodo ordenados
  const gens = (equipment || []).filter(e => e.type === 'GEN').sort((a,b) => (a.tag || '').localeCompare(b.tag || ''));

  // Determinar litros a planta y a reserva
  const isDual = record?.fuelDestination === 'Surtido Planta y Reserva' || record?.destino === 'Surtido Planta y Reserva' || ((record?.litros_planta > 0 || record?.fuelLitersPlanta > 0) && (record?.litros_reserva > 0 || record?.fuelLitersReserva > 0));
  const isPlanta = isDual || record?.fuelDestination === 'Surtido Planta' || record?.destino === 'Surtido Planta' || record?.destino === 'Sub-tanque';
  const isReserva = isDual || record?.fuelDestination === 'Surtido Reserva' || record?.destino === 'Surtido Reserva' || record?.destino === 'Reserva';

  const ltsPlantaTotal = isDual ? (parseFloat(record?.fuelLitersPlanta || record?.litros_planta) || 0) : (isPlanta ? (parseFloat(record?.fuelLiters || record?.litros) || 0) : 0);
  const ltsReserva = isDual ? (parseFloat(record?.fuelLitersReserva || record?.litros_reserva) || 0) : (isReserva ? (parseFloat(record?.fuelLiters || record?.litros) || 0) : 0);

  // Horas del generador
  const gHoro = formatCleanHoro(record?.fuelHorometer || record?.horometro || gens[0]?.horometer || '');

  let lines = [];
  lines.push(`${cleanNode} ${fechaStr}`);

  const isTrasiego = record?.fuelDestination === 'Trasiego Interno' || record?.destino === 'Trasiego Interno';
  const ltsTrasiego = parseFloat(record?.fuelLitersPlanta || record?.litros_planta || record?.fuelLiters || record?.litros) || 0;
  if (isTrasiego) {
    lines.push(`Trasiego interno a planta: ${ltsTrasiego} litros`);
  } else if (isDual) {
    lines.push(`Surtido a la planta: ${ltsPlantaTotal} litros`);
    lines.push(`Surtido a la reserva: ${ltsReserva} litros`);
  } else if (isReserva) {
    lines.push(`Surtido a la reserva: ${ltsReserva} litros`);
  } else {
    lines.push(`Surtido a la planta: ${ltsPlantaTotal} litros`);
  }

  lines.push(`Reserva: ${currentReserva} litros`);
  lines.push(`Horas: ${gHoro}`);

  const obsText = (record?.observations || record?.obs || '').trim();
  if (obsText) {
    lines.push(`Obs: ${obsText}`);
  }

  return lines.join('\n');
}
