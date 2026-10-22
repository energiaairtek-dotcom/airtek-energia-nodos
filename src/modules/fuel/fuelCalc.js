// Cálculos puros del despacho de combustible.
// Replica la "Tabla de la Verdad" que antes vivía duplicada dentro de los
// componentes (NewFuelRefillModal y el formulario de registro de nodos).
//
// Reglas:
//  - Surtido Reserva: llena la reserva hasta su tope. El registro declara los
//    litros despachados (aunque el tanque se llene antes).
//  - Surtido Planta: descuenta de la reserva compartida y llena el subtanque
//    hasta su capacidad física.
//  - Surtido Externo Planta: cisterna directo al subtanque, la reserva no cambia.
//  - Trasiego Interno: pasa litros de la reserva al subtanque sin añadir
//    combustible al nodo (addedTotal = 0).
//  - Surtido Mixto: reparte entre subtanque y reserva.

export const DISPATCH = {
  PLANTA: 'Surtido Planta',
  EXTERNO: 'Surtido Externo Planta',
  RESERVA: 'Surtido Reserva',
  TRASIEGO: 'Trasiego Interno',
  MIXTO: 'Surtido Planta y Reserva',
};

// Normaliza entradas numéricas: texto vacío, NaN, Infinity y negativos cuentan como 0.
const toLiters = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const fillTank = (current, capacity, added) =>
  capacity > 0 ? Math.min(capacity, current + added) : current + added;

export function computeDispatchLevels({
  destino,
  litros,
  litrosPlanta,
  litrosReserva,
  curSub = 0,
  curRes = 0,
  subCap = 0,
  resCap = 0,
}) {
  const sub0 = toLiters(curSub);
  const res0 = toLiters(curRes);
  let newSub = sub0;
  let newRes = res0;
  let addedTotal = 0;
  let ltsP = 0;
  let ltsR = 0;

  switch (destino) {
    case DISPATCH.RESERVA: {
      const l = toLiters(litros);
      newRes = fillTank(res0, resCap, l);
      addedTotal = l;
      ltsR = l;
      break;
    }
    case DISPATCH.PLANTA: {
      const l = toLiters(litros);
      addedTotal = l;
      ltsP = l;
      newRes = resCap > 0 ? Math.max(0, res0 - l) : 0;
      newSub = fillTank(sub0, subCap, l);
      break;
    }
    case DISPATCH.EXTERNO: {
      const l = toLiters(litros);
      addedTotal = l;
      ltsP = l;
      newRes = res0;
      newSub = fillTank(sub0, subCap, l);
      break;
    }
    case DISPATCH.TRASIEGO: {
      const l = toLiters(litros);
      ltsP = l;
      addedTotal = 0;
      newRes = Math.max(0, res0 - l);
      newSub = fillTank(sub0, subCap, l);
      break;
    }
    case DISPATCH.MIXTO: {
      const lp = toLiters(litrosPlanta);
      const lr = toLiters(litrosReserva);
      ltsP = lp;
      ltsR = lr;
      newSub = fillTank(sub0, subCap, lp);
      newRes = fillTank(res0, resCap, lr);
      addedTotal = lp + lr;
      break;
    }
    default:
      break;
  }

  return { newSub, newRes, newTotal: newSub + newRes, addedTotal, ltsP, ltsR };
}

/**
 * Valida un despacho antes de guardarlo.
 * Devuelve un mensaje de error listo para mostrar, o null si es válido.
 * Regla de operación: no se puede despachar más de la capacidad libre del
 * tanque destino ni más de lo disponible en el tanque origen.
 */
export function validateDispatch({
  destino,
  litros,
  litrosPlanta,
  litrosReserva,
  curSub = 0,
  curRes = 0,
  subCap = 0,
  resCap = 0,
}) {
  const sub0 = toLiters(curSub);
  const res0 = toLiters(curRes);
  const freeSub = subCap > 0 ? Math.max(0, subCap - sub0) : null;
  const freeRes = resCap > 0 ? Math.max(0, resCap - res0) : null;

  const overSub = (n) =>
    freeSub !== null && n > freeSub
      ? `Solo caben ${freeSub} L libres en el tanque de la planta (capacidad ${subCap} L, nivel actual ${sub0} L).`
      : null;
  const overRes = (n) =>
    freeRes !== null && n > freeRes
      ? `Solo caben ${freeRes} L libres en la reserva (capacidad ${resCap} L, nivel actual ${res0} L).`
      : null;

  switch (destino) {
    case DISPATCH.RESERVA: {
      const l = toLiters(litros);
      if (l <= 0) return 'Ingresa los litros suministrados a la reserva.';
      return overRes(l);
    }
    case DISPATCH.PLANTA: {
      const l = toLiters(litros);
      if (l <= 0) return 'Ingresa una cantidad válida de litros suministrados.';
      if (resCap > 0 && l > res0) {
        return `La reserva del nodo solo dispone de ${res0} L; no puedes despachar ${l} L.`;
      }
      return overSub(l);
    }
    case DISPATCH.EXTERNO: {
      const l = toLiters(litros);
      if (l <= 0) return 'Ingresa una cantidad válida de litros suministrados.';
      return overSub(l);
    }
    case DISPATCH.TRASIEGO: {
      const l = toLiters(litros);
      if (l <= 0) return 'Ingresa los litros a trasegar de la reserva a la planta.';
      if (res0 <= 0) return 'No se puede trasegar: la reserva del nodo está en 0 L.';
      if (l > res0) return `No puedes trasegar ${l} L porque la reserva solo dispone de ${res0} L.`;
      return overSub(l);
    }
    case DISPATCH.MIXTO: {
      const lp = toLiters(litrosPlanta);
      const lr = toLiters(litrosReserva);
      if (lp <= 0 && lr <= 0) return 'Ingresa los litros a suministrar a la planta o a la reserva.';
      return overSub(lp) || overRes(lr);
    }
    default:
      return 'Selecciona un destino válido.';
  }
}

export default computeDispatchLevels;
