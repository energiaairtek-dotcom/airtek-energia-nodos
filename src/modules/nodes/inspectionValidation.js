// Validación del chequeo de grupo electrógeno (inspección de planta).
// Evita guardar inspecciones vacías y exigir explicación cuando algo falla.

import { parseHours } from '@/utils/formatters';

// Campos que cuentan como "medición" (cualquiera con valor basta).
export const MEASUREMENT_FIELDS = [
  'voltajeRed',
  'voltajeL1L2',
  'voltajeL2L3',
  'voltajeL1L3',
  'voltajeL1N',
  'voltajeL2N',
  'voltajeLN',
  'ampF1',
  'ampF2',
  'ampF3',
  'ampN',
  'presionAceite',
  'batVCG',
  'batVAT',
  'batCTS',
];

// Estados que, al marcarse "Fallo", exigen una observación que lo describa.
export const STATUS_FIELDS = [
  { status: 'fluidosStatus', obs: 'obsFluidos', label: 'Fluidos' },
  { status: 'manguerasStatus', obs: 'obsMangueras', label: 'Mangueras' },
  { status: 'correaStatus', obs: 'obsCorrea', label: 'Correa' },
  { status: 'atsStatus', obs: 'obsATS', label: 'ATS' },
  { status: 'cableadoStatus', obs: 'obsCableado', label: 'Cableado' },
  { status: 'puntosCalStatus', obs: 'obsPuntosCal', label: 'Puntos calientes' },
  { status: 'sonoffStatus', obs: 'obsSonoff', label: 'Sonoff' },
  { status: 'encendidoStatus', obs: 'obsEncendido', label: 'Encendido remoto' },
  { status: 'ruidosStatus', obs: 'obsRuidos', label: 'Ruidos anormales' },
  { status: 'surtidoStatus', obs: 'obsSurtido', label: 'Surtido a la planta' },
];

const isBlank = (value) => value === null || value === undefined || String(value).trim() === '';

const isFallo = (value) => String(value || '').trim().toLowerCase() === 'fallo';

/**
 * Devuelve la lista de errores de la inspección (vacía si es válida).
 * Los mensajes están listos para mostrarse al técnico.
 */
export function validateInspection(form = {}) {
  const errors = [];

  const horas = parseHours(form.horometer);
  if (isBlank(form.horometer)) {
    errors.push('Registra las horas de servicio (horómetro) de la planta.');
  } else if (!Number.isFinite(horas) || horas <= 0) {
    errors.push('Las horas de servicio del horómetro no son válidas.');
  }

  if (isBlank(form.firmaTecnico)) {
    errors.push('Falta el nombre del técnico que realiza la inspección.');
  }

  const hasMeasurement = MEASUREMENT_FIELDS.some((field) => !isBlank(form[field]));
  if (!hasMeasurement) {
    errors.push('Registra al menos una medición: voltaje, amperaje, presión de aceite o batería.');
  }

  STATUS_FIELDS.forEach(({ status, obs, label }) => {
    if (isFallo(form[status]) && isBlank(form[obs])) {
      errors.push(`Marcaste "Fallo" en ${label}: describe la novedad en sus observaciones.`);
    }
  });

  if (isBlank(form.resultado)) {
    errors.push('Selecciona el resultado final de la inspección.');
  }

  return errors;
}

export const isValidInspection = (form) => validateInspection(form).length === 0;

export default validateInspection;
