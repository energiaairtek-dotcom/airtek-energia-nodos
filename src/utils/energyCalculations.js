import { EQ_ORDER, BAT_VN, BAT_DEFAULTS, AWG_AMPACITY } from '../config/constants';

// Extrae identificador de banco del tag
// INV06-LFP00→LFP00 | BAT00-LFP→LFP00 | ETP02-AC-PV-NMC02→NMC02 | MBO-OJEDA-INV00-AC-AA-PV-NMC01→NMC01 | BAT01-NMC→NMC01
export const getBankId = (tag) => {
  const t = (tag || '').toUpperCase();
  const m1 = t.match(/BAT[_-]?(\d+)[_-]?(LFP|NMC|GEL|AGM|VRLA)/);
  if (m1) return m1[2] + m1[1];
  const m2 = t.match(/(LFP|NMC|GEL|AGM|VRLA)[_-]?(\d+)/);
  if (m2) return m2[1] + m2[2];
  return null;
};

// Determina el tipo canónico de equipo buscando en el inventario o analizando el tag
export const getEqTypeFromTag = (tag, equipment = []) => {
  if (!tag) return 'OTR';
  const found = (equipment || []).find((e) => e.tag === tag);
  if (found && found.type) return found.type;
  const t = tag.toUpperCase();
  if (t.includes('INV')) return 'INV';
  if (t.includes('ETP')) return 'ETP';
  if (t.includes('BAT')) return 'BAT';
  if (t.includes('ATS')) return 'ATS';
  if (t.includes('BKR') || t.includes('BRK') || t.includes('BREAKER') || t.includes('BKP')) return 'BKR';
  if (t.includes('GEN') || t.includes('PLT')) return 'GEN';
  return 'OTR';
};

// Agrupa equipos: no-BAT por banco → BAT al final del grupo → ATS/BKR/OTR al final
export const groupByBank = (eqs) => {
  const nonBat = eqs.filter((e) => e.type !== 'BAT' && e.type !== 'ATS' && e.type !== 'BKR' && e.type !== 'OTR');
  const bats = eqs.filter((e) => e.type === 'BAT');
  const atsotr = eqs.filter((e) => e.type === 'ATS' || e.type === 'BKR' || e.type === 'OTR');
  const groups = [];
  const seen = new Set();
  nonBat.forEach((eq) => {
    const bank = getBankId(eq.tag);
    if (!bank || seen.has(bank)) return;
    seen.add(bank);
    groups.push({
      bank,
      eqs: nonBat.filter((e) => getBankId(e.tag) === bank),
      bat: bats.find((b) => getBankId(b.tag) === bank) || null,
    });
  });
  const ungrouped = nonBat.filter((e) => !getBankId(e.tag));
  if (ungrouped.length) groups.push({ bank: null, eqs: ungrouped, bat: null });
  const orphanBats = bats.filter((b) => !nonBat.some((e) => getBankId(e.tag) === getBankId(b.tag)));
  if (orphanBats.length) groups.push({ bank: '_orphan', eqs: [], bat: null, orphanBats });
  if (atsotr.length) groups.push({ bank: '_ats', eqs: atsotr, bat: null });
  return groups;
};

// Calcula carga kW separando AC y DC de un equipo dada sus mediciones
export const calcLoad = (eqType, vals) => {
  if (!vals) return { ac: 0, dc: 0 };
  let ac = 0;
  let dc = 0;
  if (eqType === 'INV' || vals.load_kw !== undefined || vals.L1_pot !== undefined || vals.L2_pot !== undefined) {
    if (vals.load_kw) ac = parseFloat(vals.load_kw) || 0;
    else {
      const l1 = parseFloat(vals.L1_pot) || 0;
      const l2 = parseFloat(vals.L2_pot) || 0;
      ac = l1 + l2;
    }
  }
  if (eqType === 'ETP' || vals.DC_load !== undefined || vals.AC_load !== undefined) {
    ac += parseFloat(vals.AC_load) || 0;
    dc += parseFloat(vals.DC_load) || 0;
  }
  return { ac, dc };
};

// Fórmula idéntica a Excel: ((Cap * Vn) / ((CargaAC/eInv) + (CargaDC/eReg))) * DoD * SoH * ebanco * corrCorr * corrTemp
export const calcAutonomy = (batEq, loadAcKW, loadDcKW) => {
  if (!batEq) return null;
  const loadAcW = (loadAcKW || 0) * 1000;
  const loadDcW = (loadDcKW || 0) * 1000;
  if (loadAcW <= 0 && loadDcW <= 0) return null;

  const cap = parseFloat(batEq.batCapacity) || 0;
  const type = batEq.batteryType || 'LFP';
  if (!cap) return null;
  const Vn = BAT_VN[type] || 48;
  const def = BAT_DEFAULTS[type] || BAT_DEFAULTS.LFP;

  let DoD = def.DoD;
  let SoH = def.SoH;
  if (batEq.batDoD) {
    const v = parseFloat(batEq.batDoD);
    DoD = v > 1 ? v / 100 : v;
  }
  if (batEq.batSoH) {
    const v = parseFloat(batEq.batSoH);
    SoH = v > 1 ? v / 100 : v;
  }

  const eb = parseFloat(batEq.batEbanco) || def.ebanco;
  const eT = parseFloat(batEq.batETemp) || def.eTemp;
  const eInv = def.eIny;
  const eReg = def.ereg;

  const adjLoad = loadAcW / eInv + loadDcW / eReg;
  if (adjLoad <= 0) return null;

  const tHours = ((cap * Vn) / adjLoad) * DoD * SoH * eb * 1 * eT;
  return tHours;
};

export const fmtHours = (h) => {
  if (!h || h <= 0) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm.toString().padStart(2, '0')}min`;
};

export const sortEquipment = (eqs) =>
  [...eqs].sort((a, b) => {
    const oa = EQ_ORDER[a.type] ?? 5;
    const ob = EQ_ORDER[b.type] ?? 5;
    if (oa !== ob) return oa - ob;
    return (a.tag || '').localeCompare(b.tag || '', 'es', { numeric: true });
  });

// Chequea si algún ATS supera la ampacidad de su cable
export const checkAtsAlarms = (measurements, equipment) => {
  const alarms = [];
  Object.entries(measurements || {}).forEach(([tag, vals]) => {
    if (getEqTypeFromTag(tag, equipment) !== 'ATS') return;
    const eq = (equipment || []).find((e) => e.tag === tag) || {};
    const calibre = eq.conductorGauge;
    if (!calibre) return;
    const maxA = AWG_AMPACITY[calibre];
    if (!maxA) return;
    ['L1', 'L2', 'L3', 'N'].forEach((line) => {
      const a = parseFloat(vals[line]);
      if (!isNaN(a) && a > maxA) {
        alarms.push({ tag, line, measured: a, maxA, calibre });
      }
    });
  });
  return alarms;
};
