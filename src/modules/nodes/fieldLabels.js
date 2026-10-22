// Catálogo de etiquetas y unidades de las mediciones, y utilidades de fecha.
const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const FIELD_LABELS = {
  L1_carga: 'L1', L1_pot: 'L1', L2_carga: 'L2', L2_pot: 'L2',
  V_ac_out: 'Vout', load_kw: 'Load', V_panel: 'Vpaneles', P_panel: 'Ppaneles',
  I_bat: 'Ibateria', V_dc_out: 'V DC OUT',
  DC_load: 'DC Load', AC_load: 'AC Load', I_panel: 'Ipaneles',
  L1: 'L1', L2: 'L2', N: 'N',
  V_banco: 'V Banco', I_banco: 'I Banco',
  libre: 'Notas',
  horometer: 'Horómetro',
  autonomia: 'Autonomía',
  voltajeRed: 'Voltaje Red (ATS)',
  voltajeL1L2: 'Voltaje L1-L2',
  voltajeL2L3: 'Voltaje L2-L3',
  voltajeL1L3: 'Voltaje L1-L3',
  voltajeL1N: 'Voltaje L1-N',
  voltajeL2N: 'Voltaje L2-N',
  voltajeLN: 'Voltaje L-N',
  ampF1: 'Amperaje Fase 1',
  ampF2: 'Amperaje Fase 2',
  ampF3: 'Amperaje Fase 3',
  ampN: 'Amperaje Neutro',
  presionAceite: 'Presión Aceite',
  obsPresionAceite: 'Obs Presión Aceite',
  fluidosStatus: 'Estado Fluidos',
  obsFluidos: 'Obs Fluidos',
  manguerasStatus: 'Estado Mangueras',
  obsMangueras: 'Obs Mangueras',
  correaStatus: 'Estado Correa',
  obsCorrea: 'Obs Correa',
  atsStatus: 'Estado ATS',
  obsATS: 'Obs ATS',
  batVCG: 'Bat V-CG',
  batVAT: 'Bat V-AT',
  batCTS: 'Bat C-TS',
  obsBat: 'Obs Batería',
  cableadoStatus: 'Estado Cableado',
  obsCableado: 'Obs Cableado',
  puntosCalStatus: 'Puntos Calientes',
  obsPuntosCal: 'Obs Puntos Calientes',
  sonoffStatus: 'Estado Sonoff',
  obsSonoff: 'Obs Sonoff',
  encendidoStatus: 'Encendido Remoto',
  obsEncendido: 'Obs Encendido',
  ruidosStatus: 'Ruidos Anormales',
  obsRuidos: 'Obs Ruidos',
  surtidoStatus: 'Surtido Combustible',
  obsSurtido: 'Obs Surtido',
  reservaMin: 'Reserva Combustible',
  reservaAutonomia: 'Autonomía de la Reserva',
  obsReserva: 'Obs Reserva',
  resultado: 'Resultado',
  obsGenerales: 'Observaciones Generales',
  firmaTecnico: 'Firma Técnico'
};
const FIELD_UNITS = {
  L1_carga: '%', L1_pot: 'kW', L2_carga: '%', L2_pot: 'kW',
  V_ac_out: 'Vac', load_kw: 'kW', V_panel: 'V', P_panel: 'kW',
  I_bat: 'Adc', V_dc_out: 'VDC',
  DC_load: 'kW', AC_load: 'kW', I_panel: 'A',
  L1: 'A', L2: 'A', N: 'A',
  V_banco: 'VDC', I_banco: 'A',
  horometer: 'H',
  voltajeRed: 'V',
  voltajeL1L2: 'V',
  voltajeL2L3: 'V',
  voltajeL1L3: 'V',
  voltajeL1N: 'V',
  voltajeL2N: 'V',
  voltajeLN: 'V',
  ampF1: 'A',
  ampF2: 'A',
  ampF3: 'A',
  ampN: 'A',
  presionAceite: 'psi/bar',
  batVCG: 'V',
  batVAT: 'V'
};

const getFieldLabel = (k) => {
  const pvMatch = k.match(/^(V|I|P)_panel(?:_(\d+))?$/);
  if (pvMatch) {
    const type = pvMatch[1];
    const modNum = pvMatch[2];
    const typeLbl = type === 'V' ? 'V Paneles' : (type === 'I' ? 'I Paneles' : 'P Paneles');
    return modNum ? `PV${modNum} ${typeLbl}` : typeLbl;
  }
  return FIELD_LABELS[k] || k.replace(/_/g, ' ');
};

const getFieldUnit = (k) => {
  const pvMatch = k.match(/^(V|I|P)_panel(?:_\d+)?$/);
  if (pvMatch) {
    const type = pvMatch[1];
    return type === 'V' ? 'V' : (type === 'I' ? 'A' : 'kW');
  }
  return FIELD_UNITS[k] || '';
};

export { DIAS_ES, MESES_ES, FIELD_LABELS, FIELD_UNITS, getFieldLabel, getFieldUnit };
