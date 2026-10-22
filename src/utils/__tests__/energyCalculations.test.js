import { describe, it, expect } from 'vitest';
import {
  getBankId,
  getEqTypeFromTag,
  calcAutonomy,
  fmtHours,
  sortEquipment,
  checkAtsAlarms,
} from '../energyCalculations';

describe('getBankId', () => {
  it('extrae el banco de los tags reales del inventario', () => {
    expect(getBankId('INV06-LFP00')).toBe('LFP00');
    expect(getBankId('BAT00-LFP')).toBe('LFP00');
    expect(getBankId('ETP02-AC-PV-NMC02')).toBe('NMC02');
    expect(getBankId('MBO-OJEDA-INV00-AC-AA-PV-NMC01')).toBe('NMC01');
    expect(getBankId('BAT01-NMC')).toBe('NMC01');
  });

  it('devuelve null cuando no hay banco', () => {
    expect(getBankId('ATS-PRINCIPAL')).toBeNull();
    expect(getBankId('')).toBeNull();
    expect(getBankId(null)).toBeNull();
  });
});

describe('getEqTypeFromTag', () => {
  it('prioriza el tipo del inventario', () => {
    const equipment = [{ tag: 'X-01', type: 'ATS' }];
    expect(getEqTypeFromTag('X-01', equipment)).toBe('ATS');
  });

  it('deduce por el tag cuando no está en el inventario', () => {
    expect(getEqTypeFromTag('GEN-PLT-00')).toBe('GEN');
    expect(getEqTypeFromTag('INV-01')).toBe('INV');
    expect(getEqTypeFromTag('ETP-02')).toBe('ETP');
    expect(getEqTypeFromTag('BKR-PRINCIPAL')).toBe('BKR');
    expect(getEqTypeFromTag('')).toBe('OTR');
  });
});

describe('calcAutonomy', () => {
  const batLfp = { batCapacity: 100, batteryType: 'LFP' };

  it('aplica DoD, SoH, eficiencias y el inversor', () => {
    // (100 Ah * 48 V) / (1000 W / 0.85) * 0.95 * 1.0 * 0.98 = 3.798 h
    expect(calcAutonomy(batLfp, 1, 0)).toBeCloseTo(3.798, 3);
  });

  it('aplica la eficiencia del regulador a la carga DC', () => {
    expect(calcAutonomy(batLfp, 0, 1)).toBeCloseTo(3.798, 3);
  });

  it('respeta DoD y SoH guardados en el equipo', () => {
    const bat = { batCapacity: 200, batteryType: 'LFP', batDoD: 0.5, batSoH: 0.8 };
    // (200*48)/(1000/0.85) * 0.5 * 0.8 * 0.98 = 3.199 h
    expect(calcAutonomy(bat, 1, 0)).toBeCloseTo(3.199, 3);
  });

  it('devuelve null sin carga, sin capacidad o sin equipo', () => {
    expect(calcAutonomy(batLfp, 0, 0)).toBeNull();
    expect(calcAutonomy({ batCapacity: 0, batteryType: 'LFP' }, 1, 0)).toBeNull();
    expect(calcAutonomy(null, 1, 0)).toBeNull();
  });
});

describe('fmtHours', () => {
  it('formatea horas y minutos', () => {
    expect(fmtHours(3.8)).toBe('3h 48min');
    expect(fmtHours(0)).toBe('—');
  });
});

describe('sortEquipment', () => {
  it('ordena por tipo y luego por tag numérico', () => {
    const input = [
      { type: 'GEN', tag: 'GEN-10' },
      { type: 'INV', tag: 'INV-2' },
      { type: 'INV', tag: 'INV-10' },
      { type: 'BAT', tag: 'BAT-1' },
    ];
    expect(sortEquipment(input).map((e) => e.tag)).toEqual(['INV-2', 'INV-10', 'BAT-1', 'GEN-10']);
  });
});

describe('checkAtsAlarms', () => {
  it('alerta cuando el amperaje supera la ampacidad del calibre', () => {
    const equipment = [{ tag: 'ATS-01', type: 'ATS', conductorGauge: '8 AWG' }];
    const alarms = checkAtsAlarms({ 'ATS-01': { L1: '60', L2: '10' } }, equipment);
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ tag: 'ATS-01', line: 'L1', measured: 60, maxA: 50 });
  });

  it('no alerta sin cable o dentro de rango', () => {
    expect(checkAtsAlarms({ 'ATS-01': { L1: '10' } }, [{ tag: 'ATS-01', type: 'ATS' }])).toEqual([]);
    expect(
      checkAtsAlarms({ 'ATS-01': { L1: '10' } }, [{ tag: 'ATS-01', type: 'ATS', conductorGauge: '8 AWG' }])
    ).toEqual([]);
  });
});
