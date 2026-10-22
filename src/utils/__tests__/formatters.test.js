import { describe, it, expect } from 'vitest';
import {
  parseHours,
  parseHorometerToHours,
  formatCleanHoro,
  formatHHMMSS,
  normalizeNodeName,
  sanitize,
  fmtDate,
  slugify,
} from '../formatters';

describe('parseHours', () => {
  it('convierte HH:MM:SS a horas decimales', () => {
    expect(parseHours('1058:19:00')).toBeCloseTo(1058.3167, 3);
    expect(parseHours('370:18')).toBeCloseTo(370.3, 3);
  });

  it('convierte formato 2h 30m', () => {
    expect(parseHours('2h 30m')).toBe(2.5);
    expect(parseHours('2h30m')).toBe(2.5);
  });

  it('acepta números y texto plano', () => {
    expect(parseHours('300')).toBe(300);
    expect(parseHours(12.5)).toBe(12.5);
  });

  it('devuelve 0 para vacíos o basura', () => {
    expect(parseHours('')).toBe(0);
    expect(parseHours(null)).toBe(0);
    expect(parseHours(undefined)).toBe(0);
    expect(parseHours('abc')).toBe(0);
  });
});

describe('parseHorometerToHours', () => {
  it('devuelve null para valores ausentes o guiones', () => {
    expect(parseHorometerToHours('')).toBeNull();
    expect(parseHorometerToHours('—')).toBeNull();
    expect(parseHorometerToHours(null)).toBeNull();
  });

  it('parsea los formatos usados en fichas', () => {
    expect(parseHorometerToHours('370:18')).toBeCloseTo(370.3, 3);
    expect(parseHorometerToHours('2h 15m')).toBe(2.25);
    expect(parseHorometerToHours('300')).toBe(300);
  });
});

describe('formatCleanHoro', () => {
  it('conserva HH:MM', () => {
    expect(formatCleanHoro('674:12')).toBe('674:12');
    expect(formatCleanHoro('674:05')).toBe('674:05');
  });

  it('normaliza horas y minutos sueltos', () => {
    expect(formatCleanHoro('674h30m')).toBe('674:30');
    expect(formatCleanHoro('674.5')).toBe('674:30');
  });

  it('devuelve guion para valores vacíos', () => {
    expect(formatCleanHoro('')).toBe('—');
    expect(formatCleanHoro(null)).toBe('—');
  });
});

describe('formatHHMMSS', () => {
  it('formatea horas decimales', () => {
    expect(formatHHMMSS(1.5)).toBe('01:30:00');
    expect(formatHHMMSS(0)).toBe('00:00:00');
  });

  it('tolera valores inválidos', () => {
    expect(formatHHMMSS(NaN)).toBe('00:00:00');
    expect(formatHHMMSS(null)).toBe('00:00:00');
  });
});

describe('normalizeNodeName', () => {
  it('quita el prefijo de sede y normaliza a minúsculas', () => {
    expect(normalizeNodeName('Nodo Las Tunas')).toBe('las tunas');
    expect(normalizeNodeName('DATACENTER El Callao')).toBe('el callao');
    expect(normalizeNodeName('  Nodo   Bella Vista ')).toBe('bella vista');
  });

  it('no altera nombres sin prefijo', () => {
    expect(normalizeNodeName('Marfi')).toBe('marfi');
    expect(normalizeNodeName(null)).toBe('');
  });
});

describe('sanitize y slugify', () => {
  it('escapa HTML', () => {
    expect(sanitize('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;&#x2F;b&gt;');
  });

  it('genera slugs sin acentos', () => {
    expect(slugify('Nodo Cañada de Urdaneta')).toBe('nodo-canada-de-urdaneta');
  });
});

describe('fmtDate', () => {
  it('devuelve guion para fechas inválidas', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('no-es-fecha')).toBe('—');
  });
});
