import { describe, it, expect } from 'vitest';
import { generateReportText } from '../reportText';

const equipment = [
  { tag: 'INV01-LFP00', type: 'INV' },
  { tag: 'BAT01-LFP', type: 'BAT' },
];

describe('generateReportText', () => {
  it('genera el encabezado con fecha y nodo', () => {
    const text = generateReportText({
      nodeName: 'Nodo Bella Vista',
      date: new Date(2026, 9, 22),
      technicianName: 'Diego Campos',
      measurements: { 'INV01-LFP00': { V_banco: '52.1' } },
      observations: '',
      equipment,
    });

    expect(text).toContain('Jueves 22/10/2026');
    expect(text).toContain('Nodo Bella Vista');
    expect(text).toContain('INV01-LFP00');
  });

  it('etiqueta y une la unidad de cada medición', () => {
    const text = generateReportText({
      nodeName: 'Nodo Ojeda',
      date: new Date(2026, 9, 22),
      technicianName: 'Técnico',
      measurements: { 'INV01-LFP00': { V_banco: '52.1', L1: '10' } },
      equipment,
    });

    expect(text).toContain('V Banco: 52.1 VDC');
    expect(text).toContain('L1: 10 A');
  });

  it('incluye observaciones con viñetas y el personal de apoyo', () => {
    const text = generateReportText({
      nodeName: 'Nodo Ojeda',
      date: new Date(2026, 9, 22),
      technicianName: 'Diego Campos',
      measurements: { 'INV01-LFP00': { V_banco: '52.1' } },
      observations: 'Sin novedades',
      equipment,
    });

    expect(text).toContain('Observaciones:');
    expect(text).toContain('- Sin novedades');
    expect(text).toContain('- Diego Campos');
  });

  it('no falla si no hay equipos medidos', () => {
    const text = generateReportText({
      nodeName: 'Nodo Vacío',
      date: new Date(2026, 9, 22),
      technicianName: 'Técnico',
      measurements: {},
      equipment: [],
    });

    expect(text).toContain('Nodo Vacío');
    expect(text).not.toContain('undefined');
  });
});
