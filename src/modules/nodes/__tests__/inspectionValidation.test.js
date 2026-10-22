import { describe, it, expect } from 'vitest';
import { validateInspection, isValidInspection } from '../inspectionValidation';

const validForm = {
  horometer: '1058:19:00',
  firmaTecnico: 'Diego Campos',
  voltajeRed: '220',
  resultado: 'Aprobado – Opera dentro de parámetros.',
  fluidosStatus: 'OK',
};

describe('validateInspection', () => {
  it('acepta una inspección con datos mínimos', () => {
    expect(validateInspection(validForm)).toEqual([]);
    expect(isValidInspection(validForm)).toBe(true);
  });

  it('rechaza una inspección vacía', () => {
    const errors = validateInspection({});
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.join(' ')).toContain('horómetro');
    expect(errors.join(' ')).toContain('técnico');
    expect(errors.join(' ')).toContain('al menos una medición');
  });

  it('exige horómetro y que sea válido', () => {
    expect(validateInspection({ ...validForm, horometer: '' })[0]).toContain('horómetro');
    expect(validateInspection({ ...validForm, horometer: 'abc' })[0]).toContain('no son válidas');
    expect(validateInspection({ ...validForm, horometer: '0' })[0]).toContain('no son válidas');
  });

  it('exige firma del técnico sin contar espacios', () => {
    expect(validateInspection({ ...validForm, firmaTecnico: '   ' }).join(' ')).toContain('técnico');
  });

  it('exige al menos una medición real', () => {
    const f = { ...validForm, voltajeRed: '' };
    expect(validateInspection(f).join(' ')).toContain('al menos una medición');
    expect(validateInspection({ ...f, batVCG: '12.6' })).toEqual([]);
    expect(validateInspection({ ...f, presionAceite: '40' })).toEqual([]);
  });

  it('obliga a describir los fallos', () => {
    const f = { ...validForm, atsStatus: 'Fallo' };
    expect(validateInspection(f).join(' ')).toContain('ATS');
    expect(validateInspection({ ...f, obsATS: 'No conmuta' })).toEqual([]);
  });

  it('acepta "Fallo" con observación y otros estados sin observación', () => {
    expect(isValidInspection({ ...validForm, ruidosStatus: 'Fallo', obsRuidos: 'Vibración' })).toBe(true);
    expect(isValidInspection({ ...validForm, ruidosStatus: 'SI' })).toBe(true);
  });

  it('exige resultado final', () => {
    const f = { ...validForm, resultado: '' };
    expect(validateInspection(f).join(' ')).toContain('resultado final');
  });

  it('tolera espacios y mayúsculas en el estado', () => {
    const f = { ...validForm, atsStatus: ' fallo ', obsATS: '' };
    expect(validateInspection(f).join(' ')).toContain('ATS');
  });
});
