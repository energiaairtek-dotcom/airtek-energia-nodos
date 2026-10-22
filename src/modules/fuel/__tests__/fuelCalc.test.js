import { describe, it, expect } from 'vitest';
import { computeDispatchLevels, validateDispatch, DISPATCH } from '../fuelCalc';

const base = { curSub: 100, subCap: 300, curRes: 500, resCap: 1000 };

describe('Surtido Reserva', () => {
  it('suma litros a la reserva sin tocar el subtanque', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.RESERVA, litros: 50 });
    expect(r.newRes).toBe(550);
    expect(r.newSub).toBe(100);
    expect(r.addedTotal).toBe(50);
    expect(r.ltsR).toBe(50);
  });

  it('no supera la capacidad de la reserva', () => {
    const r = computeDispatchLevels({ ...base, curRes: 990, destino: DISPATCH.RESERVA, litros: 50 });
    expect(r.newRes).toBe(1000);
    // Se declaran los litros despachados aunque el tanque se llenara antes.
    expect(r.addedTotal).toBe(50);
  });
});

describe('Surtido Planta', () => {
  it('descuenta de la reserva compartida y llena el subtanque', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.PLANTA, litros: 80 });
    expect(r.newSub).toBe(180);
    expect(r.newRes).toBe(420);
    expect(r.ltsP).toBe(80);
  });

  it('en nodos sin reserva externa deja la reserva en 0', () => {
    const r = computeDispatchLevels({
      curSub: 20,
      subCap: 100,
      curRes: 0,
      resCap: 0,
      destino: DISPATCH.PLANTA,
      litros: 40,
    });
    expect(r.newSub).toBe(60);
    expect(r.newRes).toBe(0);
  });

  it('no desborda el subtanque aunque se despachen más litros', () => {
    const r = computeDispatchLevels({ ...base, curSub: 290, destino: DISPATCH.PLANTA, litros: 50 });
    expect(r.newSub).toBe(300);
    // El descuento de reserva es por lo despachado (comportamiento documentado).
    expect(r.newRes).toBe(450);
  });

  it('no deja la reserva en negativo', () => {
    const r = computeDispatchLevels({ ...base, curRes: 30, destino: DISPATCH.PLANTA, litros: 80 });
    expect(r.newRes).toBe(0);
  });
});

describe('Surtido Externo Planta', () => {
  it('llena el subtanque sin modificar la reserva', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.EXTERNO, litros: 150 });
    expect(r.newSub).toBe(250);
    expect(r.newRes).toBe(500);
    expect(r.addedTotal).toBe(150);
  });
});

describe('Trasiego Interno', () => {
  it('mueve litros de reserva a planta sin sumar al total del nodo', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.TRASIEGO, litros: 60 });
    expect(r.newSub).toBe(160);
    expect(r.newRes).toBe(440);
    expect(r.addedTotal).toBe(0);
    expect(r.newTotal).toBe(600);
  });

  it('no permite trasegar más de lo disponible', () => {
    const r = computeDispatchLevels({ ...base, curRes: 40, destino: DISPATCH.TRASIEGO, litros: 60 });
    expect(r.newRes).toBe(0);
  });
});

describe('Surtido Mixto', () => {
  it('reparte entre planta y reserva', () => {
    const r = computeDispatchLevels({
      ...base,
      destino: DISPATCH.MIXTO,
      litrosPlanta: 150,
      litrosReserva: 200,
    });
    expect(r.newSub).toBe(250);
    expect(r.newRes).toBe(700);
    expect(r.addedTotal).toBe(350);
    expect(r.ltsP).toBe(150);
    expect(r.ltsR).toBe(200);
  });

  it('respeta ambos topes', () => {
    const r = computeDispatchLevels({
      ...base,
      curSub: 280,
      curRes: 950,
      destino: DISPATCH.MIXTO,
      litrosPlanta: 100,
      litrosReserva: 100,
    });
    expect(r.newSub).toBe(300);
    expect(r.newRes).toBe(1000);
  });
});

describe('entradas inválidas', () => {
  it('trata vacíos, NaN y negativos como 0', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.PLANTA, litros: 'abc' });
    expect(r.addedTotal).toBe(0);
    expect(r.newSub).toBe(100);
    expect(r.newRes).toBe(500);

    const neg = computeDispatchLevels({ ...base, destino: DISPATCH.RESERVA, litros: -50 });
    expect(neg.addedTotal).toBe(0);
    expect(neg.newRes).toBe(500);
  });

  it('sin destino válido no altera los niveles', () => {
    const r = computeDispatchLevels({ ...base, destino: 'Otro', litros: 100 });
    expect(r.newSub).toBe(100);
    expect(r.newRes).toBe(500);
    expect(r.addedTotal).toBe(0);
  });

  it('acepta litros como texto con coma decimal', () => {
    const r = computeDispatchLevels({ ...base, destino: DISPATCH.RESERVA, litros: '50' });
    expect(r.newRes).toBe(550);
  });
});
describe('validateDispatch', () => {
  const base = { curSub: 100, subCap: 300, curRes: 500, resCap: 1000 };

  it('acepta un surtido dentro de la capacidad libre', () => {
    expect(validateDispatch({ ...base, destino: DISPATCH.PLANTA, litros: 200 })).toBeNull();
    expect(validateDispatch({ ...base, destino: DISPATCH.RESERVA, litros: 500 })).toBeNull();
  });

  it('bloquea si se piden más litros de los que caben en el subtanque', () => {
    const msg = validateDispatch({ ...base, destino: DISPATCH.PLANTA, litros: 250 });
    expect(msg).toContain('Solo caben 200 L libres');
  });

  it('bloquea si se piden más litros de los que caben en la reserva', () => {
    const msg = validateDispatch({ ...base, destino: DISPATCH.RESERVA, litros: 600 });
    expect(msg).toContain('Solo caben 500 L libres');
  });

  it('bloquea si la reserva no tiene suficiente combustible para la planta', () => {
    const msg = validateDispatch({ ...base, curRes: 40, destino: DISPATCH.PLANTA, litros: 80 });
    expect(msg).toContain('solo dispone de 40 L');
  });

  it('bloquea trasiego mayor que el stock o que el espacio libre', () => {
    expect(validateDispatch({ ...base, curRes: 40, destino: DISPATCH.TRASIEGO, litros: 80 })).toContain(
      'solo dispone de 40 L'
    );
    expect(validateDispatch({ ...base, curSub: 290, destino: DISPATCH.TRASIEGO, litros: 40 })).toContain(
      'Solo caben 10 L libres'
    );
  });

  it('valida ambos lados en el surtido mixto', () => {
    expect(
      validateDispatch({ ...base, destino: DISPATCH.MIXTO, litrosPlanta: 250, litrosReserva: 100 })
    ).toContain('Solo caben 200 L libres');
    expect(
      validateDispatch({ ...base, destino: DISPATCH.MIXTO, litrosPlanta: 100, litrosReserva: 900 })
    ).toContain('Solo caben 500 L libres');
    expect(
      validateDispatch({ ...base, destino: DISPATCH.MIXTO, litrosPlanta: 100, litrosReserva: 400 })
    ).toBeNull();
  });

  it('exige una cantidad mayor que cero', () => {
    expect(validateDispatch({ ...base, destino: DISPATCH.PLANTA, litros: 0 })).toContain('Ingresa');
    expect(validateDispatch({ ...base, destino: DISPATCH.TRASIEGO, litros: '' })).toContain('Ingresa');
  });

  it('no limita cuando la capacidad es desconocida', () => {
    expect(
      validateDispatch({ curSub: 0, subCap: 0, curRes: 0, resCap: 0, destino: DISPATCH.EXTERNO, litros: 5000 })
    ).toBeNull();
  });

  it('rechaza un destino desconocido', () => {
    expect(validateDispatch({ ...base, destino: 'Otro', litros: 10 })).toContain('destino válido');
  });
});