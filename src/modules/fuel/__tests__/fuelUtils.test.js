import { describe, it, expect, vi, beforeEach } from 'vitest';

// fuelUtils importa el servicio de Firebase; en pruebas no hace falta inicializarlo.
vi.mock('@/services/firebase', () => ({
  TS: () => null,
}));

import { revertFuelTanks, generateFuelReportText, persistNodeFuelUpdate } from '../fuelUtils';

const callao = [
  {
    id: 't1',
    lugar: 'Datacenter El Callao',
    tag: 'CALL-PLT-00',
    tanque_lts: 305,
    subtanque_actual: 305,
    reserva_lts: 1259,
    cap_reserva_lts: 2500,
    consumo_lh: 12.5,
  },
  {
    id: 't2',
    lugar: 'Datacenter El Callao',
    tag: 'CALL-PLT-01',
    tanque_lts: 300,
    subtanque_actual: 300,
    reserva_lts: 1259,
    cap_reserva_lts: 2500,
    consumo_lh: 20,
  },
];

describe('revertFuelTanks', () => {
  it('revierte un surtido a planta: resta del subtanque y devuelve a la reserva compartida', () => {
    const out = revertFuelTanks(callao, {
      lugar: 'Datacenter El Callao',
      tag: 'CALL-PLT-00',
      destino: 'Surtido Planta',
      litros: 50,
      litrosPlanta: 50,
      litrosReserva: 0,
    });

    expect(out[0].subtanque_actual).toBe(255);
    expect(out[0].reserva_lts).toBe(1309);
    // La planta hermana comparte reserva pero no subtanque
    expect(out[1].subtanque_actual).toBe(300);
    expect(out[1].reserva_lts).toBe(1309);
  });

  it('revierte un surtido a reserva sin tocar los subtanques', () => {
    const out = revertFuelTanks(callao, {
      lugar: 'Datacenter El Callao',
      tag: 'CALL-PLT-00',
      destino: 'Surtido Reserva',
      litros: 100,
      litrosPlanta: 0,
      litrosReserva: 100,
    });

    expect(out[0].reserva_lts).toBe(1159);
    expect(out[0].subtanque_actual).toBe(305);
    expect(out[1].reserva_lts).toBe(1159);
  });

  it('no supera la capacidad de la reserva al revertir', () => {
    const tanks = [
      {
        id: 't3',
        lugar: 'Nodo Ojeda',
        tag: 'OJEDA-PLT-00',
        tanque_lts: 100,
        subtanque_actual: 100,
        reserva_lts: 100,
        cap_reserva_lts: 100,
        consumo_lh: 10,
      },
    ];
    const out = revertFuelTanks(tanks, {
      lugar: 'Nodo Ojeda',
      tag: 'OJEDA-PLT-00',
      destino: 'Surtido Planta',
      litros: 50,
      litrosPlanta: 50,
      litrosReserva: 0,
    });
    expect(out[0].reserva_lts).toBe(100);
  });

  it('usa los niveles previos cuando el registro los trae', () => {
    const out = revertFuelTanks(callao, {
      lugar: 'Datacenter El Callao',
      tag: 'CALL-PLT-00',
      destino: 'Surtido Planta',
      litros: 50,
      prevSub: 300,
      resSub: 305,
      prevRes: 1200,
      resRes: 1259,
    });

    expect(out[0].subtanque_actual).toBe(300);
    expect(out[0].reserva_lts).toBe(1200);
  });
});

describe('generateFuelReportText', () => {
  it('genera el reporte de un surtido a planta', () => {
    const text = generateFuelReportText({
      nodeName: 'Nodo Las Tunas',
      date: '27/08/2026',
      record: {
        destino: 'Surtido Planta',
        litros: 100,
        litros_planta: 100,
        litros_reserva: 0,
        reserva_lts: 500,
        horometro: '370:18',
      },
    });

    expect(text.split('\n')).toEqual([
      'Las Tunas 27/08/2026',
      'Surtido a la planta: 100 litros',
      'Reserva: 500 litros',
      'Horas: 370:18',
    ]);
  });

  it('genera el reporte de un surtido mixto', () => {
    const text = generateFuelReportText({
      nodeName: 'El Callao',
      date: '20/08/2026',
      record: {
        destino: 'Surtido Planta y Reserva',
        litros: 300,
        litros_planta: 200,
        litros_reserva: 100,
        reserva_lts: 1485,
      },
    });

    expect(text).toContain('Surtido a la planta: 200 litros');
    expect(text).toContain('Surtido a la reserva: 100 litros');
    expect(text).toContain('Reserva: 1485 litros');
  });

  it('describe un trasiego interno sin sumar combustible', () => {
    const text = generateFuelReportText({
      nodeName: 'Nodo Marfi',
      date: '21/08/2026',
      record: { destino: 'Trasiego Interno', litros: 50, litros_planta: 50, reserva_lts: 450 },
    });

    expect(text).toContain('Trasiego interno a planta: 50 litros');
    expect(text).not.toContain('Surtido a la reserva');
  });

  it('incluye observaciones cuando existen', () => {
    const text = generateFuelReportText({
      nodeName: 'Nodo Ojeda',
      date: '22/08/2026',
      record: { destino: 'Surtido Reserva', litros: 100, reserva_lts: 300, obs: 'Cisterna 550 L' },
    });

    expect(text).toContain('Obs: Cisterna 550 L');
  });
});

describe('persistNodeFuelUpdate', () => {
  beforeEach(() => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    };
  });

  it('conserva la capacidad calibrada al guardar un surtido', async () => {
    const tanks = [
      {
        id: 't1',
        lugar: 'Nodo Ojeda',
        tag: 'OJEDA-PLT-00',
        tanque_lts: 100,
        subtanque_actual: 40,
        reserva_lts: 700,
        cap_reserva_lts: 1500,
        consumo_lh: 10,
      },
    ];
    localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tanks));

    await persistNodeFuelUpdate({
      db: null,
      nodeId: 'n1',
      nodeName: 'Nodo Ojeda',
      plantTag: 'OJEDA-PLT-00',
      resultingSub: 90,
      resultingRes: 650,
      resultingTotal: 740,
      addedTotalDespacho: 50,
    });

    const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13'));
    expect(saved[0].cap_reserva_lts).toBe(1500);
    expect(saved[0].subtanque_actual).toBe(90);
    expect(saved[0].reserva_lts).toBe(650);
  });

  it('no supera la capacidad física del subtanque', async () => {
    const tanks = [
      {
        id: 't1',
        lugar: 'Nodo Ojeda',
        tag: 'OJEDA-PLT-00',
        tanque_lts: 100,
        subtanque_actual: 90,
        reserva_lts: 700,
        cap_reserva_lts: 1000,
        consumo_lh: 10,
      },
    ];
    localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tanks));

    await persistNodeFuelUpdate({
      db: null,
      nodeId: 'n1',
      nodeName: 'Nodo Ojeda',
      plantTag: 'OJEDA-PLT-00',
      resultingSub: 150,
      resultingRes: 600,
      resultingTotal: 750,
      addedTotalDespacho: 50,
    });

    const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13'));
    expect(saved[0].subtanque_actual).toBe(100);
  });
});
describe('persistNodeFuelUpdate (payload de Firestore)', () => {
  const makeDb = () => {
    const writes = [];
    const db = {
      writes,
      collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({}) }) }) }),
      batch: () => ({ set: (ref, data) => writes.push(data), commit: async () => {} }),
    };
    return db;
  };

  beforeEach(() => {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    };
  });

  const tank = (lugar, cap) => ({
    id: lugar,
    lugar,
    tag: 'T-1',
    tanque_lts: 100,
    subtanque_actual: 50,
    reserva_lts: 400,
    cap_reserva_lts: cap,
    consumo_lh: 10,
  });

  it('escribe la capacidad vigente del tanque', async () => {
    localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify([tank('Nodo Ojeda', 1500)]));
    const db = makeDb();
    await persistNodeFuelUpdate({
      db,
      nodeId: 'n1',
      nodeName: 'Nodo Ojeda',
      plantTag: 'T-1',
      resultingSub: 60,
      resultingRes: 420,
      resultingTotal: 480,
      addedTotalDespacho: 20,
    });
    expect(db.writes[0].cap_reserva_lts).toBe(1500);
  });

  it('no borra la capacidad si el nodo no está en la base de tanques', async () => {
    const db = makeDb();
    await persistNodeFuelUpdate({
      db,
      nodeId: 'n2',
      nodeName: 'Nodo Desconocido',
      plantTag: 'T-9',
      resultingSub: 10,
      resultingRes: 20,
      resultingTotal: 30,
      addedTotalDespacho: 5,
    });
    expect(Object.prototype.hasOwnProperty.call(db.writes[0], 'cap_reserva_lts')).toBe(false);
  });

  it('usa la capacidad recibida por parámetro cuando no hay tanque', async () => {
    const db = makeDb();
    await persistNodeFuelUpdate({
      db,
      nodeId: 'n3',
      nodeName: 'Nodo Nuevo',
      plantTag: 'T-3',
      resultingSub: 10,
      resultingRes: 20,
      resultingTotal: 30,
      addedTotalDespacho: 5,
      resultingCapRes: 800,
    });
    expect(db.writes[0].cap_reserva_lts).toBe(800);
  });
});