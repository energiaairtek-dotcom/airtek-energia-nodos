import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useTransition, useContext } from 'react';
import { loadXLSX, loadJsPDF, loadQRCode } from '@/utils/exportLibs';
import { computeDispatchLevels, validateDispatch } from '@/modules/fuel/fuelCalc';
import { validateInspection } from '@/modules/nodes/inspectionValidation';
import firebase, { db, auth, TS, FieldValue } from '@/services/firebase';
import { 
  NODE_TYPES, EQ_TYPES, BAT_TYPES, BAT_CELL_TYPES, 
  AWG_AMPACITY, AWG_OPTIONS, BAT_VN, REC_TYPES 
} from '@/config/constants';
import { DEFAULT_AUTHORIZED_STAFF, useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { 
  IconSearch, IconExcel, IconCheckCircle, IconAlertTriangle, 
  IconMapPin, IconPdf, IconCopy, IconChecklist 
} from '@/components/icons';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { 
  fmtDateTime, fmtDate, slugify, formatHHMMSS, parseHours, 
  sanitize, normalizeNodeName, formatCleanHoro, parseHorometerToHours
} from '@/utils/formatters';
import { 
  getBankId, getEqTypeFromTag, groupByBank, calcLoad, 
  calcAutonomy, fmtHours, sortEquipment, checkAtsAlarms 
} from '@/utils/energyCalculations';
import { sendNotificationAlert } from '@/services/email';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, persistNodeFuelUpdate, revertFuelTanks, generateFuelReportText } from '@/modules/fuel/fuelUtils';
import { AdjustFuelLevelModal } from '@/modules/fuel/CombustibleWrapper';
import { QRModal } from '@/modules/nodes/components/QrModal';
import { LoadChart } from '@/modules/nodes/components/LoadChart';
import { NodeEvents } from '@/modules/nodes/components/NodeEvents';
import { PersonnelMultiSelect } from '@/modules/nodes/components/PersonnelMultiSelect';
import { NodeAlerts } from '@/modules/nodes/components/NodeAlerts';
import { EditEqModal } from '@/modules/nodes/components/EditEqModal';
import { NodeDocs } from '@/modules/nodes/components/NodeDocs';
import { ALERT_PRIORITIES } from '@/modules/nodes/components/alertPriorities';


    // ═══════════════════════════════════════════════════
    // CAMPO DE MEDICIÓN
    // ═══════════════════════════════════════════════════
    function MF({ label, unit, vals, k, onChange }) {
      return (
        <div>
          <label style={{ display: 'block', fontSize: '.68rem', color: '#475569', marginBottom: 3, fontFamily: "'Outfit', 'Montserrat', sans-serif", textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {label} <span style={{ color: '#0166ff' }}>{unit}</span>
          </label>
          <input className="mi" type="number" step="any" value={vals[k] ?? ''} onChange={e => onChange(k, e.target.value)} placeholder="—" />
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // MEDICIONES DINÁMICAS POR TIPO DE EQUIPO
    // ═══════════════════════════════════════════════════
    function EqMeasurements({ eq, vals, onChange }) {
      if (eq.type === 'INV') {
        const is220 = eq.voltage === '220V';
        const hasPV = eq.hasSolar;
        const pvCount = Math.max(1, parseInt(eq.pvCount, 10) || 1);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MF label="Carga L1" unit="%" vals={vals} k="L1_carga" onChange={onChange} />
            <MF label="Potencia L1" unit="kW" vals={vals} k="L1_pot" onChange={onChange} />
            {is220 && <><MF label="Carga L2" unit="%" vals={vals} k="L2_carga" onChange={onChange} /><MF label="Potencia L2" unit="kW" vals={vals} k="L2_pot" onChange={onChange} /></>}
            <MF label="V AC OUT" unit="Vac" vals={vals} k="V_ac_out" onChange={onChange} />
            <MF label="Carga Total" unit="kW" vals={vals} k="load_kw" onChange={onChange} />
            {hasPV && (
              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--blue)' }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    {pvCount > 1 ? `Módulos Solares PV (${pvCount})` : 'Módulo Solar PV'}
                  </div>
                  {pvCount > 1 && (
                    <span style={{ fontSize: '.68rem', color: 'var(--tx3)', fontWeight: 600 }}>Arreglos independientes</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Array.from({ length: pvCount }).map((_, i) => {
                    const modNum = i + 1;
                    const vKey = pvCount === 1 ? 'V_panel' : `V_panel_${modNum}`;
                    const pKey = pvCount === 1 ? 'P_panel' : `P_panel_${modNum}`;
                    const effectiveVals = { ...vals };
                    if (pvCount > 1 && modNum === 1) {
                      if (effectiveVals[vKey] === undefined && effectiveVals['V_panel'] !== undefined) effectiveVals[vKey] = effectiveVals['V_panel'];
                      if (effectiveVals[pKey] === undefined && effectiveVals['P_panel'] !== undefined) effectiveVals[pKey] = effectiveVals['P_panel'];
                    }
                    return (
                      <div
                        key={modNum}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          display: 'grid',
                          gridTemplateColumns: pvCount > 1 ? 'auto 1fr 1fr' : '1fr 1fr',
                          gap: 8,
                          alignItems: 'center'
                        }}
                      >
                        {pvCount > 1 && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(1, 102, 255, 0.12)',
                            color: 'var(--blue)',
                            fontSize: '.72rem',
                            fontWeight: 800,
                            fontFamily: "'JetBrains Mono', monospace"
                          }}>
                            PV {modNum}
                          </span>
                        )}
                        <MF label={pvCount > 1 ? `V Paneles PV${modNum}` : 'V Paneles'} unit="V" vals={effectiveVals} k={vKey} onChange={onChange} />
                        <MF label={pvCount > 1 ? `P Paneles PV${modNum}` : 'P Paneles'} unit="kW" vals={effectiveVals} k={pKey} onChange={onChange} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <MF label="I Batería" unit="Adc" vals={vals} k="I_bat" onChange={onChange} />
          </div>
        );
      }
      if (eq.type === 'ETP') {
        const hasPV = eq.hasSolar;
        const pvCount = Math.max(1, parseInt(eq.pvCount, 10) || 1);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <MF label="DC Load" unit="kW" vals={vals} k="DC_load" onChange={onChange} />
            <MF label="AC Load" unit="kW" vals={vals} k="AC_load" onChange={onChange} />
            <MF label="I Bat" unit="Acc" vals={vals} k="I_bat" onChange={onChange} />
            {hasPV && (
              <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--blue)' }}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    {pvCount > 1 ? `Módulos Solares PV (${pvCount})` : 'Módulo Solar PV'}
                  </div>
                  {pvCount > 1 && (
                    <span style={{ fontSize: '.68rem', color: 'var(--tx3)', fontWeight: 600 }}>Arreglos independientes</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Array.from({ length: pvCount }).map((_, i) => {
                    const modNum = i + 1;
                    const vKey = pvCount === 1 ? 'V_panel' : `V_panel_${modNum}`;
                    const iKey = pvCount === 1 ? 'I_panel' : `I_panel_${modNum}`;
                    const effectiveVals = { ...vals };
                    if (pvCount > 1 && modNum === 1) {
                      if (effectiveVals[vKey] === undefined && effectiveVals['V_panel'] !== undefined) effectiveVals[vKey] = effectiveVals['V_panel'];
                      if (effectiveVals[iKey] === undefined && effectiveVals['I_panel'] !== undefined) effectiveVals[iKey] = effectiveVals['I_panel'];
                    }
                    return (
                      <div
                        key={modNum}
                        style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '6px 10px',
                          display: 'grid',
                          gridTemplateColumns: pvCount > 1 ? 'auto 1fr 1fr' : '1fr 1fr',
                          gap: 8,
                          alignItems: 'center'
                        }}
                      >
                        {pvCount > 1 && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(1, 102, 255, 0.12)',
                            color: 'var(--blue)',
                            fontSize: '.72rem',
                            fontWeight: 800,
                            fontFamily: "'JetBrains Mono', monospace"
                          }}>
                            PV {modNum}
                          </span>
                        )}
                        <MF label={pvCount > 1 ? `V Paneles PV${modNum}` : 'V Paneles'} unit="V" vals={effectiveVals} k={vKey} onChange={onChange} />
                        <MF label={pvCount > 1 ? `I Paneles PV${modNum}` : 'I Paneles'} unit="A" vals={effectiveVals} k={iKey} onChange={onChange} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      }
      if (eq.type === 'ATS' || eq.type === 'BKR') {
        const maxA = eq.conductorGauge ? AWG_AMPACITY[eq.conductorGauge] : (eq.capacity ? parseFloat(eq.capacity) : null);
        const alarm = (line) => {
          if (!maxA) return false;
          const v = parseFloat(vals[line]);
          return !isNaN(v) && v > maxA;
        };

        // Determinar líneas activas según fases (2 líneas: L1, L2, N; 3 líneas: L1, L2, L3, N)
        const isTrifasica = eq.phases === '3' || eq.phases === 'Trifásica' || eq.phases === '3 Líneas' || eq.lineCount === '3' || eq.lineCount === 3;
        const isMonofasica = eq.phases === '1' || eq.phases === 'Monofásica' || eq.phases === '1 Línea' || eq.lineCount === '1' || eq.lineCount === 1;
        const linesToShow = isTrifasica ? ['L1', 'L2', 'L3', 'N'] : (isMonofasica ? ['L1', 'N'] : ['L1', 'L2', 'N']);

        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${linesToShow.length}, 1fr)`, gap: 8, marginBottom: 8 }}>
              {linesToShow.map(line => (
                <div key={line}>
                  <label style={{
                    display: 'block', fontSize: '.68rem', marginBottom: 3, fontFamily: "'Outfit', 'Montserrat', sans-serif", textTransform: 'uppercase', letterSpacing: '.05em',
                    color: alarm(line) ? '#f55b5d' : 'var(--tx3)'
                  }}>
                    {line} <span style={{ color: alarm(line) ? '#f55b5d' : (eq.type === 'BKR' ? '#6366f1' : '#0166ff') }}>A</span>
                  </label>
                  <input className="mi" type="number" step="any" value={vals[line] ?? ''} onChange={e => onChange(line, e.target.value)}
                    placeholder="—" style={{ borderColor: alarm(line) ? '#f55b5d' : undefined, background: alarm(line) ? 'rgba(245, 91, 93,.08)' : undefined }} />
                </div>
              ))}
            </div>
            {maxA && linesToShow.filter(l => l !== 'N').some(l => alarm(l)) && (
              <div style={{ fontSize: '.72rem', background: 'rgba(245, 91, 93,.1)', border: '1px solid rgba(245, 91, 93,.3)', borderRadius: 5, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconAlertTriangle size={15} color="#f55b5d" />
                <span style={{ color: '#f55b5d', fontWeight: 700 }}>¡Amperaje fuera de rango!</span>
                <span style={{ color: 'var(--tx3)' }}>Límite máximo {maxA}A</span>
              </div>
            )}
          </div>
        );
      }
      if (eq.type === 'BAT') return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <MF label="V Banco" unit="VDC" vals={vals} k="V_banco" onChange={onChange} />
          <MF label="I Banco" unit="A" vals={vals} k="I_banco" onChange={onChange} />
        </div>
      );
      return (
        <div>
          <label className="lbl">Observaciones / Mediciones libres</label>
          <textarea className="fi" rows={3} value={vals.libre || ''} onChange={e => onChange('libre', e.target.value)} placeholder="Describe el estado del equipo..." style={{ resize: 'vertical' }} />
        </div>
      );
    }


    // ═══════════════════════════════════════════════════
    // GENERADOR DE REPORTE DE INSPECCIÓN
    // ═══════════════════════════════════════════════════
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

    function generateReportText({ nodeName, date, shift, technicianName, measurements, observations, equipment }) {
      const d = date instanceof Date ? date : new Date(date);
      const dia = DIAS_ES[d.getDay()];
      const diaNum = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const anio = d.getFullYear();
      const fechaStr = `${diaNum}/${mes}/${anio}`;
      const diaCap = dia.charAt(0).toUpperCase() + dia.slice(1);

      const fmtVal = (k, v) => {
        if (v === '' || v === null || v === undefined) return null;
        const pvMatch = k.match(/^(V|I|P)_panel(?:_(\d+))?$/);
        if (pvMatch) {
          const type = pvMatch[1];
          const modNum = pvMatch[2];
          const typeLbl = type === 'V' ? 'Vpaneles' : (type === 'I' ? 'Ipaneles' : 'Ppaneles');
          const unit = type === 'V' ? 'V' : (type === 'I' ? 'A' : 'kW');
          const prefix = modNum ? `PV${modNum} ` : '';
          return `${prefix}${typeLbl}: ${v} ${unit}`;
        }
        const lbl = FIELD_LABELS[k] || k.replace(/_/g, ' ');
        const unit = FIELD_UNITS[k] || '';
        return `${lbl}: ${v}${unit ? ' ' + unit : ''}`;
      };

      const printEq = (tag, lines) => {
        const vals = measurements[tag];
        if (!vals) return;
        lines.push(tag);
        Object.entries(vals).forEach(([k, v]) => {
          const s = fmtVal(k, v); if (s) lines.push(s);
        });
      };

      let lines = [];
      lines.push(`${diaCap} ${fechaStr} se realizó el mantenimiento preventivo en el cuarto de energía del ${nodeName}.`);
      lines.push('');

      // Equipos medidos — ordenados y agrupados por banco
      const measuredEqs = sortEquipment(
        equipment.filter(e => measurements[e.tag] && Object.keys(measurements[e.tag]).some(k => measurements[e.tag][k] !== ''))
      );
      const groups = groupByBank(measuredEqs);

      groups.forEach(({ bank, eqs, bat, orphanBats }) => {
        if (bank === '_ats') {
          // ATS va al final con su sección
          eqs.forEach(eq => { printEq(eq.tag, lines); lines.push(''); });
          return;
        }
        // Equipos del grupo
        eqs.forEach(eq => { printEq(eq.tag, lines); });
        // Voltaje del banco al final del grupo
        if (bat && measurements[bat.tag]) {
          const vb = measurements[bat.tag].V_banco;
          if (vb) lines.push(`V Banco ${bank}: ${vb} Vdc`);
        }
        lines.push('');
        // Bancos huérfanos
        if (orphanBats) orphanBats.forEach(eq => { printEq(eq.tag, lines); lines.push(''); });
      });

      if (observations && observations.trim()) {
        lines.push('Observaciones:');
        observations.trim().split('\n').forEach(l => {
          lines.push(l.startsWith('-') ? l : '- ' + l);
        });
        lines.push('');
      }

      lines.push(`Para la realización de esta actividad se contó con el apoyo del personal:`);
      lines.push(`        - ${technicianName}`);

      return lines.join('\n');
    }

    // Helper para formatear horómetros limpios (ej. 674:12 o 674h)
        // Helper para parsear cualquier formato de horómetro a número flotante de horas
        // DEFAULT_AUTHORIZED_STAFF & useAuthorizedStaff imported from @/hooks/useAuthorizedStaff

    // Revierte el efecto de un surtido sobre los tanques: sub-tanque SOLO de la planta (por tag)
    // y reserva compartida SOLO en las plantas del mismo nodo que realmente tienen reserva.
        // Generador de Formato de Texto de Surtido para WhatsApp / Reportes
        function ReportModal({ data, onClose }) {
      const [text, setText] = useState(() => generateReportText(data));
      const [copied, setCopied] = useState(false);

      const copy = () => {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200); });
      };

      return (
        <div className="fin">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, background: 'rgba(0, 128, 0,.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <IconCheckCircle size={20} color="#008000" />
            </div>
            <div>
              <h2 className="fd" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--tx1)' }}>Reporte Generado</h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.78rem' }}>Puedes editar el texto antes de copiarlo</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14, background: 'var(--bg-deep)', borderColor: 'rgba(0, 128, 0,.2)' }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: '#cbd5e1', fontFamily: "'JetBrains Mono',monospace", fontSize: '.82rem', lineHeight: 1.7, resize: 'vertical', outline: 'none', minHeight: 340 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="bg" style={{ flex: 1 }} onClick={copy}>
              <IconCopy size={16} /> {copied ? 'Copiado' : 'Copiar texto'}
            </button>
            <button className="bp" style={{ flex: 1 }} onClick={onClose}>
              Finalizar
            </button>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--tx4)', fontSize: '.74rem', marginTop: 10 }}>
            Puedes editar el reporte antes de copiarlo para compartirlo por WhatsApp o correo.
          </p>
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // FORMULARIO DE REGISTRO
    // ═══════════════════════════════════════════════════
    function RecordForm({ nodeId, nodeName, equipment, userProfile, onSave, onCancel, toast, initialType = 'inspeccion' }) {
      const DRAFT_KEY = `airtek_draft_general_${nodeId}`;
      
      const getDraft = () => {
        try {
          const saved = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(`energy_draft_${nodeId}_general`);
          return saved ? JSON.parse(saved) : null;
        } catch (e) { return null; }
      };

      const initialDraft = getDraft();

      // Detectar si el técnico viene del botón "Surtir Combustible" de una planta
      const preSurtido = (() => {
        try {
          const s = localStorage.getItem('airtek_presurtido');
          if (s) {
            localStorage.removeItem('airtek_presurtido');
            return JSON.parse(s);
          }
        } catch(e) {}
        return null;
      })();

      const [type, setType] = useState(() => preSurtido ? 'surtido' : (initialDraft?.type || initialType));
      const [date, setDate] = useState(() => initialDraft?.date || new Date().toISOString().slice(0, 16));
      const [shift, setShift] = useState(() => initialDraft?.shift || 'dia');
      const [obs, setObs] = useState(() => initialDraft?.obs || '');
      const [participants, setParticipants] = useState(() => initialDraft?.participants || '');
      const [meas, setMeas] = useState(() => initialDraft?.meas || {});
      const [saving, setSaving] = useState(false);
      const authorizedStaff = useAuthorizedStaff(userProfile);
      const [selPlantTag, setSelPlantTag] = useState(() => preSurtido?.plantTag || initialDraft?.selPlantTag || '');
      const [fuelDest, setFuelDest] = useState(() => initialDraft?.fuelDest || (preSurtido ? 'Surtido Planta' : 'Surtido Reserva'));
      const [fuelLts, setFuelLts] = useState(() => initialDraft?.fuelLts || '');
      const [fuelLtsPlanta, setFuelLtsPlanta] = useState(() => initialDraft?.fuelLtsPlanta || '');
      const [fuelLtsReserva, setFuelLtsReserva] = useState(() => initialDraft?.fuelLtsReserva || '');
      const [fuelHoro, setFuelHoro] = useState(() => initialDraft?.fuelHoro || '');
      const [adjustSub, setAdjustSub] = useState(() => initialDraft?.adjustSub || '');
      const [adjustRes, setAdjustRes] = useState(() => initialDraft?.adjustRes || '');
      const [adjustMotivo, setAdjustMotivo] = useState(() => initialDraft?.adjustMotivo || 'Medición física con vara en sitio');

      // Obtener los niveles actuales del nodo para la Tabla de la Verdad con agregación inteligente de reserva
      const nodeTankInfo = useMemo(() => {
        const norm = normalizeNodeName;
        const targetNorm = norm(nodeName);

        let list = INITIAL_FUEL_TANKS;
        try {
          const savedTanks = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          if (savedTanks.length > 0) list = savedTanks;
        } catch(e) {}

        const matchingTanks = list.filter(t => {
          const tLugarNorm = norm(t.lugar);
          return tLugarNorm === targetNorm || t.lugar?.toLowerCase() === (nodeName || '').toLowerCase() || (targetNorm && tLugarNorm.includes(targetNorm)) || (tLugarNorm && targetNorm.includes(tLugarNorm));
        });

        // La reserva de un nodo/datacenter es compartida para todas sus plantas
        const siteReserva = matchingTanks.reduce((max, t) => Math.max(max, parseFloat(t.reserva_lts) || 0), 0);
        const siteCapReserva = matchingTanks.reduce((max, t) => Math.max(max, parseFloat(t.cap_reserva || t.cap_reserva_lts) || 0), 0);

        // Tanque de la planta específica seleccionada
        let selPlantTank = null;
        if (selPlantTag) {
          selPlantTank = matchingTanks.find(t => t.tag === selPlantTag);
        }
        if (!selPlantTank && matchingTanks.length > 0) {
          selPlantTank = matchingTanks[0];
        }

        const subActual = selPlantTank ? (parseFloat(selPlantTank.subtanque_actual) || parseFloat(selPlantTank.tanque_lts) || 300) : 300;
        const subCap = selPlantTank ? (parseFloat(selPlantTank.tanque_lts) || 300) : 300;

        return {
          tanque_lts: subCap,
          subtanque_actual: subActual,
          cap_reserva_lts: siteCapReserva,
          reserva_lts: siteReserva,
          consumo_lh: selPlantTank?.consumo_lh || 10,
          tag: selPlantTank?.tag || selPlantTag,
          lugar: selPlantTank?.lugar || nodeName
        };
      }, [nodeName, selPlantTag]);

      const curSub = parseFloat(nodeTankInfo.subtanque_actual || nodeTankInfo.tanque_lts) || 0;
      const curRes = parseFloat(nodeTankInfo.reserva_lts) || 0;

      useEffect(() => {
        if (type === 'ajuste_combustible') {
          if (!adjustSub && curSub != null) setAdjustSub(String(curSub));
          if (!adjustRes && curRes != null) setAdjustRes(String(curRes));
        }
      }, [type, curSub, curRes]);

      // Cálculo puro compartido con el modal de surtidos (src/modules/fuel/fuelCalc.js)
      const calcResultingLevels = () => {
        const levels = computeDispatchLevels({
          destino: fuelDest,
          litros: fuelLts,
          litrosPlanta: fuelLtsPlanta,
          litrosReserva: fuelLtsReserva,
          curSub,
          curRes,
          subCap: parseFloat(nodeTankInfo?.tanque_lts) || 300,
          resCap: parseFloat(nodeTankInfo?.cap_reserva_lts) || 0,
        });

        // Total real del nodo: subtanque de esta planta + resto de subtanques + reserva
        const otherSubs = (nodeTankInfo.matchingTanks || [])
          .filter(t => t.tag !== selPlantTag)
          .reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
        const newTotal = levels.newSub + otherSubs + levels.newRes;

        return {
          ...levels,
          newTotal,
          addedTotalDespacho: levels.addedTotal,
          otherSubs,
          sumAllSubs: levels.newSub + otherSubs,
        };
      };

      const { newSub: resultingSub, newRes: resultingRes, newTotal: resultingTotal, addedTotalDespacho, ltsP: resultingLtsP, ltsR: resultingLtsR } = calcResultingLevels();
      const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?.savedAt ? new Date(initialDraft.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null);
      const [eqAction, setEqA] = useState(() => initialDraft?.eqAction || {
        tag: '', type: 'INV', voltage: '220V', voltageDC: '', hasAcIn: false, hasAcOut: true, hasDcOut: false, hasSolar: false, pvCount: 1,
        batteryType: 'LFP', batCapacity: '', batCount: '', batCellType: 'No aplica', notes: '', serial: '',
        batSoH: '', batDoD: '', batSerials: [], solarRegPercentage: '', invMode: 'Cargador/Descargador',
        capacity: '', phases: '', horometer: '', lastMaintenanceHorometer: '', maintenanceInterval: 250
      });

      // Guardar borrador en localStorage automáticamente ante cambios
      const saveDraftToStorage = useCallback(() => {
        try {
          const hasData = (obs && obs.trim()) || (participants && participants.trim()) || Object.keys(meas).length > 0 || eqAction.tag;
          if (!hasData) return;
          const now = new Date();
          const draft = {
            type, date, shift, obs, participants, meas, eqAction,
            nodeId, nodeName, formType: 'general',
            savedAt: now.toISOString()
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          localStorage.setItem('airtek_active_inspection', JSON.stringify({
            nodeId, nodeName, formType: 'general', key: DRAFT_KEY, savedAt: now.toISOString()
          }));
          setLastSavedTime(now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        } catch (e) {
          // silenciado
        }
      }, [type, date, shift, obs, participants, meas, eqAction, nodeId, nodeName, DRAFT_KEY]);

      useEffect(() => {
        saveDraftToStorage();
      }, [saveDraftToStorage]);

      // Guardar ante salida de pantalla o cambio de app
      useEffect(() => {
        const handleVisibility = () => {
          if (document.visibilityState === 'hidden') saveDraftToStorage();
        };
        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', saveDraftToStorage);
        window.addEventListener('beforeunload', saveDraftToStorage);
        return () => {
          window.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('pagehide', saveDraftToStorage);
          window.removeEventListener('beforeunload', saveDraftToStorage);
        };
      }, [saveDraftToStorage]);

      const clearDraft = () => {
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_general`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          const active = localStorage.getItem('airtek_active_inspection');
          if (active && JSON.parse(active)?.key === DRAFT_KEY) {
            localStorage.removeItem('airtek_active_inspection');
          }
        } catch (e) {}
        setMeas({});
        setObs('');
        setParticipants('');
        setLastSavedTime(null);
        toast('Borrador eliminado', 'info');
      };

      const onBatTypeChange = (val) => {
        let vdc = '';
        if (val === 'LFP') vdc = '48';
        else if (val === 'NMC') vdc = '52.5';
        else if (val.includes('GEL')) vdc = '48';
        setEqA({ ...eqAction, batteryType: val, voltageDC: vdc });
      };

      const [reportData, setReportData] = useState(null);
      const [savedSurtidoReport, setSavedSurtidoReport] = useState(null);

      const updM = (tag, k, v) => setMeas(p => ({ ...p, [tag]: { ...(p[tag] || {}), [k]: v } }));
      const active = sortEquipment(equipment.filter(e => e.active !== false));

      const save = async () => {
        if (!date) { toast('Selecciona la fecha.', 'error'); return; }

        if (type === 'ajuste_combustible') {
          const pSub = parseFloat(adjustSub);
          const pRes = parseFloat(adjustRes);
          if (isNaN(pSub) || pSub < 0) { toast('Ingresa un nivel válido para el sub-tanque.', 'error'); return; }
          if (isNaN(pRes) || pRes < 0) { toast('Ingresa un nivel válido para la reserva.', 'error'); return; }
        }

        if (type === 'surtido') {
          const validationError = validateDispatch({
            destino: fuelDest,
            litros: fuelLts,
            litrosPlanta: fuelLtsPlanta,
            litrosReserva: fuelLtsReserva,
            curSub,
            curRes,
            subCap: parseFloat(nodeTankInfo?.tanque_lts) || 0,
            resCap: parseFloat(nodeTankInfo?.cap_reserva_lts) || 0,
          });
          if (validationError) {
            toast(validationError, 'error');
            return;
          }
        }

        setSaving(true);
        try {
          const cleanMeas = {};
          Object.entries(meas).forEach(([tag, fields]) => {
            const filled = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== null && v !== undefined));
            if (Object.keys(filled).length > 0) cleanMeas[tag] = filled;
          });
          const record = {
            type, date: new Date(date), shift: type === 'surtido' ? 'dia' : shift, observations: sanitize(obs),
            technicianId: userProfile.uid, technicianName: sanitize(userProfile.name),
            participants: sanitize(participants.trim()),
            ...(type === 'surtido' ? {
              generatorTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              fuelDestination: fuelDest,
              fuelLiters: addedTotalDespacho,
              fuelLitersPlanta: resultingLtsP,
              fuelLitersReserva: resultingLtsR,
              fuelSubtankLevel: resultingSub,
              fuelPrevSub: curSub,
              fuelPrevRes: curRes,
              fuelReserveLevel: resultingRes,
              fuelTotalLevel: resultingTotal,
              fuelHorometer: fuelHoro,
            } : {}),
            ...(type === 'ajuste_combustible' ? {
              generatorTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              fuelSubLevel: parseFloat(adjustSub) || 0,
              fuelReserveLevel: parseFloat(adjustRes) || 0,
              fuelTotalLevel: (parseFloat(adjustSub) || 0) + (parseFloat(adjustRes) || 0),
              diffSub: (parseFloat(adjustSub) || 0) - curSub,
              diffReserve: (parseFloat(adjustRes) || 0) - curRes,
              fuelHorometer: fuelHoro,
              adjustmentReason: adjustMotivo,
            } : {}),
            measurements: (type === 'inspeccion' || type === 'actualizacion_carga') ? cleanMeas : {},
            equipmentAction: (type !== 'inspeccion' && type !== 'actualizacion_carga' && type !== 'surtido') && eqAction ? {
              tag: sanitize(eqAction.tag || ''),
              type: sanitize(eqAction.type || ''),
              voltage: sanitize(eqAction.voltage || ''),
              voltageDC: sanitize(eqAction.voltageDC || ''),
              hasAcIn: !!eqAction.hasAcIn,
              hasAcOut: !!eqAction.hasAcOut,
              hasDcOut: !!eqAction.hasDcOut,
              hasSolar: !!eqAction.hasSolar,
              pvCount: eqAction.hasSolar ? Math.max(1, parseInt(eqAction.pvCount, 10) || 1) : 0,
              batteryType: sanitize(eqAction.batteryType || ''),
              batCapacity: sanitize(eqAction.batCapacity || ''),
              batCount: sanitize(eqAction.batCount || ''),
              batCellType: sanitize(eqAction.batCellType || 'No aplica'),
              batSoH: sanitize(eqAction.batSoH || ''),
              batDoD: sanitize(eqAction.batDoD || ''),
              batSerials: Array.isArray(eqAction.batSerials) ? eqAction.batSerials.map(s => sanitize(s)) : [],
              solarRegPercentage: sanitize(eqAction.solarRegPercentage || ''),
              invMode: sanitize(eqAction.invMode || ''),
              capacity: sanitize(eqAction.capacity || ''),
              phases: sanitize(eqAction.phases || ''),
              horometer: eqAction.horometer,
              lastMaintenanceHorometer: eqAction.lastMaintenanceHorometer,
              maintenanceInterval: eqAction.maintenanceInterval,
              serial: sanitize(eqAction.serial || ''),
              notes: sanitize(eqAction.notes)
            } : null,
            createdAt: TS()
          };
          let firestoreSaveSuccess = false;
          let firestoreErrorMsg = '';

          try {
            await db.collection('energy_nodes').doc(nodeId).collection('energy_records').add(record);
            firestoreSaveSuccess = true;

            if (type === 'instalacion' && eqAction.tag) {
              const isDC = eqAction.type === 'BAT' || eqAction.type === 'ETP';
              await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').add({
                tag: sanitize(eqAction.tag), type: sanitize(eqAction.type),
                voltage: isDC ? '' : sanitize(eqAction.voltage),
                voltageDC: sanitize(eqAction.voltageDC || ''),
                hasAcIn: !!eqAction.hasAcIn, hasAcOut: !!eqAction.hasAcOut, hasDcOut: !!eqAction.hasDcOut,
                hasSolar: !!eqAction.hasSolar,
                pvCount: eqAction.hasSolar ? Math.max(1, parseInt(eqAction.pvCount, 10) || 1) : 0,
                batteryType: sanitize(eqAction.batteryType),
                batCapacity: sanitize(eqAction.batCapacity || ''), batCount: sanitize(eqAction.batCount || ''),
                batCellType: sanitize(eqAction.batCellType || 'No aplica'),
                batSoH: sanitize(eqAction.batSoH || ''), batDoD: sanitize(eqAction.batDoD || ''),
                batSerials: Array.isArray(eqAction.batSerials) ? eqAction.batSerials.map(s => sanitize(s)) : [],
                solarRegPercentage: sanitize(eqAction.solarRegPercentage || ''), invMode: sanitize(eqAction.invMode || ''),
                capacity: sanitize(eqAction.capacity || ''), phases: sanitize(eqAction.phases || ''),
                horometer: eqAction.type === 'GEN' ? (parseHours(eqAction.horometer) || 0) : '',
                lastMaintenanceHorometer: eqAction.type === 'GEN' ? (parseHours(eqAction.lastMaintenanceHorometer) || parseHours(eqAction.horometer) || 0) : 0,
                maintenanceInterval: eqAction.type === 'GEN' ? (parseFloat(eqAction.maintenanceInterval) || 250) : 250,
                active: true, installedAt: new Date(date), installedBy: sanitize(userProfile.name), serial: sanitize(eqAction.serial || ''), notes: sanitize(eqAction.notes)
              });
            }
            if (type === 'reemplazo' && eqAction.tag) {
              const eq = active.find(e => e.tag === eqAction.tag);
              if (eq) await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(eq.id).update({ active: false, retiredAt: new Date(date) });
            }
          } catch (fsErr) {
            console.warn('Firestore write warning:', fsErr);
            firestoreErrorMsg = fsErr.message || String(fsErr);
          }

          if (type === 'surtido') {
            const plantTag = selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '');
            let parsedHoro = 0;
            if (fuelHoro) {
              const hMatch = String(fuelHoro).match(/(\d+)h\s*(\d+)?m?/);
              if (hMatch) {
                parsedHoro = parseInt(hMatch[1]) + (parseInt(hMatch[2] || 0) / 60);
              } else {
                parsedHoro = parseFloat(fuelHoro) || 0;
              }
            }

            // Actualizar horómetro del equipo en Firestore si hubo conexión
            if (plantTag && parsedHoro > 0 && db) {
              try {
                const genEq = equipment.find(e => e.type === 'GEN' && e.tag === plantTag);
                if (genEq) {
                  await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(genEq.id).update({
                    horometer: parsedHoro
                  });
                }
              } catch(e) {}
            }

            // Sincronizar con el catálogo global de surtidos en localStorage
            const newRefillObj = {
              id: 'r_rec_' + Date.now(),
              fecha: new Date(date).toLocaleDateString('es-VE'),
              semana: 'Semana Actual',
              lugar: nodeName,
              tag: plantTag,
              litros: addedTotalDespacho,
              litros_planta: resultingLtsP,
              litros_reserva: resultingLtsR,
              destino: fuelDest,
              subtanque_lts: resultingSub,
              reserva_lts: resultingRes,
              prev_subtanque_lts: curSub,
              prev_reserva_lts: curRes,
              total_nodo: resultingTotal,
              horometro: fuelHoro ? (String(fuelHoro).includes('h') ? fuelHoro : `${fuelHoro} h`) : (parsedHoro > 0 ? `${parsedHoro} h` : ''),
              horas_trabajo: '',
              tecnico: sanitize(userProfile.name),
              obs: sanitize(obs)
            };

            try {
              const curRefills = JSON.parse(localStorage.getItem('airtek_fuel_refills_v12') || '[]');
              localStorage.setItem('airtek_fuel_refills_v12', JSON.stringify([newRefillObj, ...curRefills]));
            } catch(e) {}

            // Persistir balance de combustible en Firestore (energy_nodes/{id}/fuel/state) y en LocalStorage
            await persistNodeFuelUpdate({
              db,
              nodeId,
              nodeName,
              plantTag,
              resultingSub,
              resultingRes,
              resultingTotal,
              addedTotalDespacho,
              resultingLtsP,
              resultingLtsR,
              fuelDest,
              fuelHoro,
              userProfile
            });
          } else if (type === 'ajuste_combustible') {
            const pSub = parseFloat(adjustSub) || 0;
            const pRes = parseFloat(adjustRes) || 0;
            const pTotal = pSub + pRes;
            await persistNodeFuelUpdate({
              db,
              nodeId,
              nodeName,
              plantTag: selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || ''),
              resultingSub: pSub,
              resultingRes: pRes,
              resultingTotal: pTotal,
              addedTotalDespacho: 0,
              resultingLtsP: 0,
              resultingLtsR: 0,
              fuelDest: `Calibración (${adjustMotivo})`,
              fuelHoro: fuelHoro || '',
              userProfile
            });
          }

          if (!firestoreSaveSuccess && firestoreErrorMsg.includes('permission')) {
            toast('Registro guardado localmente. Nota: Tu usuario en Firestore está pendiente de aprobación en el Panel de Administración.', 'info');
          }

          toast('Registro guardado exitosamente.', 'success');
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_general`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          // Verificar alarmas de conductores ATS
          if (type === 'inspeccion') {
            const alarms = checkAtsAlarms(cleanMeas, active);
            if (alarms.length > 0) {
              const msg = alarms.map(a => `${a.tag} - ${a.line}: ${a.measured}A > ${a.maxA}A (Cable ${a.calibre})`).join('\n');
              toast('Amperaje fuera de rango en ' + alarms.map(a => a.tag).join(', '), 'error');
              sendNotificationAlert({
                nodo: nodeName,
                tecnico: userProfile.name,
                fecha: new Date(date).toLocaleDateString('es-VE'),
                alarmas: `[SOBRECARGA DE CABLEADO ATS]\n${msg}`,
                observaciones: obs || 'Inspección técnica de cableado en nodo.',
              });
            }
          }
          // Mostrar reporte si es inspección con mediciones o si es surtido de combustible
          if (type === 'inspeccion' && Object.keys(cleanMeas).length > 0) {
            setReportData({ nodeName, date: new Date(date), shift, technicianName: userProfile.name, measurements: cleanMeas, observations: obs, equipment: active });
          } else if (type === 'surtido') {
            const fuelText = generateFuelReportText({
              nodeName: nodeName || 'Nodo',
              date: new Date(date),
              record,
              equipment: active,
              tanks: [nodeTankInfo]
            });
            setSavedSurtidoReport(fuelText);
          } else {
            onSave();
          }
        } catch (e) {
          toast('Error al guardar registro: ' + (e.message || e), 'error');
        } finally {
          setSaving(false);
        }
      };

      if (savedSurtidoReport) {
        return (
          <div className="fin">
            <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <h3 className="fd" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>¡Surtido Registrado con Éxito!</h3>
                    <p style={{ color: 'var(--tx3)', fontSize: '.78rem', margin: '2px 0 0' }}>Mensaje listo para copiar y enviar al grupo de WhatsApp o reporte:</p>
                  </div>
                </div>
                <span className="badge" style={{ background: 'rgba(1, 102, 255, 0.15)', color: 'var(--blue)', fontWeight: 800 }}>SURTIDO</span>
              </div>

              <textarea
                className="fi fm"
                rows={11}
                readOnly
                value={savedSurtidoReport}
                style={{ resize: 'vertical', fontSize: '.84rem', lineHeight: 1.6, background: 'var(--bg-deep)', color: 'var(--tx1)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="bp"
                  style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', fontSize: '.88rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(savedSurtidoReport).then(() => {
                      if (toast) toast('¡Mensaje de surtido copiado al portapapeles!', 'success');
                    });
                  }}
                >
                  <IconCopy size={16} /> Copiar Mensaje para WhatsApp
                </button>
                <button
                  className="bs"
                  style={{ padding: '10px 22px', fontSize: '.88rem' }}
                  onClick={() => { setSavedSurtidoReport(null); onSave(); }}
                >
                  Finalizar y Volver
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (reportData) {
        return (
          <div className="fin">
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)' }}>Reporte de Inspección Generado</h3>
                <span className="badge" style={{ background: '#00800022', color: '#008000' }}>Listo para copiar</span>
              </div>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', marginBottom: 12 }}>
                Copia este reporte estructurado para compartirlo en el grupo de WhatsApp o pegarlo en el ticket de Odoo:
              </p>
              <textarea
                className="fi fm"
                rows={12}
                readOnly
                value={generateReportText(reportData)}
                style={{ resize: 'vertical', fontSize: '.82rem', lineHeight: 1.5, background: 'var(--bg-deep)' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  className="bg"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const text = generateReportText(reportData);
                    navigator.clipboard.writeText(text);
                    toast('Reporte copiado al portapapeles', 'success');
                  }}
                >
                  <IconCopy size={16} /> Copiar Reporte
                </button>
                <button className="bp" style={{ flex: 1 }} onClick={onSave}>
                  Finalizar
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="fin">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center' }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx1)' }}>Nuevo Registro</h2>
                <p style={{ color: 'var(--tx3)', fontSize: '.8rem' }}>{nodeName}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastSavedTime && (
                <span style={{ fontSize: '.72rem', color: '#10b981', background: 'rgba(16,185,129,.12)', padding: '4px 8px', borderRadius: 4 }}>
                  Guardado local {lastSavedTime}
                </span>
              )}
              <button className="bd" style={{ padding: '5px 10px', fontSize: '.72rem' }} onClick={clearDraft} title="Limpiar los campos del borrador">
                Limpiar
              </button>
            </div>
          </div>

          {/* Info general */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Información General</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="lbl">Tipo de Registro</label>
                <select className="fi" value={type} onChange={e => setType(e.target.value)}>
                  {Object.entries(REC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Turno</label>
                <select className="fi" value={shift} onChange={e => setShift(e.target.value)}>
                  <option value="dia">Día</option>
                  <option value="noche">Noche</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Fecha y Hora</label>
                <input className="fi" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <PersonnelMultiSelect
                  value={participants}
                  onChange={setParticipants}
                  staff={authorizedStaff}
                  label="Personal que realizó la inspección / actividad"
                />
              </div>
            </div>
          </div>

                    {/* Plantilla: Surtido de Combustible */}
          {type === 'surtido' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 800 }}>SURTIDO</span>
                Registro de Despacho Real de Combustible
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 10 }}>
                Asienta los litros de gasoil suministrados y el horómetro actual de la planta eléctrica en este nodo.
              </div>

              {/* Guía informativa: Diferencia entre Surtido y Ajuste */}
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 14, padding: '10px 14px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>⛽</span>
                <div>
                  <strong style={{ color: 'var(--tx1)' }}>Surtido Real de Combustible:</strong> Úsalo exclusivamente cuando se abastece combustible físico (desde cisterna o llenando la planta). En nodos con reserva, el surtido a la planta descuenta de la reserva externa.
                  <div style={{ marginTop: 4, color: 'var(--tx2)' }}>
                    Si observas que el nivel en sistema no coincide con la realidad física (vara o sensor), cambia el <strong>Tipo de Registro</strong> a <span style={{ color: '#a78bfa', fontWeight: 700 }}>"Ajuste / Calibración de Niveles"</span> para calibrar sin despachos ficticios.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label className="lbl">Planta Eléctrica</label>
                  <select className="fi" value={selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '')} onChange={e => setSelPlantTag(e.target.value)}>
                    {equipment.filter(e => e.type === 'GEN').map(eq => (
                      <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.capacity ? eq.capacity + ' kVA' : 'Generador'})</option>
                    ))}
                    {equipment.filter(e => e.type === 'GEN').length === 0 && (
                      <option value="GEN-PLT-00">Planta Eléctrica del Nodo</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="lbl">Destino del Combustible</label>
                  <select className="fi" value={fuelDest} onChange={e => setFuelDest(e.target.value)}>
                    <option value="Surtido Planta">Surtido Planta ({nodeTankInfo?.tanque_lts || 300} L máx{(nodeTankInfo?.cap_reserva_lts || 0) > 0 ? ', descuenta de la reserva' : ''})</option>
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <option value="Surtido Reserva">Surtido Reserva (Cisterna a Tanque - {nodeTankInfo?.cap_reserva_lts} L máx)</option>
                    )}
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <option value="Surtido Planta y Reserva">Surtido Planta y Reserva (Cisterna a Ambos)</option>
                    )}
                  </select>
                </div>

                {fuelDest !== 'Surtido Planta y Reserva' ? (
                  <div>
                    <label className="lbl">
                      {fuelDest === 'Surtido Reserva' ? 'Litros a Reserva (Lts)' : (fuelDest === 'Trasiego Interno' ? 'Litros a Trasegar a Planta (Lts)' : 'Litros a Planta (Lts)')}
                      {fuelDest === 'Surtido Planta' && (
                        <span style={{ marginLeft: 6, color: 'var(--blue)', fontSize: '.7rem' }}>
                          (Límite tanque: {nodeTankInfo?.tanque_lts || 300} Lts | Actual: {curSub} Lts)
                        </span>
                      )}
                      {fuelDest === 'Trasiego Interno' && (
                        <span style={{ marginLeft: 6, color: curRes > 0 ? 'var(--blue)' : '#f55b5d', fontSize: '.7rem' }}>
                          (Disp. en Reserva: {curRes} Lts)
                        </span>
                      )}
                    </label>
                    <input
                      className="fi fm"
                      type="number"
                      step="any"
                      placeholder="Ej: 100"
                      value={fuelLts}
                      max={fuelDest === 'Trasiego Interno' ? curRes : undefined}
                      onChange={e => setFuelLts(e.target.value)}
                    />
                    {fuelDest === 'Trasiego Interno' && (parseFloat(fuelLts) || 0) > curRes && (
                      <div style={{ color: '#f55b5d', fontSize: '.72rem', marginTop: 3, fontWeight: 600 }}>
                        Excede la reserva disponible ({curRes} Lts máx).
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="lbl">Litros a Planta (Lts)</label>
                      <input className="fi fm" type="number" step="any" placeholder="Ej: 80" value={fuelLtsPlanta} onChange={e => setFuelLtsPlanta(e.target.value)} />
                    </div>
                    <div>
                      <label className="lbl">Litros a Reserva (Lts)</label>
                      <input className="fi fm" type="number" step="any" placeholder="Ej: 200" value={fuelLtsReserva} onChange={e => setFuelLtsReserva(e.target.value)} />
                    </div>
                  </>
                )}

                <div>
                  <label className="lbl">Horómetro Actual de la Planta (Horas)</label>
                  <input className="fi fm" type="text" placeholder="Ej: 600:42:00 o 600" value={fuelHoro} onChange={e => setFuelHoro(e.target.value)} />
                </div>
              </div>

              {/* Indicador en vivo de Litros Totales en el Nodo */}
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Litros Totales de Combustible en el Nodo
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginTop: 2 }}>
                    {nodeTankInfo.matchingTanks && nodeTankInfo.matchingTanks.length > 1 ? (
                      <span>
                        Sub-tanque ({selPlantTag || 'Planta'}): <strong style={{ color: 'var(--tx1)' }}>{resultingSub} Lts</strong> | Reserva Compartida: <strong style={{ color: 'var(--tx1)' }}>{resultingRes} Lts</strong>
                      </span>
                    ) : (
                      <span>
                        Sub-tanque: <strong style={{ color: 'var(--tx1)' }}>{resultingSub} Lts</strong> | Reserva: <strong style={{ color: 'var(--tx1)' }}>{resultingRes} Lts</strong>
                      </span>
                    )}
                    {fuelDest === 'Trasiego Interno' && (
                      <span style={{ marginLeft: 8, color: '#21c0fa', fontSize: '.74rem', fontWeight: 600 }}>(Trasiego: -{parseFloat(fuelLts)||0}L de reserva a planta)</span>
                    )}
                    {fuelDest === 'Surtido Planta y Reserva' && (
                      <span style={{ marginLeft: 8, color: '#8b5cf6', fontSize: '.74rem', fontWeight: 600 }}>(Total despachado: +{addedTotalDespacho}L)</span>
                    )}
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--green)' }}>
                  {resultingTotal} <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Lts</span>
                </div>
              </div>
            </div>
          )}

          {/* Plantilla: Ajuste y Calibración de Niveles Reales */}
          {type === 'ajuste_combustible' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', fontWeight: 800 }}>AJUSTE / CALIBRACIÓN</span>
                Calibración de Niveles Reales por Medición Física
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginBottom: 14 }}>
                Permite corregir discrepancias entre el sistema y la medición física con vara en sitio (por consumo de planta, evaporación o error previo). No simula despachos ficticios ni descuenta entre tanques.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label className="lbl">Planta Eléctrica</label>
                  <select className="fi" value={selPlantTag || (equipment.find(e => e.type === 'GEN')?.tag || '')} onChange={e => setSelPlantTag(e.target.value)}>
                    {equipment.filter(e => e.type === 'GEN').map(eq => (
                      <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.capacity ? eq.capacity + ' kVA' : 'Generador'})</option>
                    ))}
                    {equipment.filter(e => e.type === 'GEN').length === 0 && (
                      <option value="GEN-PLT-00">Planta Eléctrica del Nodo</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="lbl">Motivo del Ajuste</label>
                  <select className="fi" value={adjustMotivo} onChange={e => setAdjustMotivo(e.target.value)}>
                    <option value="Medición física con vara en sitio">Medición física con vara en sitio</option>
                    <option value="Consumo de planta por corte eléctrico no asentado">Consumo de planta por corte eléctrico no asentado</option>
                    <option value="Corrección por error de técnico en surtido previo">Corrección por error de técnico en surtido previo</option>
                    <option value="Auditoría periódica de inventario">Auditoría periódica de inventario</option>
                    <option value="Otro motivo operativo">Otro motivo operativo</option>
                  </select>
                </div>

                <div>
                  <label className="lbl">
                    Nivel Real Sub-Tanque Planta (Lts)
                    <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: '.7rem' }}>(Cap: {nodeTankInfo?.tanque_lts || 300} L)</span>
                  </label>
                  <input
                    className="fi fm"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej: 80"
                    value={adjustSub}
                    onChange={e => setAdjustSub(e.target.value)}
                  />
                  <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 3 }}>
                    Nivel actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curSub} Lts</strong>
                    {parseFloat(adjustSub) !== curSub && !isNaN(parseFloat(adjustSub)) && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: (parseFloat(adjustSub) - curSub) >= 0 ? '#10b981' : '#f55b5d' }}>
                        ({(parseFloat(adjustSub) - curSub) >= 0 ? `+${(parseFloat(adjustSub) - curSub)}` : (parseFloat(adjustSub) - curSub)} L)
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="lbl">
                    Nivel Real Reserva del Nodo (Lts)
                    {(nodeTankInfo?.cap_reserva_lts || 0) > 0 && (
                      <span style={{ marginLeft: 6, color: 'var(--tx3)', fontSize: '.7rem' }}>(Cap: {nodeTankInfo?.cap_reserva_lts} L)</span>
                    )}
                  </label>
                  <input
                    className="fi fm"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Ej: 160"
                    value={adjustRes}
                    onChange={e => setAdjustRes(e.target.value)}
                  />
                  <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 3 }}>
                    Nivel actual en sistema: <strong style={{ color: 'var(--tx2)' }}>{curRes} Lts</strong>
                    {parseFloat(adjustRes) !== curRes && !isNaN(parseFloat(adjustRes)) && (
                      <span style={{ marginLeft: 6, fontWeight: 700, color: (parseFloat(adjustRes) - curRes) >= 0 ? '#10b981' : '#f55b5d' }}>
                        ({(parseFloat(adjustRes) - curRes) >= 0 ? `+${(parseFloat(adjustRes) - curRes)}` : (parseFloat(adjustRes) - curRes)} L)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Horómetro Actual de la Planta (Horas)</label>
                  <input className="fi fm" type="text" placeholder="Ej: 600:42:00 o 600" value={fuelHoro} onChange={e => setFuelHoro(e.target.value)} />
                </div>
              </div>

              {/* Resumen del Balance tras Ajuste */}
              <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                    Balance Total Resultante en el Nodo tras Calibrar
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx2)', marginTop: 2 }}>
                    Sub-tanque: <strong style={{ color: 'var(--tx1)' }}>{parseFloat(adjustSub)||0} Lts</strong> | Reserva: <strong style={{ color: 'var(--blue)' }}>{parseFloat(adjustRes)||0} Lts</strong>
                    <span style={{ marginLeft: 8, color: '#8b5cf6', fontSize: '.74rem', fontWeight: 600 }}>
                      (Ajuste directo sin descuento entre tanques)
                    </span>
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--green)' }}>
                  {(parseFloat(adjustSub)||0) + (parseFloat(adjustRes)||0)} <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Lts</span>
                </div>
              </div>
            </div>
          )}

          {/* Plantilla: Actualización Rápida de Cargas */}
          {type === 'actualizacion_carga' && (
            active.length === 0
              ? <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay equipos activos en este nodo.</p>
                <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Instalación</button>
              </div>
              : (() => {
                const groups = groupByBank(active);
                const powerGroups = groups.filter(g => g.eqs.some(e => e.type === 'ETP' || e.type === 'INV') || g.bat);

                if (powerGroups.length === 0) {
                  return (
                    <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                      <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay fuentes de poder ETP ni inversores registrados en este nodo.</p>
                      <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Equipo</button>
                    </div>
                  );
                }

                return (
                  <div>
                    <div className="card" style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: '.82rem', color: 'var(--tx1)', fontWeight: 600, marginBottom: 2 }}>
                        Actualización Rápida de Cargas por Banco
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--tx3)' }}>
                        Indica la carga de cada fuente ETP (DC y AC) e inversores por línea. La autonomía se recalcula automáticamente en tiempo real.
                      </div>
                    </div>

                    {powerGroups.map(({ bank, eqs, bat }) => {
                      const powerEqs = eqs.filter(e => e.type === 'ETP' || e.type === 'INV');
                      let bankAc = 0, bankDc = 0;
                      powerEqs.forEach(eq => {
                        const vals = meas[eq.tag] || {};
                        const ld = calcLoad(eq.type, vals);
                        bankAc += ld.ac;
                        bankDc += ld.dc;
                      });
                      const totalBankKW = bankAc + bankDc;
                      const aut = (bat && totalBankKW > 0) ? calcAutonomy(bat, bankAc, bankDc) : null;
                      const autColor = !aut ? 'var(--tx3)' : aut > 4 ? '#008000' : aut > 2 ? '#0166ff' : '#f55b5d';

                      return (
                        <div key={bank || '_ung'} className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                          {/* Encabezado del Banco y Autonomía en Vivo */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span className="badge" style={{ background: 'rgba(33, 192, 250,.18)', color: '#21c0fa', fontWeight: 700, fontSize: '.75rem' }}>
                                  {bank ? `Banco ${bank}` : 'General / Sin Banco'}
                                </span>
                                {bat ? (
                                  <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>
                                    {bat.tag} ({bat.batCapacity || '—'}Ah · {bat.batteryType || 'LFP'})
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '.74rem', color: 'var(--amber)' }}>
                                    Sin batería asociada
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Autonomía estimada:</span>
                                <span className="fm" style={{ fontSize: '1.2rem', fontWeight: 800, color: autColor }}>
                                  {aut !== null ? fmtHours(aut) : '—'}
                                </span>
                              </div>
                              <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                                Σ Carga: <strong style={{ color: '#0166ff' }}>{totalBankKW.toFixed(2)} kW</strong> (AC: {bankAc.toFixed(2)} · DC: {bankDc.toFixed(2)})
                              </div>
                            </div>
                          </div>

                          {/* Lista de Equipos (Solo ETP e Inversores) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {powerEqs.length === 0 ? (
                              <div style={{ fontSize: '.78rem', color: 'var(--tx3)', padding: '6px 0' }}>
                                No hay fuentes ETP ni inversores asociados a este banco.
                              </div>
                            ) : powerEqs.map(eq => {
                              const vals = meas[eq.tag] || {};
                              const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;

                              if (eq.type === 'ETP') {
                                const dc = parseFloat(vals.DC_load) || 0;
                                const ac = parseFloat(vals.AC_load) || 0;
                                const tot = dc + ac;

                                return (
                                  <div key={eq.id} style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                                        <span className="fm" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                                        <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Fuente de Poder</span>
                                      </div>
                                      <span className="fm" style={{ fontSize: '.84rem', color: tot > 0 ? '#008000' : 'var(--tx3)', fontWeight: 700 }}>
                                        Total Fuente: {tot.toFixed(2)} kW
                                      </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                      <MF label="DC Load" unit="kW" vals={vals} k="DC_load" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      <MF label="AC Load" unit="kW" vals={vals} k="AC_load" onChange={(k, v) => updM(eq.tag, k, v)} />
                                    </div>
                                  </div>
                                );
                              }

                              if (eq.type === 'INV') {
                                const is220 = eq.voltage === '220V';
                                const l1p = parseFloat(vals.L1_pot) || 0;
                                const l2p = parseFloat(vals.L2_pot) || 0;
                                const tot = parseFloat(vals.load_kw) || (l1p + l2p);

                                return (
                                  <div key={eq.id} style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                                        <span className="fm" style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                                        {eq.voltage && <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{eq.voltage}</span>}
                                      </div>
                                      <span className="fm" style={{ fontSize: '.84rem', color: tot > 0 ? '#008000' : 'var(--tx3)', fontWeight: 700 }}>
                                        Total Inversor: {tot.toFixed(2)} kW
                                      </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: is220 ? 'repeat(auto-fit, minmax(130px, 1fr))' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                                      <MF label="Potencia L1" unit="kW" vals={vals} k="L1_pot" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      <MF label="Carga L1" unit="%" vals={vals} k="L1_carga" onChange={(k, v) => updM(eq.tag, k, v)} />
                                      {is220 && (
                                        <>
                                          <MF label="Potencia L2" unit="kW" vals={vals} k="L2_pot" onChange={(k, v) => updM(eq.tag, k, v)} />
                                          <MF label="Carga L2" unit="%" vals={vals} k="L2_carga" onChange={(k, v) => updM(eq.tag, k, v)} />
                                        </>
                                      )}
                                      <MF label="Carga Total" unit="kW" vals={vals} k="load_kw" onChange={(k, v) => updM(eq.tag, k, v)} />
                                    </div>
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
          )}

          {/* Mediciones — agrupadas por banco */}
          {type === 'inspeccion' && (
            active.length === 0
              ? <div className="card" style={{ textAlign: 'center', marginBottom: 14, padding: 30 }}>
                <p style={{ color: 'var(--tx3)', marginBottom: 12 }}>No hay equipos activos en este nodo.</p>
                <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setType('instalacion')}>Registrar Instalación</button>
              </div>
              : (() => {
                const groups = groupByBank(active);

                return groups.map(({ bank, eqs, bat, orphanBats }) => (
                  <div key={bank || '_ung'} style={{ marginBottom: 20 }}>
                    {/* Equipos del grupo */}
                    {eqs.map(eq => {
                      const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;
                      return (
                        <div key={eq.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{eq.tag}</span>
                            {eq.voltage && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltage}</span>}
                            {eq.hasAcIn && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>AC/IN</span>}
                            {eq.hasAcOut && <span style={{ color: '#008000', fontSize: '.74rem' }}>AC/OUT</span>}
                            {eq.hasDcOut && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>DC/OUT</span>}
                            {eq.hasSolar && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>{eq.pvCount > 1 ? `PV (${eq.pvCount})` : 'PV'}</span>}
                            {eq.type === 'ETP' && eq.solarRegPercentage && <span style={{ color: '#0166ff', fontSize: '.74rem' }}>{eq.solarRegPercentage}%</span>}
                            {eq.batteryType && eq.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{eq.batteryType}</span>}
                          </div>
                          <EqMeasurements eq={eq} vals={meas[eq.tag] || {}} onChange={(k, v) => updM(eq.tag, k, v)} />
                        </div>
                      );
                    })}
                    {/* Banco asociado al final del grupo */}
                    {bat && (() => {
                      const ti = EQ_TYPES.BAT;
                      return (
                        <div key={bat.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', background: 'rgba(33, 192, 250,.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>BAT</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{bat.tag}</span>
                            {bat.batteryType && bat.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batteryType}</span>}
                            {bat.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batCapacity}Ah</span>}
                            {bat.batCount && <span style={{ color: '#64748b', fontSize: '.74rem' }}>{bat.batCount} bat.</span>}
                          </div>
                          <EqMeasurements eq={bat} vals={meas[bat.tag] || {}} onChange={(k, v) => updM(bat.tag, k, v)} />
                        </div>
                      );
                    })()}
                    {/* Bancos huérfanos */}
                    {orphanBats && orphanBats.map(bat => {
                      const ti = EQ_TYPES.BAT;
                      return (
                        <div key={bat.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', background: 'rgba(33, 192, 250,.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span className="badge" style={{ background: ti.bg, color: ti.color }}>BAT</span>
                            <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{bat.tag}</span>
                            {bat.batteryType && bat.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batteryType}</span>}
                            {bat.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.74rem' }}>{bat.batCapacity}Ah</span>}
                          </div>
                          <EqMeasurements eq={bat} vals={meas[bat.tag] || {}} onChange={(k, v) => updM(bat.tag, k, v)} />
                        </div>
                      );
                    })}
                  </div>
                ));
              })()
          )}

          {/* Instalación */}
          {type === 'instalacion' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Equipo a Instalar</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Tag / Identificador del Equipo</label>
                  <input className="fi fm" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })} placeholder="Ej: INV00-PV-LFP00" />
                </div>
                <div>
                  <label className="lbl">Tipo</label>
                  <select className="fi" value={eqAction.type} onChange={e => setEqA({ ...eqAction, type: e.target.value })}>
                    {Object.entries(EQ_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {eqAction.type === 'INV' && <>
                  <div>
                    <label className="lbl">Modo Operación</label>
                    <select className="fi" value={eqAction.invMode} onChange={e => setEqA({ ...eqAction, invMode: e.target.value })}>
                      <option value="Cargador/Descargador">Inversor / Cargador</option>
                      <option value="Solo Inversor">Solo Inversor (Descargador)</option>
                      <option value="Solo Cargador">Solo Cargador</option>
                    </select>
                  </div>
                  {eqAction.invMode !== 'Solo Cargador' && <div>
                    <label className="lbl">Tensión de Salida AC</label>
                    <select className="fi" value={eqAction.voltage} onChange={e => setEqA({ ...eqAction, voltage: e.target.value })}>
                      <option value="110V">110V (1 Línea)</option>
                      <option value="220V">220V (2 Líneas)</option>
                    </select>
                  </div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, gridColumn: '1/-1' }}>
                    <label className="lbl" style={{ marginBottom: 0 }}>Conexiones</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[['hasAcIn', 'ENTRADA AC (Cargador)'],
                      ['hasAcOut', 'Salida AC'],
                      ['hasSolar', 'Entrada PV (Solar)']].map(([k, lbl]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!eqAction[k]} onChange={e => setEqA({ ...eqAction, [k]: e.target.checked })} />
                          {lbl}
                        </label>
                      ))}
                    </div>
                    {eqAction.hasSolar && (
                      <div style={{ marginTop: 4, maxWidth: 200 }}>
                        <label className="lbl" style={{ fontSize: '.76rem' }}>Cantidad de Módulos PV</label>
                        <input
                          className="fi fm"
                          type="number"
                          min="1"
                          max="10"
                          value={eqAction.pvCount || 1}
                          onChange={e => setEqA({ ...eqAction, pvCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>
                </>}
                {eqAction.type === 'ETP' && <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                    <label className="lbl" style={{ marginBottom: 0 }}>Conexiones Solares</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!eqAction.hasSolar} onChange={e => setEqA({ ...eqAction, hasSolar: e.target.checked })} />
                      Tiene Paneles Solares
                    </label>
                    {eqAction.hasSolar && (
                      <div style={{ marginTop: 4, maxWidth: 200 }}>
                        <label className="lbl" style={{ fontSize: '.76rem' }}>Cantidad de Módulos PV</label>
                        <input
                          className="fi fm"
                          type="number"
                          min="1"
                          max="10"
                          value={eqAction.pvCount || 1}
                          onChange={e => setEqA({ ...eqAction, pvCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="lbl">Efic. Regulación (%) - Opcional</label>
                    <input className="fi" type="number" value={eqAction.solarRegPercentage} onChange={e => setEqA({ ...eqAction, solarRegPercentage: e.target.value })} placeholder="Ej: 85" />
                  </div>
                </>}
                {(eqAction.type === 'BAT' || eqAction.type === 'ETP') && (
                  <div>
                    <label className="lbl">Voltaje Nominal (VDC)</label>
                    <input className="fi fm" value={eqAction.voltageDC} onChange={e => setEqA({ ...eqAction, voltageDC: e.target.value })} placeholder="Ej: 48" />
                  </div>
                )}
                {(eqAction.type === 'INV' || eqAction.type === 'BAT' || eqAction.type === 'ETP') && (
                  <div>
                    <label className="lbl">Tipo de Batería Principal</label>
                    <select className="fi" value={eqAction.batteryType} onChange={e => onBatTypeChange(e.target.value)}>
                      {BAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {eqAction.type === 'BAT' && <>
                  <div>
                    <label className="lbl">Capacidad Base (Ah)</label>
                    <input className="fi" type="number" step="any" value={eqAction.batCapacity} onChange={e => setEqA({ ...eqAction, batCapacity: e.target.value })} placeholder="Ej: 200" />
                  </div>
                  <div>
                    <label className="lbl">Número de Baterías (Bloques)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batCount} onChange={e => setEqA({ ...eqAction, batCount: e.target.value })} placeholder="Ej: 4" />
                  </div>
                  <div>
                    <label className="lbl">Salud del Banco (SoH %)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batSoH} onChange={e => setEqA({ ...eqAction, batSoH: e.target.value })} placeholder="Ej: 100 (opcional)" />
                  </div>
                  <div>
                    <label className="lbl">Profund. Descarga (DoD %)</label>
                    <input className="fi" type="number" step="1" value={eqAction.batDoD} onChange={e => setEqA({ ...eqAction, batDoD: e.target.value })} placeholder="Ej: 95 (opcional)" />
                  </div>
                  <div>
                    <label className="lbl">Tipo de Celda</label>
                    <select className="fi" value={eqAction.batCellType} onChange={e => setEqA({ ...eqAction, batCellType: e.target.value })}>
                      {BAT_CELL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {eqAction.batCount > 0 && Array.from({ length: parseInt(eqAction.batCount) || 0 }).map((_, i) => (
                    <div key={i}>
                      <label className="lbl">Serial Batería #{i + 1} (Opcional)</label>
                      <input className="fi fm" value={eqAction.batSerials?.[i] || ''}
                        onChange={e => {
                          const arr = [...(eqAction.batSerials || [])];
                          arr[i] = e.target.value;
                          setEqA({ ...eqAction, batSerials: arr });
                        }} placeholder={`SN bloque ${i + 1}`} />
                    </div>
                  ))}
                </>}
                {eqAction.type === 'GEN' && <>
                  <div>
                    <label className="lbl">Capacidad de la Planta (KVA)</label>
                    <input className="fi" type="number" step="any" value={eqAction.capacity || ''} onChange={e => setEqA({ ...eqAction, capacity: e.target.value })} placeholder="Ej: 150" />
                  </div>
                  <div>
                    <label className="lbl">Fases</label>
                    <select className="fi" value={eqAction.phases || ''} onChange={e => setEqA({ ...eqAction, phases: e.target.value })}>
                      <option value="">-- Selecciona --</option>
                      <option value="Monofásica">Monofásica</option>
                      <option value="Trifásica">Trifásica</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Horómetro Inicial (H)</label>
                    <input className="fi" type="text" value={eqAction.horometer || ''} onChange={e => setEqA({ ...eqAction, horometer: e.target.value })} placeholder="Ej: 1058:19:00 o 100" />
                  </div>
                  <div>
                    <label className="lbl">Horómetro Último Mantenimiento (H)</label>
                    <input className="fi" type="text" value={eqAction.lastMaintenanceHorometer || ''} onChange={e => setEqA({ ...eqAction, lastMaintenanceHorometer: e.target.value })} placeholder="Ej: 1058:19:00 o 0" />
                  </div>
                  <div>
                    <label className="lbl">Intervalo de Mantenimiento (H)</label>
                    <input className="fi" type="number" step="any" value={eqAction.maintenanceInterval !== undefined ? eqAction.maintenanceInterval : 250} onChange={e => setEqA({ ...eqAction, maintenanceInterval: e.target.value })} placeholder="Ej: 250" />
                  </div>
                </>}
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Serial del Equipo Principal (Opcional)</label>
                  <input className="fi fm" value={eqAction.serial || ''} onChange={e => setEqA({ ...eqAction, serial: e.target.value })} placeholder="SN del equipo" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Notas del Equipo (opcional)</label>
                  <input className="fi" value={eqAction.notes} onChange={e => setEqA({ ...eqAction, notes: e.target.value })} placeholder="Modelo, observaciones, notas adicionales..." />
                </div>
              </div>
            </div>
          )}

          {/* Reemplazo/Retiro */}
          {type === 'reemplazo' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Equipo a Reemplazar / Retirar</h3>
              <div>
                <label className="lbl">Seleccionar Equipo</label>
                <select className="fi" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })}>
                  <option value="">-- Selecciona el equipo a retirar --</option>
                  {active.map(eq => <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.type})</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <label className="lbl">Motivo del Retiro</label>
                <input className="fi" value={eqAction.notes} onChange={e => setEqA({ ...eqAction, notes: e.target.value })} placeholder="Falla, actualización, reubicación..." />
              </div>
            </div>
          )}

          {/* Correctivo */}
          {type === 'correctivo' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Detalle del Correctivo</h3>
              <div>
                <label className="lbl">Equipo afectado (opcional)</label>
                <select className="fi" value={eqAction.tag} onChange={e => setEqA({ ...eqAction, tag: e.target.value })}>
                  <option value="">-- General / sin equipo específico --</option>
                  {active.map(eq => <option key={eq.id} value={eq.tag}>{eq.tag}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div className="card" style={{ marginBottom: 20 }}>
            <label className="lbl">Observaciones</label>
            <textarea className="fi" rows={4} value={obs} onChange={e => setObs(e.target.value)} placeholder="Condiciones del nodo, anomalías detectadas, trabajos realizados..." style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
            <button className="bs" onClick={onCancel} disabled={saving} style={{ minWidth: 120 }}>Cancelar</button>
            <button className="bp" onClick={save} disabled={saving} style={{ minWidth: 180 }}>{saving ? 'Guardando...' : 'Guardar Registro'}</button>
          </div>
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // DETALLE DE REGISTRO
    // ═══════════════════════════════════════════════════
        // Vercel Best Practice: rerender-no-inline-components - Hoisted outside RecordDetail to prevent full remounts
    const InfoItem = ({ label, value, mono }) => (
      <div>
        <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>{label}</div>
        <div className={mono ? 'fm' : ''} style={{ fontSize: '.9rem', color: 'var(--tx1)', fontWeight: 500 }}>{value || '—'}</div>
      </div>
    );

        // Vercel Best Practice: rerender-no-inline-components - Hoisted outside renderMeasurements
    function MeasurementDisplayCard({ tag, highlight, vals = {}, equipment = [] }) {
      const type = getEqTypeFromTag(tag, equipment);
      const ti = EQ_TYPES[type] || EQ_TYPES.OTR;
      const ld = calcLoad(type, vals);
      const load = ld.ac + ld.dc;
      return (
        <div style={{ background: highlight ? 'rgba(33, 192, 250,.06)' : 'var(--bg-surface)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, border: `1px solid ${highlight ? 'rgba(33, 192, 250,.2)' : 'var(--border)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="badge" style={{ background: ti.bg, color: ti.color, fontSize: '.62rem' }}>{type}</span>
              <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{tag}</span>
              {(() => {
                const eq = (equipment || []).find(e => e.tag === tag);
                if (eq?.type === 'ETP' && eq.solarRegPercentage) {
                  return <span style={{ color: '#0166ff', fontSize: '.73rem', fontWeight: 600 }}>{eq.solarRegPercentage}%</span>;
                }
                return null;
              })()}
            </div>
            {load > 0 && <span className="fm" style={{ fontSize: '.8rem', color: '#008000', fontWeight: 700 }}>{load.toFixed(2)} kW</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 6 }}>
            {Object.entries(vals).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-deep)', borderRadius: 5, padding: '6px 8px' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>{getFieldLabel(k)} <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{getFieldUnit(k)}</span></div>
                <div className="fm" style={{ fontSize: '.95rem', color: '#008000', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    function RecordDetail({ record, onBack, nodeId, nodeName, equipment, userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const rt = REC_TYPES[record.type] || { label: record.type, icon: '', color: '#64748b' };
      const [editMeas, setEditMeas] = React.useState(false);
      const [measEdit, setMeasEdit] = React.useState(null); // snapshot editable
      const [editRecord, setEditRecord] = React.useState(false);
      const [recordForm, setRecordForm] = React.useState(null);
      const [saving, setSaving] = React.useState(false);

      const isAdmin = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) || 
        (userProfile?.email || '').toLowerCase().includes('robert') || 
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') || 
        (userProfile?.name || '').toLowerCase().includes('robert') || 
        (userProfile?.name || '').toLowerCase().includes('ruidiaz');

      const odooReportText = record.odooReport || (record.type === 'inspeccion' && record.measurements && Object.keys(record.measurements).length > 0
        ? generateReportText({
            nodeName: nodeName || 'Nodo',
            date: record.date?.toDate ? record.date.toDate() : new Date(record.date),
            shift: record.shift,
            technicianName: record.technicianName,
            measurements: record.measurements,
            observations: record.observations,
            equipment: equipment || []
          })
        : null);

      const openEdit = () => {
        // Deep clone measurements
        setMeasEdit(JSON.parse(JSON.stringify(record.measurements || {})));
        setEditMeas(true);
      };
      const saveEdit = async () => {
        if (!nodeId || !record.id) return;
        setSaving(true);
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).update({ measurements: measEdit });
          // Update local record object so view reflects changes
          Object.assign(record.measurements, measEdit);
          setEditMeas(false);
        } catch (e) { console.error(e); }
        setSaving(false);
      };

      const openEditRecord = () => {
        setRecordForm({
          tag: record.equipmentAction?.tag || '',
          serial: record.equipmentAction?.serial || '',
          notes: record.equipmentAction?.notes || record.observations || '',
          participants: record.participants || '',
          date: record.date?.toDate ? record.date.toDate().toISOString().slice(0, 16) : new Date(record.date).toISOString().slice(0, 16)
        });
        setEditRecord(true);
      };

      const saveRecordEdit = async () => {
        if (!nodeId || !record.id) return;
        setSaving(true);
        try {
          const upd = {
            participants: recordForm.participants,
            date: new Date(recordForm.date)
          };
          if (record.type === 'inspeccion' || record.type === 'actualizacion_carga') {
            upd.observations = recordForm.notes;
          } else if (record.equipmentAction) {
            upd.equipmentAction = { ...record.equipmentAction, tag: recordForm.tag, serial: recordForm.serial, notes: recordForm.notes };
          }
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).update(upd);
          Object.assign(record, upd);
          setEditRecord(false);
        } catch (e) { console.error(e); }
        setSaving(false);
      };
      const II = InfoItem;
      return (
        <div className="fin">
          {editMeas && (
            <div className="overlay" onClick={() => setEditMeas(false)}>
              <div className="card fin" style={{ maxWidth: 560, width: '100%', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 className="fd" style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem' }}>Editar Mediciones</h3>
                  <button onClick={() => setEditMeas(false)} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 20 }}>✕</button>
                </div>
                {Object.entries(measEdit).map(([tag, vals]) => (
                  <div key={tag} className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--amber)' }}>
                    <div className="fm" style={{ fontSize: '.85rem', color: 'var(--amber)', fontWeight: 700, marginBottom: 10 }}>{tag}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(vals).map(([k, v]) => (
                        <div key={k}>
                          <label style={{ display: 'block', fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                            {getFieldLabel(k)} <span style={{ color: 'var(--amber)' }}>{getFieldUnit(k)}</span>
                          </label>
                          <input className="mi" type="number" step="any" value={measEdit[tag][k] ?? ''}
                            onChange={e => setMeasEdit(prev => { const n = JSON.parse(JSON.stringify(prev)); n[tag][k] = e.target.value; return n; })} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button className="bp" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
                  <button className="bs" onClick={() => setEditMeas(false)} disabled={saving}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22 }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx1)' }}>{rt.icon} {rt.label}</h2>
                <p style={{ color: 'var(--tx3)', fontSize: '.8rem' }}>{fmtDateTime(record.date)}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {record.type === 'inspeccion' && record.measurements && Object.keys(record.measurements).length > 0 && (
                <button onClick={openEdit} className="bs" style={{ padding: '6px 14px', fontSize: '.78rem' }}>Valores</button>
              )}
              {isAdmin && (
                <button onClick={openEditRecord} className="bs" style={{ padding: '6px 14px', fontSize: '.78rem', color: 'var(--amber)', borderColor: 'rgba(1, 102, 255,.3)' }}>Registro</button>
              )}
              {isAdmin && (
                <button onClick={() => {
                  setConfirmModal({
                    title: '¿Realmente deseas eliminar este registro?',
                    msg: 'Esta acción eliminará permanentemente la inspección seleccionada.',
                    type: 'danger',
                    confirmText: 'Sí, estoy seguro',
                    onConfirm: async () => {
                      try {
                        // 1. Eliminar de energy_records en Firestore
                        await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(record.id).delete();

                        // 2. Si era un surtido o inspección con horómetro, revertir el horómetro del equipo
                        const plantTag = record.generatorTag || record.equipmentTag || record.equipmentAction?.tag || (equipment.find(e => e.type === 'GEN')?.tag || '');
                        let horoRestored = null;
                        // Se declara fuera del if porque más abajo se usa para revertir
                        // el horómetro en el flujo de combustible.
                        let prevHoro = 0;

                        if (plantTag) {
                          const recSnap = await db.collection('energy_nodes').doc(nodeId).collection('energy_records')
                            .orderBy('date', 'desc').get();

                          const otherRecords = recSnap.docs
                            .map(d => d.data())
                            .filter(r => (r.generatorTag === plantTag || r.equipmentTag === plantTag || r.equipmentAction?.tag === plantTag));

                          // El horómetro de una inspección de planta vive en measurements[tag].horometer,
                          // no en measurements.horometer. Sin ese acceso, se retrocedía al valor semilla.
                          for (const r of otherRecords) {
                            const rawHoro = r.fuelHorometer
                              || r.measurements?.[plantTag]?.horometer
                              || r.measurements?.horometer
                              || r.equipmentAction?.horometer;
                            const hVal = parseHours(rawHoro);
                            if (hVal > 0) {
                              prevHoro = hVal;
                              break;
                            }
                          }

                          // Si no hay lectura anterior no se toca el equipo: nunca se cae al valor semilla.
                          if (prevHoro > 0) {
                            const genEq = equipment.find(e => e.type === 'GEN' && e.tag === plantTag);
                            if (genEq) {
                              await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(genEq.id).update({
                                horometer: prevHoro
                              });
                              horoRestored = formatCleanHoro(prevHoro);
                            }
                          }
                        }

                        // 3. Si era un surtido o calibración, sincronizar también con Combustible (refills y tanques) y Firestore
                        if (record.type === 'surtido' || record.type === 'ajuste_combustible') {
                          try {
                            const curRefills = JSON.parse(localStorage.getItem('airtek_fuel_refills_v12') || '[]');
                            const updatedRefills = curRefills.filter(r => {
                              if (r.id === 'r_rec_' + record.id || r.id === 'db_' + record.id) return false;
                              const matchFecha = r.fecha === new Date(record.date?.toDate ? record.date.toDate() : record.date).toLocaleDateString('es-VE');
                              const nfd = normalizeNodeName;
                              const matchLugar = nfd(r.lugar) === nfd(nodeName) && (!record.generatorTag || !r.tag || r.tag === record.generatorTag);
                              const matchLitros = parseFloat(r.litros) === parseFloat(record.fuelLiters);
                              if (matchFecha && matchLugar && matchLitros) return false;
                              return true;
                            });
                            localStorage.setItem('airtek_fuel_refills_v12', JSON.stringify(updatedRefills));

                            // Revertir litros en tanques según la Tabla de la Verdad
                            const curTanks = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                            let updatedTanks = curTanks;
                            if (record.type === 'surtido') {
                              updatedTanks = revertFuelTanks(curTanks, {
                                lugar: nodeName,
                                tag: record.generatorTag,
                                destino: record.fuelDestination,
                                litros: record.fuelLiters,
                                litrosPlanta: record.fuelLitersPlanta,
                                litrosReserva: record.fuelLitersReserva,
                                prevSub: record.fuelPrevSub,
                                prevRes: record.fuelPrevRes,
                                resSub: record.fuelSubtankLevel != null ? record.fuelSubtankLevel : record.fuelSubLevel,
                                resRes: record.fuelReserveLevel,
                                prevHoro: (typeof prevHoro !== 'undefined' && prevHoro > 0) ? formatCleanHoro(prevHoro) : null
                              });
                            } else if (record.type === 'ajuste_combustible') {
                              const nfd = normalizeNodeName;
                              const targetNorm = nfd(nodeName);
                              updatedTanks = curTanks.map(t => {
                                const exact = nfd(t.lugar) === targetNorm;
                                const isPlt = record.generatorTag ? t.tag === record.generatorTag : exact;
                                if (!exact && !isPlt) return t;
                                const curS = parseFloat(t.subtanque_actual != null ? t.subtanque_actual : t.tanque_lts) || 0;
                                const curR = parseFloat(t.reserva_lts) || 0;
                                const restoredSub = isPlt && record.diffSub != null ? Math.max(0, curS - (parseFloat(record.diffSub) || 0)) : curS;
                                const restoredRes = exact && record.diffReserve != null ? Math.max(0, curR - (parseFloat(record.diffReserve) || 0)) : curR;
                                const cons = t.consumo_lh > 0 ? t.consumo_lh : 1;
                                const aut = Number(((restoredSub + restoredRes) / cons).toFixed(1));
                                return {
                                  ...t,
                                  subtanque_actual: restoredSub,
                                  reserva_lts: restoredRes,
                                  aut_total_h: aut,
                                  dias_aut: Number((aut / 24).toFixed(2))
                                };
                              });
                            }
                            localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(updatedTanks));

                            // Sincronizar niveles revertidos en Firestore para que vuelva permanentemente a su estado original
                            const nfd = normalizeNodeName;
                            const targetNorm = nfd(nodeName);
                            const revTank = updatedTanks.find(t => (record.generatorTag && t.tag === record.generatorTag) || nfd(t.lugar) === targetNorm);
                            if (revTank) {
                              await persistNodeFuelUpdate({
                                db,
                                nodeId,
                                nodeName,
                                plantTag: record.generatorTag,
                                resultingSub: revTank.subtanque_actual,
                                resultingRes: revTank.reserva_lts,
                                resultingTotal: (parseFloat(revTank.subtanque_actual) || 0) + (parseFloat(revTank.reserva_lts) || 0),
                                addedTotalDespacho: 0,
                                fuelDest: 'Reversión / Eliminación de Registro',
                                fuelHoro: revTank.horometro_actual || '',
                                userProfile
                              });
                            }
                          } catch(e) {
                            console.warn('Error al revertir combustible en DB:', e);
                          }
                        }

                        setConfirmModal({
                          title: 'Registro eliminado con éxito',
                          msg:
                            record.type === 'surtido' || record.type === 'ajuste_combustible'
                              ? 'El registro fue eliminado y los niveles de combustible fueron restaurados.'
                              : horoRestored
                                ? `El registro fue eliminado. Horómetro restaurado a ${horoRestored}.`
                                : 'El registro fue eliminado. No había una lectura anterior de horómetro, así que el equipo quedó como estaba.',
                          type: 'success',
                          confirmText: 'Aceptar',
                          cancelText: false,
                          onConfirm: () => onBack()
                        });
                      } catch (e) { toast('Error: ' + e.message, 'error'); }
                    }
                  });
                }} className="bd" style={{ padding: '6px 10px', color: '#f55b5d', borderColor: 'rgba(245, 91, 93,.3)' }}>Eliminar</button>
              )}
            </div>
          </div>

          {editRecord && (
            <div className="overlay" onClick={() => setEditRecord(false)}>
              <div className="card fin" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
                <h3 className="fd" style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem', marginBottom: 16 }}>Editar Registro</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div>
                    <label className="lbl">Fecha y Hora</label>
                    <input className="fi" type="datetime-local" value={recordForm.date} onChange={e => setRecordForm({ ...recordForm, date: e.target.value })} />
                  </div>
                  {record.type !== 'inspeccion' && record.equipmentAction && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="lbl">Tag del Equipo</label>
                        <input className="fi fm" value={recordForm.tag} onChange={e => setRecordForm({ ...recordForm, tag: e.target.value })} />
                      </div>
                      <div>
                        <label className="lbl">Serial</label>
                        <input className="fi fm" value={recordForm.serial} onChange={e => setRecordForm({ ...recordForm, serial: e.target.value })} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="lbl">{record.type === 'inspeccion' ? 'Observaciones' : 'Notas / Motivo'}</label>
                    <textarea className="fi" rows={3} value={recordForm.notes} onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })} />
                  </div>
                  <div>
                    <label className="lbl">Personal Involucrado</label>
                    <input className="fi" value={recordForm.participants} onChange={e => setRecordForm({ ...recordForm, participants: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button className="bp" style={{ flex: 1 }} onClick={saveRecordEdit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
                  <button className="bs" onClick={() => setEditRecord(false)} disabled={saving}>Cancelar</button>
                </div>
              </div>
            </div>
          )}
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <II label="Registrado por" value={record.technicianName} />
              <II label="Turno" value={record.shift === 'dia' ? 'Día' : 'Noche'} />
              <II label="Fecha" value={fmtDate(record.date)} />
              <II label="Hora" value={record.date?.toDate ? record.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—'} />
              {record.participants && <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Personal Involucrado</div>
                <div style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 500 }}>{record.participants}</div>
              </div>}
            </div>
            {record.observations && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Observaciones</div>
              <p style={{ color: 'var(--tx2)', fontSize: '.9rem', fontWeight: 500 }}>{record.observations}</p>
            </div>}
          </div>
          {record.measurements && Object.keys(record.measurements).length > 0 && (() => {
            // Reconstruir lista de equipos medidos para agrupar por banco
            const meas = record.measurements;
            const measTags = Object.keys(meas);
            // Crear objetos de equipo ficticios desde los tags medidos
            const fakeEqs = sortEquipment(measTags.map(tag => {
              const type = getEqTypeFromTag(tag, equipment);
              return { id: tag, tag, type, active: true };
            }));
            const groups = groupByBank(fakeEqs);
            // Calcular carga total del nodo
            const totalLoad = measTags.reduce((sum, tag) => {
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, meas[tag]);
              return sum + ld.ac + ld.dc;
            }, 0);

            const MeasCard = ({ tag, highlight }) => <MeasurementDisplayCard tag={tag} highlight={highlight} vals={meas[tag] || {}} equipment={equipment} />;

            return (
              <div>
                {/* Carga total del nodo */}
                {totalLoad > 0 && <div style={{ background: 'rgba(0, 128, 0,.08)', border: '1px solid rgba(0, 128, 0,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Carga Total del Nodo</span>
                  <span className="fm" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#008000' }}>{totalLoad.toFixed(2)} <span style={{ fontSize: '.8rem' }}>kW</span></span>
                </div>}
                <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Mediciones Registradas</h3>
                {groups.map(({ bank, eqs, bat, orphanBats }) => {
                  const bankLoad = eqs.reduce((s, e) => s + calcLoad(e.type, meas[e.tag]), 0);
                  return (
                    <div key={bank || '_ung'} style={{ marginBottom: 16 }}>
                      {bank && bank !== '_ats' && bank !== '_orphan' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Banco {bank}</span>
                        {bankLoad > 0 && <span className="fm" style={{ fontSize: '.8rem', color: '#0166ff', fontWeight: 700 }}>Σ {bankLoad.toFixed(2)} kW</span>}
                      </div>}
                      {eqs.map(e => <MeasCard key={e.tag} tag={e.tag} highlight={false} />)}
                      {bat && meas[bat.tag] && <MeasCard key={bat.tag} tag={bat.tag} highlight={true} />}
                      {orphanBats && orphanBats.map(e => <MeasCard key={e.tag} tag={e.tag} highlight={true} />)}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {record.type === 'surtido' && (
            <div className="card" style={{ border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><line x1="3" y1="22" x2="15" y2="22"/></svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>Detalle de Surtido de Combustible</h3>
                  <p style={{ fontSize: '.75rem', color: 'var(--tx3)', margin: 0 }}>Despacho y control de niveles en el grupo electrógeno</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Planta / Generador</div>
                  <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--blue)', marginTop: 2 }}>{record.generatorTag || 'Planta Principal'}</div>
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Litros Suministrados</div>
                  <div className="fm" style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--primary)', marginTop: 2 }}>
                    +{record.fuelLiters || 0} Lts
                  </div>
                  {record.fuelDestination === 'Surtido Planta y Reserva' && (
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Planta: {record.fuelLitersPlanta || 0}L | Reserva: {record.fuelLitersReserva || 0}L
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Destino del Combustible</div>
                  <div style={{ marginTop: 4 }}>
                    {(() => {
                      const d = record.fuelDestination || 'Surtido Reserva';
                      let bg = 'rgba(1, 102, 255, 0.12)';
                      let color = 'var(--blue)';
                      if (d.includes('Planta y Reserva') || d === 'Ambos') { bg = 'rgba(139, 92, 246, 0.15)'; color = '#8b5cf6'; }
                      else if (d.includes('Planta') || d === 'Sub-tanque') { bg = 'rgba(33, 192, 250, 0.12)'; color = '#21c0fa'; }
                      return (
                        <span className="badge" style={{ background: bg, color, fontWeight: 700 }}>
                          {d}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {record.fuelHorometer && (
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Horómetro al Surtir</div>
                    <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--tx1)', marginTop: 2 }}>{record.fuelHorometer}</div>
                  </div>
                )}

                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Litros Totales en el Nodo</div>
                  <div className="fm" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--green)', marginTop: 2 }}>
                    {record.fuelTotalLevel || 0} Lts
                  </div>
                  {(record.fuelSubtankLevel !== undefined || record.fuelReserveLevel !== undefined) && (
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Sub: {record.fuelSubtankLevel || 0}L | Res: {record.fuelReserveLevel || 0}L
                    </div>
                  )}
                </div>
              </div>

              {record.observations && (
                <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700, marginBottom: 4 }}>Observaciones del Despacho</div>
                  <div style={{ fontSize: '.84rem', color: 'var(--tx2)', lineHeight: 1.5 }}>{record.observations}</div>
                </div>
              )}
            </div>
          )}

          {record.type !== 'surtido' && record.equipmentAction && (record.equipmentAction.tag || record.equipmentAction.type) && (
            <div className="card">
              <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Acción de Equipo</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {record.equipmentAction.tag && <II label="Tag" value={record.equipmentAction.tag} mono />}
                {record.equipmentAction.serial && <II label="Serial" value={record.equipmentAction.serial} mono />}
                {record.equipmentAction.type && <II label="Tipo" value={record.equipmentAction.type} />}
                {record.equipmentAction.voltage && <II label="Tensión" value={record.equipmentAction.voltage} />}
                {record.equipmentAction.batteryType && record.equipmentAction.batteryType !== 'No aplica' && <II label="Batería" value={record.equipmentAction.batteryType} />}
                {record.equipmentAction.notes && <II label="Notas" value={record.equipmentAction.notes} />}
              </div>
            </div>
          )}
          {record.type === 'surtido' && (() => {
            const fuelText = generateFuelReportText({
              nodeName: nodeName || 'Nodo',
              date: record.date,
              record,
              equipment: equipment || []
            });
            return (
              <div className="card" style={{ marginTop: 14, border: '1px solid rgba(1, 102, 255, 0.25)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>
                      Mensaje de Surtido (Formato para Copiar y Pegar)
                    </h3>
                    <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>WhatsApp / Reportes</span>
                  </div>
                  <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => {
                    navigator.clipboard.writeText(fuelText).then(() => {
                      if (toast) toast('¡Mensaje de surtido copiado al portapapeles!', 'success');
                    });
                  }}>
                    <IconCopy size={15} /> Copiar Mensaje
                  </button>
                </div>
                <textarea className="fi fm" readOnly value={fuelText} style={{ width: '100%', height: 190, fontSize: '0.82rem', lineHeight: 1.6, resize: 'vertical', background: 'var(--bg-deep)', color: 'var(--tx1)', borderRadius: 8, padding: '12px 14px' }} />
              </div>
            );
          })()}

          {odooReportText && (
            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Reporte de Inspección (Odoo)</h3>
                <button className="bp" style={{ padding: '4px 10px', fontSize: '.72rem' }} onClick={() => {
                  navigator.clipboard.writeText(odooReportText).then(() => {
                    if (toast) toast('Copiado al portapapeles', 'success');
                  });
                }}>
                  <IconCopy size={16} /> Copiar Reporte
                </button>
              </div>
              <textarea className="fi" readOnly value={odooReportText} style={{ height: '220px', fontFamily: 'monospace', fontSize: '0.82rem', resize: 'vertical' }} />
            </div>
          )}
          {confirmModal && (
            <ConfirmModal
              title={confirmModal.title}
              msg={confirmModal.msg}
              type={confirmModal.type}
              confirmText={confirmModal.confirmText}
              cancelText={confirmModal.cancelText}
              onConfirm={async () => {
                const fn = confirmModal.onConfirm;
                setConfirmModal(null);
                if (fn) await fn();
              }}
              onCancel={() => {
                const fn = confirmModal.onCancel;
                setConfirmModal(null);
                if (fn) fn();
              }}
            />
          )}
        </div>
      );
    }



    // ═══════════════════════════════════════════════════
    // GRÁFICO HISTÓRICO DE CARGAS POR BANCO
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    //  MODAL EDICIÓN DE EQUIPO
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    // DOCUMENTOS DEL NODO — Diagramas y manuales (solo usuarios registrados)
    // ═══════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════
    //  COMPONENTES DE PLANTA ELÉCTRICA
    // ═══════════════════════════════════════════════════
    function PlantRecordForm({ nodeId, nodeName, nodeType, plantEq, userProfile, onSave, onCancel, toast }) {
      const authorizedStaff = useAuthorizedStaff(userProfile);
      const isTri = plantEq && plantEq.phases && plantEq.phases.toLowerCase().includes('tri');
      const DRAFT_KEY = `airtek_draft_plant_${nodeId}_${plantEq.tag}`;

      const getDraft = () => {
        try {
          const saved = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          return saved ? JSON.parse(saved) : null;
        } catch (e) { return null; }
      };

      const initialDraft = getDraft();
      const effectiveNodeType = (nodeType || initialDraft?.nodeType || '').toLowerCase();
      const isNodeOrDc = (() => {
        const t = effectiveNodeType;
        const n = String(nodeName || '').trim().toLowerCase();
        if (t === 'datacenter' || t === 'fibra' || t === 'nodo' || t === 'node') return true;
        if (t === 'headend' || t === 'otro' || t === 'sede' || t === 'oficina') {
          if (n.startsWith('datacenter') || n.startsWith('data center') || n.startsWith('nodo')) return true;
          return false;
        }
        if (n.startsWith('datacenter') || n.startsWith('data center') || n.startsWith('nodo') || /\b(nodo|datacenter|data center)\b/i.test(n)) {
          return true;
        }
        return false;
      })();

      const [f, setF] = useState(() => {
        const defaults = {
          horometer: plantEq ? formatHHMMSS(parseFloat(plantEq.horometer)) : '',
          mantenimientoRealizado: false,
          autonomia: '',
          
          voltajeRed: '', voltajeL1L2: '', voltajeL2L3: '', voltajeL1L3: '',
          voltajeL1N: '', voltajeL2N: '', voltajeLN: '',
          ampF1: '', ampF2: '', ampF3: '', ampN: '',

          presionAceite: '', obsPresionAceite: '',
          fluidosStatus: 'OK', obsFluidos: '',
          manguerasStatus: 'OK', obsMangueras: '',
          correaStatus: 'OK', obsCorrea: '',

          atsStatus: 'OK', obsATS: '',
          batVCG: '', batVAT: '', batCTS: '', obsBat: '',
          cableadoStatus: 'OK', obsCableado: '',
          puntosCalStatus: 'SI', obsPuntosCal: '',
          sonoffStatus: 'SI', obsSonoff: '',

          encendidoStatus: 'SI', obsEncendido: '',
          ruidosStatus: 'SI', obsRuidos: '',
          surtidoStatus: 'SI', obsSurtido: '',
          reservaMin: '', reservaAutonomia: '', obsReserva: '',

          resultado: 'Aprobado – Opera dentro de parámetros.',
          obsGenerales: '',
          firmaTecnico: userProfile?.name || ''
        };
        return initialDraft ? { ...defaults, ...initialDraft } : defaults;
      });

      const [saving, setSaving] = useState(false);
      const [odooText, setOdooText] = useState('');
      const [lastSavedTime, setLastSavedTime] = useState(() => initialDraft?.savedAt ? new Date(initialDraft.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null);

      // Guardar borrador en localStorage automáticamente
      const saveDraftToStorage = useCallback(() => {
        try {
          const now = new Date();
          const draft = {
            ...f,
            nodeId, nodeName, nodeType: effectiveNodeType, plantTag: plantEq.tag, formType: 'plant',
            savedAt: now.toISOString()
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
          localStorage.setItem('airtek_active_inspection', JSON.stringify({
            nodeId, nodeName, nodeType: effectiveNodeType, plantTag: plantEq.tag, formType: 'plant', key: DRAFT_KEY, savedAt: now.toISOString()
          }));
          setLastSavedTime(now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        } catch (e) {
          // silenciado
        }
      }, [f, DRAFT_KEY, nodeId, nodeName, effectiveNodeType, plantEq.tag]);

      useEffect(() => {
        saveDraftToStorage();
      }, [saveDraftToStorage]);

      // Guardar ante salida de pantalla o cambio de app
      useEffect(() => {
        const handleVisibility = () => {
          if (document.visibilityState === 'hidden') saveDraftToStorage();
        };
        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', saveDraftToStorage);
        window.addEventListener('beforeunload', saveDraftToStorage);
        return () => {
          window.removeEventListener('visibilitychange', handleVisibility);
          window.removeEventListener('pagehide', saveDraftToStorage);
          window.removeEventListener('beforeunload', saveDraftToStorage);
        };
      }, [saveDraftToStorage]);

      const clearDraft = () => {
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          const active = localStorage.getItem('airtek_active_inspection');
          if (active && JSON.parse(active)?.key === DRAFT_KEY) {
            localStorage.removeItem('airtek_active_inspection');
          }
        } catch (e) {}
        toast('Borrador de planta eliminado', 'info');
        onCancel();
      };

      const generarTextoOdoo = () => {
        const dateStr = new Date().toLocaleDateString('es-VE');
        const marcaMod = ((plantEq.brand || '') + ' ' + (plantEq.model || '')).trim();

        let voltajesText = isTri 
          ? `L1-L2: ${f.voltajeL1L2} V / L2-L3: ${f.voltajeL2L3} V / L1-L3: ${f.voltajeL1L3} V / L-N: ${f.voltajeLN} V`
          : `L1-L2: ${f.voltajeL1L2} V / L1-N: ${f.voltajeL1N} V / L2-N: ${f.voltajeL2N} V`;
          
        let amperajesText = isTri
          ? `Fase 1: ${f.ampF1} fase 2: ${f.ampF2}   Fase 3: ${f.ampF3} N: ${f.ampN}`
          : `Fase 1: ${f.ampF1} fase 2: ${f.ampF2}   N: ${f.ampN}`;

        const amperajeLabel = isNodeOrDc ? 'Amperaje del nodo' : 'Amperaje';

        return `CHEQUEO PREVENTIVO
Fecha: ${dateStr}
Técnico responsable: ${f.firmaTecnico}
1. DATOS DEL EQUIPO
Serial de la planta eléctrica:	${plantEq.serial || '—'}
Marca / Modelo:	${marcaMod || '—'}
Horas de servicio (lectura actual):	${f.horometer}
Autonomía del combustible:	${f.autonomia || '—'}
2. PARÁMETROS ELÉCTRICOS


Voltaje de la red (entrada ATS)	${f.voltajeRed} V
Voltajes de generación	${voltajesText} 
${amperajeLabel}	${amperajesText}
3. COMPONENTES MECÁNICOS Y FLUIDOS


Valor de presión de aceite (psi o bar)	${f.presionAceite}	${f.obsPresionAceite}
Fluidos (nivel y fugas)	[${f.fluidosStatus}]	${f.obsFluidos}
Mangueras (fisuras, abrasión)	[${f.manguerasStatus}]	${f.obsMangueras}
Correa única (tensión y desgaste)	[${f.correaStatus}]	${f.obsCorrea}
4. SISTEMA ELÉCTRICO Y CONTROL


ATS (Transferencia automática)	[${f.atsStatus}]	${f.obsATS}
Batería (voltaje y bornes)	V-CG ${f.batVCG} V-AT ${f.batVAT} C-TS ${f.batCTS}	${f.obsBat}
Cableado (conexiones sueltas, corrosión)	[${f.cableadoStatus}]	${f.obsCableado}
Puntos calientes(termografía/contacto)	[${f.puntosCalStatus}]	${f.obsPuntosCal}
Indicación de Sonoff (o relé remoto)	[${f.sonoffStatus}]	${f.obsSonoff}
5. PRUEBAS OPERATIVAS
Prueba de encendido remoto (local o remoto)	[${f.encendidoStatus}]	${f.obsEncendido}
Ruidos anormales(motor/alternador)	[${f.ruidosStatus}]	${f.obsRuidos}
Surtido a la planta (suministro de combustible)	[${f.surtidoStatus}]	${f.obsSurtido}
Reserva de combustible.	${f.reservaMin} Autonomía: ${f.reservaAutonomia}	${f.obsReserva}
6. RESULTADO FINAL
[X] ${f.resultado}
Mantenimiento de ${plantEq.maintenanceInterval || 250} horas realizado: ${f.mantenimientoRealizado ? 'SÍ' : 'NO'}
Observaciones generales:
${f.obsGenerales}`;
      };

      const copyToClipboard = () => {
        navigator.clipboard.writeText(odooText).then(() => {
          toast('Copiado al portapapeles', 'success');
        });
      };

      const save = async () => {
        const validationErrors = validateInspection(f);
        if (validationErrors.length > 0) {
          toast(validationErrors[0], 'error');
          return;
        }
        setSaving(true);
        try {
          const text = generarTextoOdoo();
          const recId = db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc().id;
          
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').doc(recId).set({
            date: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'inspeccion_gen',
            shift: new Date().getHours() < 18 && new Date().getHours() >= 6 ? 'dia' : 'noche',
            technicianName: userProfile.name,
            technicianId: userProfile.uid,
            equipmentTag: plantEq.tag,
            odooReport: text,
            measurements: {
              [plantEq.tag]: {
                horometer: parseHours(f.horometer),
                mantenimientoRealizado: f.mantenimientoRealizado,
                autonomia: f.autonomia,
                voltajeRed: f.voltajeRed,
                voltajeL1L2: f.voltajeL1L2,
                voltajeL2L3: f.voltajeL2L3,
                voltajeL1L3: f.voltajeL1L3,
                voltajeL1N: f.voltajeL1N,
                voltajeL2N: f.voltajeL2N,
                voltajeLN: f.voltajeLN,
                ampF1: f.ampF1,
                ampF2: f.ampF2,
                ampF3: f.ampF3,
                ampN: f.ampN,
                presionAceite: f.presionAceite,
                obsPresionAceite: f.obsPresionAceite,
                fluidosStatus: f.fluidosStatus,
                obsFluidos: f.obsFluidos,
                manguerasStatus: f.manguerasStatus,
                obsMangueras: f.obsMangueras,
                correaStatus: f.correaStatus,
                obsCorrea: f.obsCorrea,
                atsStatus: f.atsStatus,
                obsATS: f.obsATS,
                batVCG: f.batVCG,
                batVAT: f.batVAT,
                batCTS: f.batCTS,
                obsBat: f.obsBat,
                cableadoStatus: f.cableadoStatus,
                obsCableado: f.obsCableado,
                puntosCalStatus: f.puntosCalStatus,
                obsPuntosCal: f.obsPuntosCal,
                sonoffStatus: f.sonoffStatus,
                obsSonoff: f.obsSonoff,
                encendidoStatus: f.encendidoStatus,
                obsEncendido: f.obsEncendido,
                ruidosStatus: f.ruidosStatus,
                obsRuidos: f.obsRuidos,
                surtidoStatus: f.surtidoStatus,
                obsSurtido: f.obsSurtido,
                reservaMin: f.reservaMin,
                reservaAutonomia: f.reservaAutonomia,
                obsReserva: f.obsReserva,
                resultado: f.resultado,
                obsGenerales: f.obsGenerales,
                firmaTecnico: f.firmaTecnico
              }
            }
          });

          const equipUpdate = {
            horometer: parseHours(f.horometer)
          };
          if (f.mantenimientoRealizado) {
            equipUpdate.lastMaintenanceHorometer = parseHours(f.horometer) || 0;
          }
          await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(plantEq.id).update(equipUpdate);

          toast('Chequeo de Grupo Electrógeno guardado', 'success');
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(`energy_draft_${nodeId}_plant_${plantEq.tag}`);
          try {
            const activeDraft = localStorage.getItem('airtek_active_inspection');
            if (activeDraft && JSON.parse(activeDraft)?.key === DRAFT_KEY) {
              localStorage.removeItem('airtek_active_inspection');
            }
          } catch (e) {}
          setOdooText(text);
        } catch (e) {
          toast('Error al guardar: ' + e.message, 'error');
        }
        setSaving(false);
      };

      const renderStatusSelect = (field, obsField, options = ['OK', 'Fallo', 'N/A']) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="fi" value={f[field]} onChange={e => setF({...f, [field]: e.target.value})} style={{ width: '110px' }}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <input className="fi" placeholder="Observaciones..." value={f[obsField]} onChange={e => setF({...f, [obsField]: e.target.value})} />
        </div>
      );

      if (odooText) {
        return (
          <div className="card fin">
            <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: 16, color: '#008000' }}>Inspección Guardada Exitosamente</h2>
            <p style={{ marginBottom: 12, color: 'var(--tx2)' }}>Copia el siguiente texto para pegarlo en la orden de trabajo de Odoo:</p>
            <textarea className="fi" readOnly value={odooText} style={{ height: '300px', fontFamily: 'monospace', fontSize: '0.85rem', marginBottom: 16, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" onClick={copyToClipboard} style={{ flex: 1 }}><IconCopy size={16} /> Copiar al Portapapeles</button>
              <button className="bs" onClick={onSave}>Cerrar</button>
            </div>
          </div>
        );
      }

      return (
        <div className="card fin">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center' }}>←</button>
              <h2 className="fd" style={{ fontSize: '1.1rem', fontWeight: 800 }}>Chequeo: {plantEq.tag}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastSavedTime && (
                <span style={{ fontSize: '.72rem', color: '#10b981', background: 'rgba(16,185,129,.12)', padding: '4px 8px', borderRadius: 4 }}>
                  Guardado local {lastSavedTime}
                </span>
              )}
              <button className="bd" style={{ padding: '5px 10px', fontSize: '.72rem' }} onClick={clearDraft} title="Limpiar los campos del borrador">
                Limpiar
              </button>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
            
            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#eab308', marginBottom: 12 }}>1. DATOS DEL EQUIPO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="lbl">Serial de la planta eléctrica</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{plantEq.serial || '—'}</div></div>
                <div><label className="lbl">Marca / Modelo</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{((plantEq.brand || '') + ' ' + (plantEq.model || '')).trim() || '—'}</div></div>
                <div><label className="lbl">Fases</label><div className="fi" style={{ background: 'var(--bg-deep)', color: 'var(--tx3)' }}>{plantEq.phases || '—'}</div></div>
                <div><label className="lbl">Horas de servicio (lectura actual)</label><input className="fi" value={f.horometer} onChange={e => setF({...f, horometer: e.target.value})} placeholder="Ej: 1058:19:00 o 300" /></div>
                <div><label className="lbl">Autonomía del combustible</label><input className="fi" value={f.autonomia} onChange={e => setF({...f, autonomia: e.target.value})} placeholder="Ej: 48 horas" /></div>
                {(() => {
                  const interval = parseFloat(plantEq.maintenanceInterval) || 250;
                  const lastMaint = parseFloat(plantEq.lastMaintenanceHorometer) || 0;
                  const currentH = parseHours(f.horometer) || 0;
                  const elapsed = Math.max(0, currentH - lastMaint);
                  const remaining = interval - elapsed;
                  const percentage = Math.min(100, Math.max(0, (elapsed / interval) * 100));
                  
                  let barColor = 'var(--green)';
                  if (remaining <= 0) barColor = 'var(--red)';
                  else if (remaining <= 20) barColor = 'var(--amber)';

                  return (
                    <div style={{ gridColumn: '1/-1', background: 'var(--bg-surface)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '.78rem', color: 'var(--tx2)', fontWeight: 600, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>CONTROL DE MANTENIMIENTO ({interval}H)</span>
                        <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Último: {formatHHMMSS(lastMaint)}</span>
                      </div>
                      
                      {/* Visual progress bar */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 4 }}>
                          <span>0% transcurrido</span>
                          <span style={{ fontWeight: 600, color: barColor }}>
                            {formatHHMMSS(elapsed)} transcurridas ({percentage.toFixed(0)}%)
                          </span>
                          <span>Límite ({formatHHMMSS(lastMaint + interval)})</span>
                        </div>
                        <div style={{ width: '100%', height: 8, background: 'var(--bg-deep)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s ease, background-color 0.3s ease' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <span style={{ 
                          fontSize: '.88rem', 
                          fontWeight: 700, 
                          color: remaining <= 0 ? 'var(--red)' : remaining <= 20 ? 'var(--amber)' : 'var(--green)' 
                        }}>
                          {remaining <= 0 
                            ? `VENCIDO (Excedido por ${Math.abs(remaining)} H)` 
                            : remaining <= 20 
                              ? `PRÓXIMO (Quedan ${remaining} H)` 
                              : `OK (Quedan ${remaining} H)`}
                        </span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tx2)', fontSize: '.84rem', cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={f.mantenimientoRealizado} onChange={e => setF({ ...f, mantenimientoRealizado: e.target.checked })} style={{ width: 16, height: 16 }} />
                          ¿Registrar Mantenimiento de {interval}H Realizado? (Reinicia el contador a {currentH || '0'} H)
                        </label>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#0166ff', marginBottom: 12 }}>2. PARÁMETROS ELÉCTRICOS</div>
              <div style={{ marginBottom: 10 }}>
                <label className="lbl">Voltaje de la red (entrada ATS) [V]</label>
                <input className="fi" value={f.voltajeRed} onChange={e => setF({...f, voltajeRed: e.target.value})} placeholder="Ej: 220" />
              </div>
              <label className="lbl">Voltajes de generación [V]</label>
              {isTri ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><input className="fi" placeholder="L1-L2" value={f.voltajeL1L2} onChange={e => setF({...f, voltajeL1L2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L2-L3" value={f.voltajeL2L3} onChange={e => setF({...f, voltajeL2L3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L1-L3" value={f.voltajeL1L3} onChange={e => setF({...f, voltajeL1L3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L-N Promedio" value={f.voltajeLN} onChange={e => setF({...f, voltajeLN: e.target.value})} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div><input className="fi" placeholder="L1-L2" value={f.voltajeL1L2} onChange={e => setF({...f, voltajeL1L2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L1-N" value={f.voltajeL1N} onChange={e => setF({...f, voltajeL1N: e.target.value})} /></div>
                  <div><input className="fi" placeholder="L2-N" value={f.voltajeL2N} onChange={e => setF({...f, voltajeL2N: e.target.value})} /></div>
                </div>
              )}
              <label className="lbl">{isNodeOrDc ? 'Amperaje del nodo [A]' : 'Amperaje [A]'}</label>
              {isTri ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                  <div><input className="fi" placeholder="Fase 1" value={f.ampF1} onChange={e => setF({...f, ampF1: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 2" value={f.ampF2} onChange={e => setF({...f, ampF2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 3" value={f.ampF3} onChange={e => setF({...f, ampF3: e.target.value})} /></div>
                  <div><input className="fi" placeholder="N" value={f.ampN} onChange={e => setF({...f, ampN: e.target.value})} /></div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><input className="fi" placeholder="Fase 1" value={f.ampF1} onChange={e => setF({...f, ampF1: e.target.value})} /></div>
                  <div><input className="fi" placeholder="Fase 2" value={f.ampF2} onChange={e => setF({...f, ampF2: e.target.value})} /></div>
                  <div><input className="fi" placeholder="N" value={f.ampN} onChange={e => setF({...f, ampN: e.target.value})} /></div>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#008000', marginBottom: 12 }}>3. COMPONENTES MECÁNICOS Y FLUIDOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label className="lbl">Valor de presión de aceite (psi o bar)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" style={{ width: '110px' }} value={f.presionAceite} onChange={e => setF({...f, presionAceite: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsPresionAceite} onChange={e => setF({...f, obsPresionAceite: e.target.value})} />
                  </div>
                </div>
                <div><label className="lbl">Fluidos (nivel y fugas)</label>{renderStatusSelect('fluidosStatus', 'obsFluidos')}</div>
                <div><label className="lbl">Mangueras (fisuras, abrasión)</label>{renderStatusSelect('manguerasStatus', 'obsMangueras')}</div>
                <div><label className="lbl">Correa única (tensión y desgaste)</label>{renderStatusSelect('correaStatus', 'obsCorrea')}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#21c0fa', marginBottom: 12 }}>4. SISTEMA ELÉCTRICO Y CONTROL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div><label className="lbl">ATS (Transferencia automática)</label>{renderStatusSelect('atsStatus', 'obsATS')}</div>
                <div>
                  <label className="lbl">Batería (voltaje y bornes)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" placeholder="V-CG" style={{ width: '80px' }} value={f.batVCG} onChange={e => setF({...f, batVCG: e.target.value})} />
                    <input className="fi" placeholder="V-AT" style={{ width: '80px' }} value={f.batVAT} onChange={e => setF({...f, batVAT: e.target.value})} />
                    <input className="fi" placeholder="C-TS" style={{ width: '80px' }} value={f.batCTS} onChange={e => setF({...f, batCTS: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsBat} onChange={e => setF({...f, obsBat: e.target.value})} />
                  </div>
                </div>
                <div><label className="lbl">Cableado (conexiones sueltas, corrosión)</label>{renderStatusSelect('cableadoStatus', 'obsCableado')}</div>
                <div><label className="lbl">Puntos calientes (termografía/contacto)</label>{renderStatusSelect('puntosCalStatus', 'obsPuntosCal', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Indicación de Sonoff (o relé remoto)</label>{renderStatusSelect('sonoffStatus', 'obsSonoff', ['SI', 'NO', 'N/A'])}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#f55b5d', marginBottom: 12 }}>5. PRUEBAS OPERATIVAS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div><label className="lbl">Prueba de encendido remoto (local o remoto)</label>{renderStatusSelect('encendidoStatus', 'obsEncendido', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Ruidos anormales (motor/alternador)</label>{renderStatusSelect('ruidosStatus', 'obsRuidos', ['SI', 'NO', 'N/A'])}</div>
                <div><label className="lbl">Surtido a la planta (suministro de combustible)</label>{renderStatusSelect('surtidoStatus', 'obsSurtido', ['SI', 'NO', 'N/A'])}</div>
                <div>
                  <label className="lbl">Reserva de combustible.</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fi" placeholder="Reserva..." style={{ width: '110px' }} value={f.reservaMin} onChange={e => setF({...f, reservaMin: e.target.value})} />
                    <input className="fi" placeholder="Autonomía de reserva..." style={{ width: '180px' }} value={f.reservaAutonomia} onChange={e => setF({...f, reservaAutonomia: e.target.value})} />
                    <input className="fi" placeholder="Observaciones..." value={f.obsReserva} onChange={e => setF({...f, obsReserva: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div className="fd" style={{ fontSize: '.8rem', fontWeight: 700, color: '#f97316', marginBottom: 12 }}>6. RESULTADO FINAL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label className="lbl">Resultado</label>
                  <select className="fi" value={f.resultado} onChange={e => setF({...f, resultado: e.target.value})}>
                    <option value="Aprobado – Opera dentro de parámetros.">Aprobado – Opera dentro de parámetros.</option>
                    <option value="Observado – Requiere mantenimiento menor (ver notas).">Observado – Requiere mantenimiento menor (ver notas).</option>
                    <option value="Rechazado – No opera / requiere reparación mayor.">Rechazado – No opera / requiere reparación mayor.</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Observaciones generales</label>
                  <textarea className="fi" value={f.obsGenerales} onChange={e => setF({...f, obsGenerales: e.target.value})} style={{ minHeight: '80px', resize: 'vertical' }}></textarea>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="lbl">Firma del técnico (Responsable)</label>
                    <select className="fi" value={f.firmaTecnico} onChange={e => setF({...f, firmaTecnico: e.target.value})}>
                      <option value="">Selecciona el técnico responsable...</option>
                      {authorizedStaff.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 18 }}>
            <button className="bs" onClick={onCancel} disabled={saving} style={{ minWidth: 120 }}>Cancelar</button>
            <button className="bp" onClick={save} disabled={saving} style={{ minWidth: 220 }}>{saving ? 'Guardando...' : 'Guardar y Generar Reporte'}</button>
          </div>
        </div>
      );
    }

    function CalibrateHoroModal({ plantEq, nodeId, nodeName, userProfile, toast, onClose, onSaved }) {
      const catalogSeed = INITIAL_MAINTENANCE_LOG.find(m => m.tag === plantEq.tag);
      const seedLastMaint = catalogSeed ? (parseFloat(catalogSeed.horometro_mtto) || 0) : 0;
      const seedCurrentH = catalogSeed ? (parseFloat(catalogSeed.horometro_actual) || 0) : 0;
      const eqLastMaint = parseFloat(plantEq.lastMaintenanceHorometer) || 0;
      const eqHoro = parseFloat(plantEq.horometer) || 0;

      let customH = 0;
      let customMtto = 0;
      try {
        const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
        if (ch[plantEq.tag]) {
          if (ch[plantEq.tag].horometro_actual !== undefined) customH = parseFloat(ch[plantEq.tag].horometro_actual) || 0;
          if (ch[plantEq.tag].horometro_mtto !== undefined) customMtto = parseFloat(ch[plantEq.tag].horometro_mtto) || 0;
        }
      } catch(e) {}

      let tankH = 0;
      try {
        const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
        const mTank = tk.find(t => t.tag === plantEq.tag);
        if (mTank && mTank.horometro_actual !== undefined) {
          tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
        }
      } catch(e) {}

      const initialLastM = Math.max(seedLastMaint, eqLastMaint, customMtto);
      const explicitH = Math.max(eqHoro, customH, tankH);
      const initialCurrH = explicitH > 0 ? Math.max(explicitH, initialLastM) : (initialLastM > 0 ? initialLastM : seedCurrentH);
      const initialInterval = parseFloat(plantEq.maintenanceInterval) || (catalogSeed ? catalogSeed.intervalo : 250);

      const [f, setF] = useState({
        horometer: formatHHMMSS(initialCurrH),
        lastMaintenanceHorometer: formatHHMMSS(initialLastM),
        maintenanceInterval: initialInterval,
        obs: ''
      });
      const [saving, setSaving] = useState(false);

      // Cálculos en tiempo real dentro del modal
      const curH = parseHours(f.horometer);
      const curM = parseHours(f.lastMaintenanceHorometer);
      const curInt = parseFloat(f.maintenanceInterval) || 250;
      const elapsed = Math.max(0, parseFloat((curH - curM).toFixed(1)));
      const remaining = parseFloat((curInt - elapsed).toFixed(1));
      const percentage = Math.min(100, Math.max(0, (elapsed / curInt) * 100));

      let barColor = '#10b981';
      let statusBadge = 'ÓPTIMO';
      if (remaining <= 0) {
        barColor = '#ef4444';
        statusBadge = 'MANTENIMIENTO VENCIDO';
      } else if (remaining <= 20) {
        barColor = '#f59e0b';
        statusBadge = 'MANTENIMIENTO PRÓXIMO';
      }

      const isHoroLowerThanMaint = curH < curM && curH > 0 && curM > 0;

      const handleSave = async () => {
        if (!f.horometer || !f.horometer.trim()) {
          toast('Por favor ingresa el horómetro actual.', 'error');
          return;
        }
        setSaving(true);
        try {
          const finalH = parseHours(f.horometer);
          const finalM = parseHours(f.lastMaintenanceHorometer);
          const finalI = parseFloat(f.maintenanceInterval) || 250;

          // 1. Actualizar energy_equipment en Firestore
          await db.collection('energy_nodes').doc(nodeId).collection('energy_equipment').doc(plantEq.id).update({
            horometer: finalH,
            lastMaintenanceHorometer: finalM,
            maintenanceInterval: finalI
          });

          // 2. Registrar auditoría en energy_records
          await db.collection('energy_nodes').doc(nodeId).collection('energy_records').add({
            date: firebase.firestore.FieldValue.serverTimestamp(),
            type: 'ajuste_horometro',
            generatorTag: plantEq.tag,
            equipmentTag: plantEq.tag,
            technicianName: userProfile?.name || 'Técnico',
            technicianId: userProfile?.uid || '',
            details: {
              oldHorometer: initialCurrH,
              newHorometer: finalH,
              oldLastMaint: initialLastM,
              newLastMaint: finalM,
              maintenanceInterval: finalI,
              obs: f.obs || 'Ajuste manual de horómetro desde tarjeta de planta'
            }
          });

          // 3. Sincronizar en localStorage: airtek_plant_horometers_v1
          try {
            const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
            ch[plantEq.tag] = {
              ...(ch[plantEq.tag] || {}),
              horometro_actual: finalH,
              horometro_mtto: finalM,
              updatedAt: new Date().toISOString()
            };
            localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(ch));
          } catch(e) {}

          // 4. Sincronizar en localStorage: airtek_fuel_tanks_v13
          try {
            const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
            const idx = tk.findIndex(t => t.tag === plantEq.tag);
            if (idx !== -1) {
              tk[idx].horometro_actual = finalH;
              localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
            }
          } catch(e) {}

          // 5. Emitir evento global para actualizar todas las vistas reactivas
          window.dispatchEvent(new CustomEvent('airtek_horo_updated', {
            detail: { plantTag: plantEq.tag, horometer: finalH, lastMaint: finalM }
          }));

          toast(`Horómetro de ${plantEq.tag} actualizado a ${formatHHMMSS(finalH)}`, 'success');
          if (onSaved) onSaved();
          onClose();
        } catch(e) {
          toast('Error al actualizar horómetro: ' + (e.message || String(e)), 'error');
        } finally {
          setSaving(false);
        }
      };

      return (
        <div className="overlay" onClick={onClose} style={{ zIndex: 9999 }}>
          <div className="card fin" style={{ maxWidth: 540, width: '92%', borderRadius: 16, padding: '24px 28px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <h3 className="fd" style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0, color: 'var(--tx1)' }}>Ajustar Horómetro</h3>
                  <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>{plantEq.tag} · {nodeName}</div>
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, padding: 4 }}>✕</button>
            </div>

            {/* Micro spec info */}
            <div style={{ background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.75rem', color: 'var(--tx2)' }}>Capacidad: <b>{plantEq.capacity || '—'} KVA</b></span>
              <span style={{ fontSize: '.75rem', color: 'var(--tx2)' }}>Fases: <b>{plantEq.phases || '—'}</b></span>
              <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: `${barColor}18`, color: barColor, border: `1px solid ${barColor}40` }}>
                {statusBadge}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="lbl" style={{ fontWeight: 700, color: 'var(--blue)' }}>Horómetro Actual (HH:MM:SS)</label>
                <input 
                  className="fi fm" 
                  type="text" 
                  value={f.horometer} 
                  onChange={e => setF({ ...f, horometer: e.target.value })} 
                  placeholder="Ej: 546:28:00 o 550" 
                  style={{ fontSize: '1rem', fontWeight: 700, borderColor: 'var(--blue)' }}
                  autoFocus
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 4 }}>Lectura física actual del marcador</div>
              </div>

              <div>
                <label className="lbl">Último Mantenimiento (HH:MM:SS)</label>
                <input 
                  className="fi fm" 
                  type="text" 
                  value={f.lastMaintenanceHorometer} 
                  onChange={e => setF({ ...f, lastMaintenanceHorometer: e.target.value })} 
                  placeholder="Ej: 546:28:00 o 300" 
                  style={{ fontSize: '1rem' }}
                />
                <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 4 }}>Horómetro al que se realizó el mtto.</div>
              </div>

              <div style={{ gridColumn: '1/-1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="lbl">Intervalo de Mantenimiento (H)</label>
                  <input 
                    className="fi" 
                    type="number" 
                    value={f.maintenanceInterval} 
                    onChange={e => setF({ ...f, maintenanceInterval: e.target.value })} 
                    placeholder="250" 
                  />
                </div>
                <div>
                  <label className="lbl">Observación / Motivo (opcional)</label>
                  <input 
                    className="fi" 
                    type="text" 
                    value={f.obs} 
                    onChange={e => setF({ ...f, obs: e.target.value })} 
                    placeholder="Ej: Corrección de horómetro en sitio" 
                  />
                </div>
              </div>
            </div>

            {/* Warning if currentH < lastM */}
            {isHoroLowerThanMaint && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span><b>Atención:</b> El horómetro actual ({formatHHMMSS(curH)}) es menor al del último mantenimiento ({formatHHMMSS(curM)}). Verifica las lecturas.</span>
              </div>
            )}

            {/* Realtime calculation summary box */}
            <div style={{ background: 'var(--bg-deep)', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 20 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 8 }}>
                Cálculo en Tiempo Real
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Transcurridas</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--tx1)', fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(elapsed)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>{percentage.toFixed(0)}% de uso</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Restantes</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: barColor, fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(remaining)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>{remaining <= 0 ? 'Vencido' : 'Disponibles'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.64rem', color: 'var(--tx3)', textTransform: 'uppercase' }}>Próx. Límite</div>
                  <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--tx1)', fontFamily: "'Outfit', monospace" }}>{formatHHMMSS(curM + curInt)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--tx4)' }}>Horómetro meta</div>
                </div>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-surface)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.3s ease' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="bs" onClick={onClose} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8 }}>
                Cancelar
              </button>
              <button className="bp" onClick={handleSave} disabled={saving} style={{ padding: '8px 22px', borderRadius: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {saving ? 'Guardando...' : 'Guardar Horómetro'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // --- PLANT CARD COMPOUND COMPONENT (vercel-composition-patterns) ---
    const PlantCardContext = React.createContext(null);

    function usePlantCard() {
      const ctx = React.useContext(PlantCardContext);
      if (!ctx) {
        throw new Error('PlantCard subcomponents must be used within PlantCard.Root');
      }
      return ctx;
    }

    const PlantCard = {
      Root: function PlantCardRoot({
        eq,
        records,
        nodeFuelState,
        userProfile,
        isExpanded,
        onToggleExpand,
        onInspect,
        onAdjustHoro,
        onCalibrateFuel,
        onRefill,
        onSelectRecord,
        children
      }) {
        const catalogSeed = INITIAL_MAINTENANCE_LOG.find(m => m.tag === eq.tag);
        const interval = parseFloat(eq.maintenanceInterval) || (catalogSeed ? catalogSeed.intervalo : 250);
        const seedLastMaint = catalogSeed ? (parseFloat(catalogSeed.horometro_mtto) || 0) : 0;
        const eqLastMaint = parseFloat(eq.lastMaintenanceHorometer) || 0;

        let customH = 0;
        let customMtto = 0;
        try {
          const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
          if (ch[eq.tag]) {
            if (ch[eq.tag].horometro_actual !== undefined) customH = parseFloat(ch[eq.tag].horometro_actual) || 0;
            if (ch[eq.tag].horometro_mtto !== undefined) customMtto = parseFloat(ch[eq.tag].horometro_mtto) || 0;
          }
        } catch(e) {}

        let tankH = 0;
        try {
          const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          const mTank = tk.find(t => t.tag === eq.tag);
          if (mTank && mTank.horometro_actual !== undefined) {
            tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
          }
        } catch(e) {}

        const lastMaint = Math.max(seedLastMaint, eqLastMaint, customMtto);
        const seedCurrentH = catalogSeed ? (parseFloat(catalogSeed.horometro_actual) || 0) : 0;
        const eqCurrentH = parseFloat(eq.horometer) || 0;

        const allPlantRecords = (records || [])
          .filter(r => r.generatorTag === eq.tag || r.equipmentTag === eq.tag || r.equipmentAction?.tag === eq.tag)
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dbDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dbDate - da;
          });

        let latestHoroFromRecords = 0;
        for (const r of allPlantRecords) {
          let hVal = 0;
          if (r.fuelHorometer) {
            hVal = parseHours(r.fuelHorometer);
          } else if (r.measurements?.[eq.tag]?.horometer) {
            hVal = parseHours(r.measurements[eq.tag].horometer);
          } else if (r.measurements?.horometer) {
            hVal = parseHours(r.measurements.horometer);
          } else if (r.equipmentAction?.horometer) {
            hVal = parseHours(r.equipmentAction.horometer);
          } else if (r.details?.horometer) {
            hVal = parseHours(r.details.horometer);
          } else if (r.details?.newHorometer) {
            hVal = parseHours(r.details.newHorometer);
          } else if (r.horometer) {
            hVal = parseHours(r.horometer);
          }
          if (hVal > 0) {
            latestHoroFromRecords = hVal;
            break;
          }
        }

        const explicitCurrentH = Math.max(eqCurrentH, customH, tankH, latestHoroFromRecords);
        const currentH = explicitCurrentH > 0 
          ? Math.max(explicitCurrentH, lastMaint) 
          : (lastMaint > 0 ? lastMaint : seedCurrentH);

        const elapsed = Math.max(0, parseFloat((currentH - lastMaint).toFixed(1)));
        const remaining = parseFloat((interval - elapsed).toFixed(1));
        const percentage = Math.min(100, Math.max(0, (elapsed / interval) * 100));

        let barColor = '#10b981';
        let bgColor = 'rgba(16, 185, 129, 0.12)';
        let statusText = 'OPERATIVO';
        if (remaining <= 0) {
          barColor = '#ef4444';
          bgColor = 'rgba(239, 68, 68, 0.12)';
          statusText = 'MANTENIMIENTO VENCIDO';
        } else if (remaining <= 20) {
          barColor = '#f59e0b';
          bgColor = 'rgba(245, 158, 11, 0.12)';
          statusText = 'MANTENIMIENTO PRÓXIMO';
        }

        const plantRecords = (records || [])
          .filter(r => r.type === 'inspeccion_gen' && r.equipmentTag === eq.tag)
          .sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dbDate = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dbDate - da;
          });

        const contextValue = {
          state: {
            eq,
            currentH,
            lastMaint,
            interval,
            elapsed,
            remaining,
            percentage,
            barColor,
            bgColor,
            statusText,
            plantRecords,
            isExpanded,
            userProfile,
            reservaLts: nodeFuelState?.reserva_lts || 0,
            capReservaLts: nodeFuelState?.cap_reserva_lts || 0
          },
          actions: {
            onInspect,
            onAdjustHoro,
            onCalibrateFuel,
            onRefill,
            onToggleExpand,
            onSelectRecord
          }
        };

        return (
          <PlantCardContext.Provider value={contextValue}>
            {children}
          </PlantCardContext.Provider>
        );
      },

      Frame: function PlantCardFrame({ children }) {
        return (
          <div className="card fin" style={{ 
            background: 'var(--bg-surface)', 
            border: '1px solid var(--border)',
            borderRadius: 12, 
            padding: '18px 22px', 
            marginBottom: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
          }}>
            {children}
          </div>
        );
      },

      Header: function PlantCardHeader() {
        const { state: { eq, barColor, bgColor, statusText } } = usePlantCard();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ 
              fontSize: '.72rem', 
              fontWeight: 800, 
              padding: '3px 8px', 
              borderRadius: 6, 
              background: 'var(--bg-elevated)', 
              color: 'var(--tx2)', 
              border: '1px solid var(--border)',
              letterSpacing: '.05em' 
            }}>GEN</span>
            <span className="fd" style={{ fontSize: '1.18rem', fontWeight: 800, color: 'var(--tx1)', letterSpacing: '.02em' }}>{eq.tag}</span>
            <span style={{ 
              fontSize: '.72rem', 
              fontWeight: 700, 
              padding: '3px 10px', 
              borderRadius: 20, 
              background: bgColor, 
              color: barColor, 
              border: `1px solid ${barColor}40`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: barColor }} />
              {statusText}
            </span>
          </div>
        );
      },

      Specs: function PlantCardSpecs() {
        const { 
          state: { eq, currentH, reservaLts, capReservaLts, userProfile },
          actions: { onAdjustHoro, onCalibrateFuel }
        } = usePlantCard();
        const canEditFuel = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase());

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: 6 }}>
            {eq.serial && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Serial</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.serial}</div>
              </div>
            )}
            {eq.capacity && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Capacidad</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.capacity} KVA</div>
              </div>
            )}
            {eq.phases && (
              <div style={{ background: 'var(--bg-elevated)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Fases</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--tx1)', fontFamily: "'Outfit', sans-serif" }}>{eq.phases}</div>
              </div>
            )}
            {currentH > 0 && (
              <div 
                onClick={onAdjustHoro}
                title="Haz clic para ajustar o calibrar el horómetro"
                style={{ 
                  background: 'var(--bg-elevated)', 
                  padding: '6px 10px', 
                  borderRadius: 8, 
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.background = 'rgba(1, 102, 255, 0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Horómetro</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    Modificar
                  </span>
                </div>
                <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', fontFamily: "'Outfit', 'Montserrat', monospace" }}>{formatHHMMSS(currentH)}</div>
              </div>
            )}
            <div 
              onClick={canEditFuel ? onCalibrateFuel : undefined}
              title={canEditFuel ? "Haz clic para calibrar o ajustar combustible y reserva" : undefined}
              style={{ 
                background: 'var(--bg-elevated)', 
                padding: '6px 10px', 
                borderRadius: 8, 
                border: '1px solid var(--border)',
                cursor: canEditFuel ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onMouseEnter={e => { if (canEditFuel) { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.background = 'rgba(1, 102, 255, 0.08)'; } }}
              onMouseLeave={e => { if (canEditFuel) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-elevated)'; } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '.65rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>Reserva</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {canEditFuel && (
                    <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Modificar
                    </span>
                  )}
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: reservaLts > 0 ? '#10b981' : '#ef4444' }} />
                </div>
              </div>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: reservaLts > 0 ? 'var(--blue)' : '#ef4444', fontFamily: "'Outfit', sans-serif" }}>
                {reservaLts.toLocaleString()} <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--tx3)' }}>Lts</span>
              </div>
              {capReservaLts > 0 && (
                <div style={{ fontSize: '.62rem', color: 'var(--tx4)', marginTop: 1 }}>
                  Cap: {capReservaLts} Lts ({Math.min(100, Math.round((reservaLts / capReservaLts) * 100))}%)
                </div>
              )}
            </div>
          </div>
        );
      },

      HorometerCountdown: function PlantCardHorometerCountdown() {
        const { state: { remaining, barColor } } = usePlantCard();
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div className="fm" style={{ 
              fontSize: '1.75rem', 
              fontWeight: 900, 
              color: barColor, 
              lineHeight: 1, 
              letterSpacing: '.02em',
              fontFamily: "'Outfit', 'Montserrat', monospace"
            }}>
              {formatHHMMSS(remaining)}
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
              {remaining <= 0 ? 'Horas de sobregiro' : 'Horas restantes'}
            </div>
          </div>
        );
      },

      Actions: function PlantCardActions() {
        const {
          state: { plantRecords, isExpanded, userProfile },
          actions: { onInspect, onAdjustHoro, onCalibrateFuel, onRefill, onToggleExpand }
        } = usePlantCard();
        const canEditFuel = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase());

        return (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {plantRecords.length > 0 && (
              <button className="bs" style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600 }} onClick={onToggleExpand}>
                {isExpanded ? 'Ocultar Hist.' : `Historial (${plantRecords.length})`}
              </button>
            )}
            {canEditFuel && (
              <button 
                className="bs" 
                style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} 
                onClick={onCalibrateFuel}
                title="Calibrar niveles de combustible y capacidad de reserva física"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Calibrar Combustible
              </button>
            )}
            <button 
              className="bs" 
              style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} 
              onClick={onAdjustHoro}
              title="Ajustar horómetro actual y último mantenimiento"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Ajustar Horómetro
            </button>
            <button className="bp" style={{ padding: '7px 14px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, background: '#0284c7', display: 'flex', alignItems: 'center', gap: 6 }} onClick={onRefill}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><line x1="3" y1="22" x2="15" y2="22"/></svg>
              Surtir Combustible
            </button>
            <button className="bp" style={{ padding: '7px 16px', fontSize: '.8rem', borderRadius: 8, fontWeight: 600, boxShadow: '0 2px 8px rgba(1, 102, 255, 0.25)' }} onClick={onInspect}>
              Inspeccionar
            </button>
          </div>
        );
      },

      ProgressBar: function PlantCardProgressBar() {
        const {
          state: { lastMaint, interval, elapsed, percentage, barColor, bgColor },
          actions: { onAdjustHoro }
        } = usePlantCard();

        return (
          <div style={{ 
            marginTop: 16, 
            background: 'var(--bg-elevated)', 
            padding: '12px 16px', 
            borderRadius: 10, 
            border: '1px solid var(--border)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', color: 'var(--tx2)', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span 
                onClick={onAdjustHoro} 
                style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                title="Haz clic para modificar el horómetro del último mantenimiento"
                onMouseEnter={e => e.currentTarget.style.color = 'var(--blue)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--tx2)'}
              >
                <b style={{ color: 'var(--tx3)' }}>Último Mant.:</b> {formatHHMMSS(lastMaint)} <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--blue)', verticalAlign: 'middle', marginLeft: 3 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </span>
              <span style={{ fontWeight: 700, color: barColor, background: bgColor, padding: '2px 8px', borderRadius: 4, border: `1px solid ${barColor}30` }}>
                {formatHHMMSS(elapsed)} transcurridas ({percentage.toFixed(0)}%)
              </span>
              <span><b style={{ color: 'var(--tx3)' }}>Próx. Límite:</b> {formatHHMMSS(lastMaint + interval)}</span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'var(--bg-deep)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ width: `${percentage}%`, height: '100%', background: barColor, borderRadius: 6, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      },

      History: function PlantCardHistory() {
        const {
          state: { eq, plantRecords, isExpanded, barColor },
          actions: { onSelectRecord }
        } = usePlantCard();

        if (!isExpanded || plantRecords.length === 0) return null;

        const chartSeries = [...plantRecords].reverse().map(r => {
          const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
          const label = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
          const rMeas = r.measurements?.[eq.tag] || {};
          const val = parseFloat(rMeas.horometer) || 0;
          return { label, val };
        });

        const maxVal = Math.max(...chartSeries.map(s => s.val), 1);
        const chartH = 90;
        const chartWidth = Math.max(chartSeries.length * 50 + 60, 320);

        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)', animation: 'fin 0.2s ease' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, fontWeight: 700 }}>
              Historial de Horómetros (H) — {eq.tag}
            </div>
            
            {/* SVG Bar Chart */}
            <div style={{ background: 'rgba(0,0,0,0.12)', padding: '16px 14px 10px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${chartWidth} ${chartH + 30}`} style={{ width: '100%', minWidth: chartWidth, height: 'auto', display: 'block' }}>
                {[0, 0.5, 1].map(p => (
                  <g key={p}>
                    <line x1="40" y1={chartH - chartH * p + 5} x2={chartWidth - 15} y2={chartH - chartH * p + 5} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray={p > 0 && p < 1 ? "3,3" : ""} />
                    <text x="35" y={chartH - chartH * p + 8} fill="var(--tx4)" fontSize="8.5" fontFamily="JetBrains Mono" textAnchor="end" fontWeight="500">
                      {Math.round(maxVal * p)}
                    </text>
                  </g>
                ))}
                {chartSeries.map((s, i) => {
                  const bh = Math.max(2, (s.val / maxVal) * (chartH - 15));
                  const x = i * 50 + 65;
                  const barWidth = 18;
                  return (
                    <g key={i}>
                      <rect x={x - barWidth / 2} y={chartH - bh + 5} width={barWidth} height={bh} fill={barColor} rx="2.5" opacity="0.9" />
                      <rect x={x - barWidth / 2} y={chartH - bh + 5} width={barWidth} height={bh} fill="url(#colGradientGen)" rx="2.5" opacity="0.25" />
                      {s.val > 0.01 && (
                        <text x={x} y={chartH - bh} fill="var(--tx1)" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="700">
                          {s.val}
                        </text>
                      )}
                      <text x={x} y={chartH + 18} fill="var(--tx3)" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono">{s.label}</text>
                    </g>
                  );
                })}
                <defs>
                  <linearGradient id="colGradientGen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* History Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--bg-deep)' }}>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'left', fontWeight: 600 }}>Fecha</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'right', fontWeight: 600 }}>Horómetro</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'right', fontWeight: 600 }}>Técnico</th>
                    <th style={{ padding: '6px 10px', color: 'var(--tx2)', textAlign: 'center', fontWeight: 600 }}>Mantenimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {plantRecords.slice(0, 5).map((r, ri) => {
                    const rDate = r.date?.toDate ? r.date.toDate() : new Date(r.date);
                    const rDateStr = rDate.toLocaleDateString('es-VE') + ' ' + rDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
                    const rMeas = r.measurements?.[eq.tag] || {};
                    const didMaint = !!rMeas.mantenimientoRealizado;
                    return (
                      <tr key={r.id} onClick={() => onSelectRecord && onSelectRecord(r)} style={{ borderBottom: '1px solid var(--border)', background: ri % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: onSelectRecord ? 'pointer' : 'default' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--tx2)', fontFamily: 'monospace' }}>{rDateStr}</td>
                        <td style={{ padding: '8px 10px', color: '#008000', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{rMeas.horometer ? formatHHMMSS(parseHours(rMeas.horometer)) : '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--tx3)', textAlign: 'right' }}>{r.technicianName || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {didMaint ? (
                            <span className="badge" style={{ background: 'rgba(0, 128, 0,.15)', color: '#008000' }}>Realizado</span>
                          ) : (
                            <span style={{ color: 'var(--tx4)', fontSize: '.75rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      },

      Notes: function PlantCardNotes() {
        const { state: { eq } } = usePlantCard();
        if (!eq.notes) return null;
        const cleanNotes = String(eq.notes).replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        return (
          <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--tx4)', fontStyle: 'italic' }}>
            * {cleanNotes}
          </div>
        );
      }
    };

    function NodePlantas({ nodeId, nodeName, nodeType, equipment, records, userProfile, toast, onSubViewChange, setSelRecord }) {
      const genEqs = sortEquipment(equipment.filter(e => e.type === 'GEN' && e.active !== false));
      const [calibrateModalPlant, setCalibrateModalPlant] = useState(null);
      const [calibrateFuelPlant, setCalibrateFuelPlant] = useState(null);
      const [horoRefreshTrigger, setHoroRefreshTrigger] = useState(0);

      useEffect(() => {
        const onHoroUpdate = () => setHoroRefreshTrigger(k => k + 1);
        window.addEventListener('airtek_horo_updated', onHoroUpdate);
        return () => window.removeEventListener('airtek_horo_updated', onHoroUpdate);
      }, []);
      
      // Estado en tiempo real de la reserva y combustible del nodo
      const [nodeFuelState, setNodeFuelState] = useState(() => {
        const norm = normalizeNodeName;
        const targetNorm = norm(nodeName);
        let list = INITIAL_FUEL_TANKS;
        try {
          const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          if (saved.length > 0) list = saved;
        } catch(e) {}
        const match = list.filter(t => {
          const tNorm = norm(t.lugar);
          return tNorm === targetNorm || (targetNorm && tNorm.includes(targetNorm)) || (tNorm && targetNorm.includes(tNorm));
        });
        const maxRes = match.reduce((m, t) => Math.max(m, parseFloat(t.reserva_lts) || 0), 0);
        const maxCap = match.reduce((m, t) => Math.max(m, parseFloat(t.cap_reserva || t.cap_reserva_lts) || 0), 0);
        const subActual = match.length > 0 ? (parseFloat(match[0].subtanque_actual) || parseFloat(match[0].tanque_lts) || 0) : 0;
        return { reserva_lts: maxRes, cap_reserva_lts: maxCap, subtanque_actual: subActual };
      });

      useEffect(() => {
        if (!db || !nodeId) return;
        const unsub = db.collection('energy_nodes').doc(nodeId).collection('fuel').doc('state').onSnapshot(snap => {
          if (snap.exists) {
            const data = snap.data();
            const cLugar = (nodeName || '').toLowerCase();
            let rawRes = data.reserva_lts;
            let rawCap = data.cap_reserva_lts;

            // Auto-sanar en Firestore si el nodo sufrió el error previo de reserva en 0
            if (cLugar.includes('callao') && (rawRes === 0 || rawRes === undefined)) {
              rawRes = 1259.0;
              rawCap = 2500;
              snap.ref.set({ reserva_lts: 1259.0, cap_reserva_lts: 2500 }, { merge: true }).catch(() => {});
            } else if (cLugar.includes('18 de octubre') && (rawRes === 0 || rawRes === undefined)) {
              rawRes = 230.0;
              rawCap = 240;
              snap.ref.set({ reserva_lts: 230.0, cap_reserva_lts: 240 }, { merge: true }).catch(() => {});
            }

            setNodeFuelState(prev => {
              const rLts = rawRes !== undefined ? rawRes : prev.reserva_lts;
              const cLts = rawCap !== undefined ? rawCap : prev.cap_reserva_lts;
              return {
                ...prev,
                reserva_lts: rLts,
                cap_reserva_lts: cLts || prev.cap_reserva_lts,
                subtanque_actual: data.subtanque_actual !== undefined ? data.subtanque_actual : prev.subtanque_actual,
                total_nodo_lts: data.total_nodo_lts !== undefined ? data.total_nodo_lts : prev.total_nodo_lts
              };
            });
          }
        }, err => console.warn('Fuel state listener:', err));

        const onLocalUpdate = (e) => {
          const d = e.detail;
          if (d && (d.nodeId === nodeId || d.nodeName?.toLowerCase() === nodeName?.toLowerCase())) {
            setNodeFuelState(prev => ({
              ...prev,
              reserva_lts: d.resultingRes,
              subtanque_actual: d.resultingSub,
              total_nodo_lts: d.resultingTotal
            }));
          }
        };
        window.addEventListener('airtek_fuel_updated', onLocalUpdate);

        return () => {
          unsub();
          window.removeEventListener('airtek_fuel_updated', onLocalUpdate);
        };
      }, [nodeId, nodeName]);

      // Auto-recuperar si el técnico estaba en este formulario de planta
      const activePlantDraft = (() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          if (!s) return null;
          const parsed = JSON.parse(s);
          if (parsed.nodeId === nodeId && parsed.formType === 'plant' && parsed.plantTag) {
            return genEqs.find(e => e.tag === parsed.plantTag) || null;
          }
          return null;
        } catch { return null; }
      })();

      const [viewForm, setViewForm] = useState(() => !!activePlantDraft);
      const [selPlant, setSelPlant] = useState(() => activePlantDraft || null);
      const [expandedHist, setExpandedHist] = useState({});
      

      const handleInspect = (eq) => {
        setSelPlant(eq);
        setViewForm(true);
      };

      if (viewForm && selPlant) {
        return <PlantRecordForm nodeId={nodeId} nodeName={nodeName} nodeType={nodeType} plantEq={selPlant} userProfile={userProfile} onSave={() => setViewForm(false)} onCancel={() => setViewForm(false)} toast={toast} />;
      }

      return (
        <div className="fin">
          {genEqs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50 }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}></div>
              <p style={{ color: 'var(--tx3)', marginBottom: 14 }}>No hay Plantas Eléctricas registradas en este nodo.</p>
              <button className="bp" onClick={() => onSubViewChange('newRecord')}>+ Añadir Equipo Planta</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                 Plantas Eléctricas Registradas
              </div>
              {genEqs.map(eq => (
                <PlantCard.Root
                  key={eq.id}
                  eq={eq}
                  records={records}
                  nodeFuelState={nodeFuelState}
                  userProfile={userProfile}
                  isExpanded={!!expandedHist[eq.id]}
                  onToggleExpand={() => setExpandedHist(p => ({ ...p, [eq.id]: !p[eq.id] }))}
                  onInspect={() => handleInspect(eq)}
                  onAdjustHoro={() => setCalibrateModalPlant(eq)}
                  onCalibrateFuel={() => setCalibrateFuelPlant(eq)}
                  onRefill={() => {
                    localStorage.setItem('airtek_presurtido', JSON.stringify({ plantTag: eq.tag, plantCapacity: eq.capacity }));
                    onSubViewChange('newRecord');
                  }}
                  onSelectRecord={setSelRecord}
                >
                  <PlantCard.Frame>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: '280px' }}>
                        <PlantCard.Header />
                        <PlantCard.Specs />
                      </div>
                      <div style={{ textAlign: 'right', minWidth: '200px' }}>
                        <PlantCard.HorometerCountdown />
                        <PlantCard.Actions />
                      </div>
                    </div>
                    <PlantCard.ProgressBar />
                    <PlantCard.History />
                    <PlantCard.Notes />
                  </PlantCard.Frame>
                </PlantCard.Root>
              ))}
            </div>
          )}
          {calibrateModalPlant && (
            <CalibrateHoroModal 
              plantEq={calibrateModalPlant} 
              nodeId={nodeId} 
              nodeName={nodeName} 
              userProfile={userProfile} 
              toast={toast} 
              onClose={() => setCalibrateModalPlant(null)} 
              onSaved={() => setHoroRefreshTrigger(k => k + 1)} 
            />
          )}
          {calibrateFuelPlant && (
            <AdjustFuelLevelModal
              tanks={(() => {
                try {
                  const saved = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                  if (saved.length > 0) return saved;
                } catch(e) {}
                return INITIAL_FUEL_TANKS;
              })()}
              preselectedPlant={{
                ...calibrateFuelPlant,
                lugar: nodeName,
                tag: calibrateFuelPlant.tag
              }}
              userProfile={userProfile}
              toast={toast}
              onClose={() => setCalibrateFuelPlant(null)}
              onSave={async (adj) => {
                try {
                  await persistNodeFuelUpdate({
                    db,
                    nodeId,
                    nodeName,
                    plantTag: calibrateFuelPlant.tag,
                    resultingSub: adj.newSub,
                    resultingRes: adj.newRes,
                    resultingTotal: adj.newTotal,
                    resultingCapRes: adj.newCapRes,
                    addedTotalDespacho: 0,
                    resultingLtsP: 0,
                    resultingLtsR: 0,
                    fuelDest: `Calibración (${adj.motivo})`,
                    fuelHoro: adj.newHorometro || '',
                    userProfile
                  });
                  setNodeFuelState({
                    reserva_lts: adj.newRes,
                    cap_reserva_lts: adj.newCapRes,
                    subtanque_actual: adj.newSub,
                    total_nodo_lts: adj.newTotal
                  });
                  toast('Combustible y reserva calibrados con éxito.', 'success');
                  setCalibrateFuelPlant(null);
                } catch (e) {
                  console.error(e);
                  toast('Error calibrando combustible: ' + e.message, 'error');
                }
              }}
            />
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // DETALLE DE NODO
    // ═══════════════════════════════════════════════════
    function NodeDetail({ node, userProfile, onBack, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      
      const activeDraftInfo = (() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          if (!s) return null;
          const parsed = JSON.parse(s);
          return parsed.nodeId === node.id ? parsed : null;
        } catch { return null; }
      })();

      const [tab, setTab] = useState(() => {
        if (activeDraftInfo?.formType === 'plant') return 'plantas';
        return 'equipos';
      });
      const [equipment, setEquipment] = useState([]);
      const [records, setRecords] = useState([]);
      const [loading, setLoading] = useState(true);
      const [subView, setSubView] = useState(() => {
        if (activeDraftInfo?.formType === 'general') return 'newRecord';
        return 'main';
      }); // main | newRecord | recordDetail
      const [selRecord, setSelRecord] = useState(null);
      const [qrOpen, setQrOpen] = useState(false);
      const [filterType, setFilterType] = useState('all');
      const [editEq, setEditEq] = useState(null); // equipo siendo editado

      useEffect(() => {
        const u1 = db.collection('energy_nodes').doc(node.id).collection('energy_equipment')
          .onSnapshot(s => { setEquipment(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        const u2 = db.collection('energy_nodes').doc(node.id).collection('energy_records')
          .orderBy('date', 'desc').limit(40).onSnapshot(s => { setRecords(s.docs.map(d => ({ id: d.id, ...d.data() }))); });
        return () => { u1(); u2(); };
      }, [node.id]);

      const exportPDF = async () => {

        const { jsPDF } = await loadJsPDF();
        const jsPDFDoc = jsPDF || window.jspdf?.jsPDF;
        const doc = new jsPDFDoc({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pw = doc.internal.pageSize.getWidth();
        let y = 25;

        const slugify = t => t.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
        const fmtDateTime = d => d?.toDate ? d.toDate().toLocaleString('es-VE') : new Date(d).toLocaleString('es-VE');

        // Header - Printer Friendly (White background)
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0);
        doc.text('REPORTE DE ENERGÍA - AIRTEK', 15, 15);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, pw - 15, 15, { align: 'right' });
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5); doc.line(15, 18, pw - 15, 18);

        // Info Nodo
        doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
        doc.text(node.name, 15, y); y += 6;
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(`Zona: ${node.zone || '—'} | Tipo: ${(NODE_TYPES[node.type] || {}).label || node.type}`, 15, y); y += 10;

        // Equipos Activos
        doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text('EQUIPOS ACTIVOS', 15, y); y += 6;
        const actEq = sortEquipment(equipment.filter(e => e.active !== false));
        if (actEq.length === 0) {
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
          doc.text('Sin equipos registrados.', 18, y); y += 5;
        }
        actEq.forEach(eq => {
          doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          const tagPart = `• ${eq.tag}`;
          doc.text(tagPart, 18, y);
          const tw = doc.getTextWidth(tagPart);
          doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);

          const isAC = eq.type === 'INV' || eq.type === 'ATS';
          const vInfo = isAC ? (eq.voltage ? ` ${eq.voltage}` : '') : (eq.voltageDC ? ` ${eq.voltageDC}VDC` : '');

          const infoPart = ` — ${eq.type}${vInfo}${eq.batteryType && eq.batteryType !== 'No aplica' ? ' [' + eq.batteryType + ']' : ''}`;
          doc.text(infoPart, 18 + tw + 1, y);
          y += 5; if (y > 275) { doc.addPage(); y = 25; }
        });
        y += 5;

        // Historial
        doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text('HISTORIAL DE REGISTROS', 15, y); y += 6;
        const histLimit = records.slice(0, 12);
        histLimit.forEach(r => {
          const rt = REC_TYPES[r.type] || { label: r.type, icon: '·' };
          doc.setTextColor(40, 40, 40); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
          doc.text(`${rt.label} — ${fmtDate(r.date)}`, 18, y);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
          doc.text(`Técnico: ${r.technicianName || '—'}`, 120, y);
          y += 4;
          if (r.observations) {
            const obsLines = doc.splitTextToSize(`Obs: ${r.observations}`, 165);
            doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
            obsLines.forEach(l => { doc.text(l, 21, y); y += 4; if (y > 275) { doc.addPage(); y = 25; } });
          }
          y += 2; if (y > 275) { doc.addPage(); y = 25; }
        });

        // ─── GRÁFICA DE CARGAS HISTÓRICAS (Grayscale) ───
        const inspRecs = records.filter(r => (r.type === 'inspeccion' || r.type === 'actualizacion_carga') && r.measurements && Object.keys(r.measurements).length > 0).slice().reverse();
        if (inspRecs.length > 0) {
          if (y > 230) { doc.addPage(); y = 25; }
          doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
          doc.text('GRÁFICO DE CARGAS (kW)', 15, y); y += 8;

          const chartH = 35; const chartW = 170; const startX = 20; const chartY = y + chartH;
          const seriesData = inspRecs.map(r => {
            let t = 0; Object.entries(r.measurements || {}).forEach(([tag, vals]) => {
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, vals);
              t += ld.ac + ld.dc;
            });
            return { label: fmtDate(r.date).slice(0, 5), val: t };
          });
          const maxVal = Math.max(...seriesData.map(s => s.val), 0.5) * 1.2;

          doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
          doc.line(startX, chartY, startX + chartW, chartY);
          [0, 0.5, 1].forEach(p => {
            const gy = chartY - (chartH * p);
            doc.line(startX, gy, startX + chartW, gy);
            doc.setTextColor(150, 150, 150); doc.setFontSize(7);
            doc.text((maxVal * p).toFixed(1), startX - 2, gy + 1, { align: 'right' });
          });

          const barW = Math.min(12, (chartW / seriesData.length) - 4);
          seriesData.forEach((s, i) => {
            const bh = (s.val / maxVal) * chartH;
            const bx = startX + 10 + i * (chartW / seriesData.length);
            doc.setFillColor(100, 100, 100); doc.rect(bx - barW / 2, chartY - bh, barW, bh, 'F');
            doc.setTextColor(0, 0, 0); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
            doc.text(s.val.toFixed(2), bx, chartY - bh - 2, { align: 'center' });
            doc.setTextColor(120, 120, 120); doc.setFontSize(6); doc.setFont('helvetica', 'normal');
            doc.text(s.label, bx, chartY + 4, { align: 'center' });
          });
          y += chartH + 15;
        }

        // ─── RESUMEN DE CARGAS POR BANCO (Printer Friendly) ───
        if (inspRecs.length > 0) {
          const lastR = inspRecs[inspRecs.length - 1];
          if (y > 240) { doc.addPage(); y = 25; }
          doc.setTextColor(0, 0, 0); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
          doc.text('RESUMEN DE BANCOS Y AUTONOMÍA', 15, y); y += 8;

          const allB = new Set();
          Object.keys(lastR.measurements).forEach(tag => { const b = getBankId(tag); if (b) allB.add(b); });
          const bks = Array.from(allB).sort();

          let col = 0;
          bks.forEach(bank => {
            const bLoad = Object.entries(lastR.measurements).reduce((sum, [tag, vals]) => {
              if (getBankId(tag) !== bank) return sum;
              const type = getEqTypeFromTag(tag, equipment);
              const ld = calcLoad(type, vals);
              return { ac: sum.ac + ld.ac, dc: sum.dc + ld.dc };
            }, { ac: 0, dc: 0 });
            const batEq = equipment.find(e => e.type === 'BAT' && getBankId(e.tag) === bank);
            const aut = calcAutonomy(batEq, bLoad.ac, bLoad.dc);

            const cardX = 15 + col * 92;
            if (y > 260) { doc.addPage(); y = 25; }

            // Card Printer Friendly (Border only)
            doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
            doc.rect(cardX, y, 88, 24);

            doc.setTextColor(0, 0, 0); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
            doc.text(`BANCO ${bank}`, cardX + 5, y + 6);

            doc.setTextColor(100, 100, 100); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
            doc.text(`Carga: ${(bLoad.ac + bLoad.dc).toFixed(2)} kW`, cardX + 5, y + 12);
            doc.text(`(AC:${bLoad.ac.toFixed(1)} DC:${bLoad.dc.toFixed(1)})`, cardX + 5, y + 17);

            doc.setTextColor(0, 0, 0); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
            doc.text(fmtHours(aut), cardX + 83, y + 12, { align: 'right' });

            if (col === 1) { y += 28; col = 0; } else col = 1;
          });
          if (col === 1) y += 28;
        }

        doc.save(`${slugify(node.name)}-historial.pdf`);
        toast('PDF generado (Versión impresión)', 'success');
      };

      const exportXLSX = async () => {

        const XLSX = await loadXLSX();
        // Hoja 1: Inspecciones y mediciones ordenadas por banco — carga por equipo + carga por banco + ATS
        const measRows = [];
        const inspRecs = records.filter(r => (r.type === 'inspeccion' || r.type === 'actualizacion_carga') && r.measurements && Object.keys(r.measurements).length > 0);
        inspRecs.forEach(r => {
          const fecha = fmtDate(r.date);
          const hora = r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '';
          const meas = r.measurements || {};
          // Reconstruir grupos ordenados
          const fakeEqs = sortEquipment(Object.keys(meas).map(tag => {
            const type = getEqTypeFromTag(tag, equipment);
            return { id: tag, tag, type, active: true };
          }));
          const groups = groupByBank(fakeEqs);
          groups.forEach(({ bank, eqs, bat, orphanBats }) => {
            let bankAcW = 0, bankDcW = 0;
            // Equipos del grupo
            eqs.forEach(eq => {
              const vals = meas[eq.tag] || {};
              const load = calcLoad(eq.type, vals);
              bankAcW += load.ac; bankDcW += load.dc;
              const aggLoad = load.ac + load.dc;
              const row = { 'Fecha': fecha, 'Hora': hora, 'Banco': bank || '—', 'Equipo': eq.tag, 'Tipo': eq.type, 'Carga (kW)': aggLoad > 0 ? aggLoad.toFixed(3) : '' };
              // ATS: L1, L2, N
              if (eq.type === 'ATS' || eq.type === 'BKR') { row['L1 (A)'] = vals.L1 || ''; row['L2 (A)'] = vals.L2 || ''; row['L3 (A)'] = vals.L3 || ''; row['N (A)'] = vals.N || ''; }
              measRows.push(row);
            });
            // Banco BAT con V banco
            const totalGrpW = bankAcW + bankDcW;
            const batEq = bat ? (equipment.find(e => e.tag === bat.tag) || bat) : (equipment.find(e => e.type === 'BAT' && getBankId(e.tag) === bank) || null);
            if (batEq) {
              const vals = (bat && meas[bat.tag]) ? meas[bat.tag] : {};
              const aut = totalGrpW > 0 ? calcAutonomy(batEq, bankAcW, bankDcW) : null;
              measRows.push({
                'Fecha': fecha, 'Hora': hora, 'Banco': bank || '—', 'Equipo': batEq.tag, 'Tipo': 'BAT',
                'Carga (kW)': '', 'V Banco (VDC)': vals.V_banco || '', 'I Banco (A)': vals.I_banco || '',
                'Autonomía (h)': aut ? aut.toFixed(2) : ''
              });
            }
            // Carga total del banco
            if (bank && bank !== '_ats' && totalGrpW > 0) {
              measRows.push({ 'Fecha': fecha, 'Hora': hora, 'Banco': bank, 'Equipo': '→ TOTAL BANCO', 'Tipo': '', 'Carga (kW)': totalGrpW.toFixed(3) });
            }
          });
        });
        // Hoja 2: Resumen
        const recRows = inspRecs.map(r => ({
          'Fecha': fmtDate(r.date),
          'Hora': r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '',
          'Turno': r.shift === 'dia' ? 'Día' : 'Noche',
          'Observaciones': r.observations || '',
        }));
        const eqRows = equipment.map(e => ({
          'Tag': e.tag, 'Tipo': e.type,
          'Tensión AC': e.voltage || '',
          'Tensión DC': e.voltageDC || '',
          'Panel Solar': e.hasSolar ? 'Sí' : 'No', 'Batería': e.batteryType || '',
          'Capacidad (Ah)': e.batCapacity || '', 'N° Baterías': (e.batCount ? (e.batteryType === 'NMC' ? `${e.batCount} celdas (${Math.floor(e.batCount / 7)} bat.)` : `${e.batCount}`) : ''), 'Tipo Celda': e.batCellType || '',
          'Estado': e.active !== false ? 'Activo' : 'Retirado',
          'Instalado': fmtDate(e.installedAt), 'Instalado por': e.installedBy || '',
          'Notas': e.notes || '',
        }));
        // Hoja 4: Historial de Cargas (Matriz de bancos)
        const histRows = inspRecs.map(r => {
          const row = { 'Fecha': fmtDate(r.date), 'Hora': r.date?.toDate ? r.date.toDate().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '' };
          let totalNodo = 0;
          Object.entries(r.measurements || {}).forEach(([tag, vals]) => {
            const type = getEqTypeFromTag(tag, equipment);
            const ld = calcLoad(type, vals);
            const lTot = ld.ac + ld.dc;
            totalNodo += lTot;
            const b = getBankId(tag);
            if (b) {
              const k = `Banco ${b} (kW)`;
              row[k] = parseFloat(((row[k] || 0) + lTot).toFixed(3));
            }
          });
          row['TOTAL NODO (kW)'] = totalNodo.toFixed(3);
          return row;
        });

        const wb = XLSX.utils.book_new();
        if (histRows.length) {
          const wsHist = XLSX.utils.json_to_sheet(histRows);
          XLSX.utils.book_append_sheet(wb, wsHist, 'Historial Cargas');
        }
        if (measRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(measRows), 'Inspecciones');
        if (recRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recRows), 'Resumen');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eqRows), 'Equipos');
        XLSX.writeFile(wb, `${slugify(node.name)}-datos.xlsx`);
        toast('Excel generado', 'success');
      };

      const tc = NODE_TYPES[node.type] || { label: '—', color: '#64748b' };
      const filtered = filterType === 'all' ? records : records.filter(r => r.type === filterType);
      const canWrite = ['tecnico', 'admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) ||
        (userProfile?.email || '').toLowerCase().includes('robert') ||
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') ||
        (userProfile?.name || '').toLowerCase().includes('robert');

      if (subView === 'newRecord') return <RecordForm nodeId={node.id} nodeName={node.name} equipment={equipment} userProfile={userProfile} onSave={() => setSubView('main')} onCancel={() => setSubView('main')} toast={toast} />;
      if (subView === 'recordDetail' && selRecord) return <RecordDetail record={selRecord} nodeId={node.id} nodeName={node.name} equipment={equipment} userProfile={userProfile} onBack={() => setSubView('main')} toast={toast} />;

      const saveEditEq = async (data) => {
        try {
          const updateData = { ...data };
          if (typeof updateData.notes === 'string') updateData.notes = sanitize(updateData.notes);
          if (typeof updateData.capacity === 'string') updateData.capacity = sanitize(updateData.capacity);
          if (typeof updateData.phases === 'string') updateData.phases = sanitize(updateData.phases);
          if (typeof updateData.voltage === 'string') updateData.voltage = sanitize(updateData.voltage);
          if (typeof updateData.voltageDC === 'string') updateData.voltageDC = sanitize(updateData.voltageDC);
          if (typeof updateData.serial === 'string') updateData.serial = sanitize(updateData.serial);
          if (typeof updateData.tag === 'string') updateData.tag = sanitize(updateData.tag);
          if (typeof updateData.batteryType === 'string') updateData.batteryType = sanitize(updateData.batteryType);
          if (typeof updateData.batCapacity === 'string') updateData.batCapacity = sanitize(updateData.batCapacity);
          if (typeof updateData.batCount === 'string') updateData.batCount = sanitize(updateData.batCount);
          if (typeof updateData.batCellType === 'string') updateData.batCellType = sanitize(updateData.batCellType);

          if (!updateData.notes || (typeof updateData.notes === 'string' && updateData.notes.trim() === '')) {
            updateData.notes = firebase.firestore.FieldValue.delete();
          }
          if (!updateData.batCapacity || String(updateData.batCapacity).trim() === '') {
            updateData.batCapacity = firebase.firestore.FieldValue.delete();
          }
          if (!updateData.batCount || String(updateData.batCount).trim() === '') {
            updateData.batCount = firebase.firestore.FieldValue.delete();
          }
          // For GEN: preserve capacity and phases, sync horometer & mtto
          if (editEq.type === 'GEN') {
            if (!updateData.capacity || String(updateData.capacity).trim() === '') updateData.capacity = firebase.firestore.FieldValue.delete();
            if (!updateData.phases || String(updateData.phases).trim() === '') updateData.phases = firebase.firestore.FieldValue.delete();
            if (updateData.horometer !== undefined) {
              try {
                const ch = JSON.parse(localStorage.getItem('airtek_plant_horometers_v1') || '{}');
                ch[editEq.tag] = {
                  ...(ch[editEq.tag] || {}),
                  horometro_actual: updateData.horometer,
                  horometro_mtto: updateData.lastMaintenanceHorometer,
                  updatedAt: new Date().toISOString()
                };
                localStorage.setItem('airtek_plant_horometers_v1', JSON.stringify(ch));
              } catch(e) {}
              try {
                const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                const idx = tk.findIndex(t => t.tag === editEq.tag);
                if (idx !== -1) {
                  tk[idx].horometro_actual = updateData.horometer;
                  localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
                }
              } catch(e) {}
              window.dispatchEvent(new CustomEvent('airtek_horo_updated', {
                detail: { plantTag: editEq.tag, horometer: updateData.horometer, lastMaint: updateData.lastMaintenanceHorometer }
              }));
            }
          }
          await db.collection('energy_nodes').doc(node.id).collection('energy_equipment').doc(editEq.id).update(updateData);
          toast('Equipo actualizado.', 'success');
          setEditEq(null);
        } catch (e) { toast('Error al guardar.', 'error'); }
      };

      return (
        <div className="fin">
          {qrOpen && <QRModal node={node} onClose={() => setQrOpen(false)} />}
          {editEq && <EditEqModal eq={editEq} userProfile={userProfile} onSave={saveEditEq} onClose={() => setEditEq(null)} 
            onDelete={async (id) => {
              try {
                await db.collection('energy_nodes').doc(node.id).collection('energy_equipment').doc(id).delete();
                toast('Equipo eliminado.', 'success');
                setEditEq(null);
              } catch (e) { toast('Error: ' + e.message, 'error'); }
            }} 
          />}

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 22, flexShrink: 0 }}>←</button>
              <div>
                <h2 className="fd" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tx1)', lineHeight: 1.2 }}>{node.name}</h2>
                <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="badge" style={{ background: tc.color + '22', color: tc.color }}>{tc.label}</span>
                  <span style={{ color: 'var(--tx3)', fontSize: '.8rem' }}><IconMapPin size={14} />{node.zone}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="bs" style={{ padding: '6px 12px', fontSize: '.78rem' }} onClick={() => setQrOpen(true)}>QR</button>
              {canWrite && <button className="bp" style={{ padding: '7px 14px', fontSize: '.8rem' }} onClick={() => setSubView('newRecord')}>+ Registro</button>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Equipos Activos', val: equipment.filter(e => e.active !== false).length, c: '#008000' },
              { label: 'Registros', val: records.length, c: '#0166ff' },
              { label: 'Última Visita', val: records[0] ? fmtDate(records[0].date) : '—', c: '#0166ff', sm: true },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 13px' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: "'Outfit', 'Montserrat', sans-serif", marginBottom: 4 }}>{s.label}</div>
                <div className={s.sm ? '' : 'fm'} style={{ fontSize: s.sm ? '.85rem' : '1.4rem', fontWeight: 700, color: s.c }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 16, display: 'flex', overflowX: 'auto' }}>
            {[['equipos', 'Equipos'], ['plantas', 'Plantas Eléctricas'], ['historial', 'Historial'], ['cargas', 'Cargas'], ['docs', 'Docs'], ['alertas', 'Alertas'], ['eventos', 'Eventos'], ['exportar', 'Exportar']].map(([k, lbl]) => (
              <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} style={{ whiteSpace: 'nowrap' }}>{lbl}</button>
            ))}
          </div>

          {/* TAB EQUIPOS */}
          {tab === 'equipos' && (
            <div>
              {loading ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 50 }}>Cargando equipos...</div>
                : equipment.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 50 }}>
                    <p style={{ color: 'var(--tx3)', marginBottom: 14 }}>No hay equipos registrados en este nodo.</p>
                    {canWrite && <button className="bp" onClick={() => setSubView('newRecord')}>Registrar Instalación</button>}
                  </div>
                ) : ['active', 'retired'].map(status => {
                  const eqs = sortEquipment(equipment.filter(e => status === 'active' ? e.active !== false : e.active === false));
                  if (!eqs.length) return null;
                  return (
                    <div key={status} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                        {status === 'active' ? 'Activos' : 'Retirados'}
                      </div>
                      {eqs.map(eq => {
                        const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;
                        return (
                          <div key={eq.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)', opacity: status === 'retired' ? .5 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="badge" style={{ background: ti.bg, color: ti.color }}>{eq.type}</span>
                              <span className="fm" style={{ fontSize: '.92rem', fontWeight: 600, color: 'var(--tx1)' }}>{eq.tag}</span>
                              {(eq.type === 'INV' || eq.type === 'ATS' || eq.type === 'BKR') && eq.voltage && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltage}</span>}
                              {eq.type === 'BKR' && eq.phases && <span style={{ color: '#6366f1', fontSize: '.73rem', fontWeight: 600 }}>{eq.phases === '3' || eq.phases === 'Trifásica' ? '3Φ (3 Líneas)' : eq.phases === '1' || eq.phases === 'Monofásica' ? '1Φ (1 Línea)' : '2Φ (2 Líneas)'}</span>}
                              {eq.type === 'BKR' && eq.capacity && <span style={{ color: '#6366f1', fontSize: '.73rem', fontWeight: 700 }}>{eq.capacity}A</span>}
                              {(eq.type === 'BAT' || eq.type === 'ETP') && eq.voltageDC && <span style={{ color: 'var(--tx3)', fontSize: '.74rem' }}>{eq.voltageDC} VDC</span>}
                              {eq.hasAcIn && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>AC/IN</span>}
                              {eq.hasAcOut && <span style={{ color: '#008000', fontSize: '.73rem' }}>AC/OUT</span>}
                              {eq.hasDcOut && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>DC/OUT</span>}
                              {eq.hasSolar && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>{eq.pvCount > 1 ? `PV (${eq.pvCount})` : 'PV'}</span>}
                              {eq.type === 'ETP' && eq.solarRegPercentage && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>{eq.solarRegPercentage}%</span>}
                              {eq.batteryType && eq.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>{eq.batteryType}</span>}
                              {eq.batCapacity && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>{eq.batCapacity}Ah</span>}
                              {eq.batCount && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>
                                {eq.batteryType === 'NMC' ? `${eq.batCount} celdas (${Math.floor(eq.batCount / 7)} bat.)` : `${eq.batCount} bat.`}
                              </span>}
                              {eq.batCellType && eq.batCellType !== 'No aplica' && <span style={{ color: '#64748b', fontSize: '.73rem' }}>{eq.batCellType}</span>}
                              {eq.type === 'GEN' && eq.capacity && <span style={{ color: '#eab308', fontSize: '.73rem', fontWeight: 700 }}>{eq.capacity} KVA</span>}
                              {eq.type === 'GEN' && eq.phases && <span style={{ color: '#eab308', fontSize: '.73rem' }}>{eq.phases === 'Monofásica' ? '1Φ' : '3Φ'} {eq.phases}</span>}
                              {eq.type === 'GEN' && (() => {
                                let list = INITIAL_FUEL_TANKS;
                                try {
                                  const s = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                                  if (s.length > 0) list = s;
                                } catch(e) {}
                                const norm = normalizeNodeName(node.name);
                                const siteTanks = list.filter(t => normalizeNodeName(t.lugar) === norm);
                                const plantTank = siteTanks.find(t => t.tag === eq.tag) || siteTanks[0];
                                const sharedRes = siteTanks.reduce((m, t) => Math.max(m, parseFloat(t.reserva_lts) || 0), 0);
                                const capRes = siteTanks.reduce((m, t) => Math.max(m, parseFloat(t.cap_reserva_lts != null ? t.cap_reserva_lts : t.cap_reserva) || 0), 0);
                                const subAct = plantTank ? (parseFloat(plantTank.subtanque_actual != null ? plantTank.subtanque_actual : plantTank.tanque_lts) || 0) : 0;
                                const subCap = plantTank ? (parseFloat(plantTank.tanque_lts) || 0) : 0;
                                return (
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: 6, 
                                    fontSize: '.72rem', 
                                    fontWeight: 600, 
                                    background: 'rgba(1, 102, 255, 0.08)', 
                                    color: 'var(--blue)', 
                                    padding: '2px 8px', 
                                    borderRadius: 6,
                                    border: '1px solid rgba(1, 102, 255, 0.2)'
                                  }}>
                                    <span>Tanque: <strong>{subAct}/{subCap}L</strong></span>
                                    {capRes > 0 && <span>| Reserva: <strong style={{ color: sharedRes > 0 ? '#10b981' : '#ef4444' }}>{sharedRes}/{capRes}L</strong></span>}
                                  </span>
                                );
                              })()}
                              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--tx4)', fontSize: '.72rem' }}>{fmtDate(eq.installedAt)}</span>
                                {canWrite && <button onClick={() => setEditEq(eq)}
                                  style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--tx3)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '.72rem', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                                  Editar
                                </button>}
                              </span>
                            </div>
                            {eq.notes && <div style={{ marginTop: 6, fontSize: '.78rem', color: 'var(--tx3)' }}>{eq.notes}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}

          {/* TAB PLANTAS */}
          {tab === 'plantas' && <NodePlantas nodeId={node.id} nodeName={node.name} nodeType={node.type} equipment={equipment} records={records} userProfile={userProfile} toast={toast} onSubViewChange={setSubView} setSelRecord={setSelRecord} />}

          {/* TAB CARGAS */}
          {tab === 'cargas' && <LoadChart records={records} equipment={equipment} onExport={exportXLSX} />}

          {/* TAB DOCS */}
          {tab === 'docs' && <NodeDocs nodeId={node.id} userProfile={userProfile} toast={toast} />}

          {/* TAB HISTORIAL */}
          {tab === 'historial' && (
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {['all', ...Object.keys(REC_TYPES)].map(k => {
                  const rt = REC_TYPES[k];
                  const active = filterType === k;
                  return (
                    <button key={k} onClick={() => setFilterType(k)}
                      style={{
                        padding: '4px 10px', borderRadius: 5, border: '1px solid', fontSize: '.74rem', cursor: 'pointer', fontFamily: "'Outfit', 'Montserrat', sans-serif", fontWeight: 600, transition: 'all .15s',
                        background: active ? (k === 'all' ? '#26262a' : (rt?.color || '#64748b')) : 'transparent',
                        borderColor: k === 'all' ? '#323236' : (rt?.color || '#64748b'),
                        color: active ? '#fff' : (k === 'all' ? 'var(--tx3)' : (rt?.color || '#64748b'))
                      }}>
                      {k === 'all' ? 'Todos' : rt.label}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0
                ? <div style={{ textAlign: 'center', padding: 40 }}><p style={{ color: 'var(--tx3)' }}>No hay registros{filterType !== 'all' ? ' de este tipo' : ''}.</p></div>
                : filtered.map(r => {
                  const rt = REC_TYPES[r.type] || { label: r.type, icon: '', color: '#64748b' };
                  return (
                    <div key={r.id} className="card rrow" style={{ marginBottom: 8, border: '1px solid var(--border)' }}
                      onClick={() => { setSelRecord(r); setSubView('recordDetail'); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            
                            <span className="fd" style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--tx1)' }}>{rt.label}</span>
                            
                          </div>
                          <div style={{ fontSize: '.8rem', color: 'var(--tx3)' }}>{r.technicianName} · {fmtDate(r.date)}</div>
                          {r.observations && <div style={{ fontSize: '.76rem', color: 'var(--tx4)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{r.observations}</div>}
                        </div>
                        <span style={{ color: 'var(--border-bright)', fontSize: 20 }}>›</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* TAB ALERTAS */}
          {tab === 'alertas' && <NodeAlerts nodeId={node.id} nodeName={node.name} userProfile={userProfile} toast={toast} />}

          {/* TAB EVENTOS */}
          {tab === 'eventos' && <NodeEvents nodeId={node.id} nodeName={node.name} userProfile={userProfile} toast={toast} />}

          {confirmModal && (
            <ConfirmModal
              title={confirmModal.title}
              msg={confirmModal.msg}
              type={confirmModal.type}
              confirmText={confirmModal.confirmText}
              cancelText={confirmModal.cancelText}
              onConfirm={async () => {
                const fn = confirmModal.onConfirm;
                setConfirmModal(null);
                if (fn) await fn();
              }}
              onCancel={() => {
                const fn = confirmModal.onCancel;
                setConfirmModal(null);
                if (fn) fn();
              }}
            />
          )}

          {/* TAB EXPORTAR */}
          {tab === 'exportar' && (
            <div>
              <p style={{ color: 'var(--tx3)', fontSize: '.9rem', marginBottom: 20 }}>Exporta toda la información registrada de este nodo.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {[
                  { label: 'PDF', desc: 'Reporte completo con mediciones, equipos e historial', fn: exportPDF, cls: 'bs', renderIcon: () => <IconPdf size={26} color="#ef4444" />, badgeBg: 'rgba(239, 68, 68, 0.12)' },
                  { label: 'Excel', desc: 'Tablas separadas: registros y equipos para análisis', fn: exportXLSX, cls: 'bs', renderIcon: () => <IconExcel size={26} color="#10b981" />, badgeBg: 'rgba(16, 185, 129, 0.12)' },
                ].map(x => (
                  <div key={x.label} className="card" style={{ textAlign: 'center', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ width: 54, height: 54, borderRadius: '50%', background: x.badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        {x.renderIcon()}
                      </div>
                      <div className="fd" style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--tx1)', marginBottom: 6 }}>{x.label}</div>
                      <div style={{ color: 'var(--tx3)', fontSize: '.8rem', marginBottom: 20, maxWidth: 300, lineHeight: 1.4 }}>{x.desc}</div>
                    </div>
                    <button className={x.cls} style={{ width: 'auto', minWidth: 160, padding: '9px 24px', fontSize: '.84rem' }} onClick={x.fn}>
                      Descargar {x.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    //  LISTA DE NODOS (DASHBOARD PRINCIPAL)
    // ═══════════════════════════════════════════════════
    
    function IconSliders({ size = 18, color = "currentColor" }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
    }

    function NodeList({ userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [nodes, setNodes] = useState([]);
      const [loading, setLoading] = useState(true);
      const [sel, setSel] = useState(null);
      const [search, setSearch] = useState('');
      const [fType, setFType] = useState('all');
      const [showFilters, setShowFilters] = useState(false);
      const [fState, setFState] = useState('all');
      const [activeInspection, setActiveInspection] = useState(() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          return s ? JSON.parse(s) : null;
        } catch { return null; }
      });

      // Refrescar estado de borrador al volver a la pestaña
      useEffect(() => {
        const updateActive = () => {
          try {
            const s = localStorage.getItem('airtek_active_inspection');
            setActiveInspection(s ? JSON.parse(s) : null);
          } catch {}
        };
        window.addEventListener('focus', updateActive);
        document.addEventListener('visibilitychange', updateActive);
        return () => {
          window.removeEventListener('focus', updateActive);
          document.removeEventListener('visibilitychange', updateActive);
        };
      }, []);

      const resumeInspection = () => {
        if (!activeInspection) return;
        const node = nodes.find(n => n.id === activeInspection.nodeId);
        if (node) {
          setSel(node);
        } else {
          toast('No se encontró el nodo del borrador', 'warn');
        }
      };

      const discardActiveInspection = () => {
        try {
          if (activeInspection?.key) localStorage.removeItem(activeInspection.key);
          localStorage.removeItem('airtek_active_inspection');
          setActiveInspection(null);
          toast('Borrador descartado', 'info');
        } catch (e) {}
      };

      const isFiltered = search !== '' || fState !== 'all' || fType !== 'all';

      const resetFilters = () => {
        setSearch('');
        setFState('all');
        setFType('all');
      };

      useEffect(() => {
        const u = db.collection('energy_nodes').where('active', '==', true).onSnapshot(s => {
          setNodes(s.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
        return u;
      }, []);

      // Deep link via ?node=id
      useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const nid = p.get('node');
        if (nid && nodes.length > 0) { const n = nodes.find(n => n.id === nid); if (n) setSel(n); }
      }, [nodes]);

      // Vercel Best Practice: rerender-use-deferred-value & rerender-memo - Keeps typing responsive and caches results
      const deferredSearch = useDeferredValue(search);

      const normalizeLoc = useCallback((loc) => {
        const l = (loc || '').trim().toLowerCase();
        if (l === 'falcon' || l === 'falcón') return 'Falcón';
        if (l === 'lara') return 'Lara';
        if (l === 'colombia') return 'Colombia';
        return 'Zulia';
      }, []);

      const filtered = useMemo(() => {
        const q = (deferredSearch || '').toLowerCase().trim();
        const fStateLow = fState.toLowerCase();
        return nodes.filter(n => {
          if (q) {
            const nameMatch = (n.name || '').toLowerCase().includes(q);
            const zoneMatch = (n.zone || '').toLowerCase().includes(q);
            if (!nameMatch && !zoneMatch) return false;
          }
          if (fType !== 'all' && n.type !== fType) return false;
          if (fState === 'all') return true;

          const loc = normalizeLoc(n.estado);
          if (fState === 'Venezuela') return loc !== 'Colombia';
          if (fState === 'Colombia') return loc === 'Colombia';
          return loc.toLowerCase() === fStateLow || (fStateLow.startsWith('falco') && loc === 'Falcón');
        });
      }, [nodes, deferredSearch, fType, fState, normalizeLoc]);

      if (sel) return <NodeDetail node={sel} userProfile={userProfile} onBack={() => setSel(null)} toast={toast} />;

      return (
        <div className="fin">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="fd" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--tx1)' }}>Sistema de Gestión de Energía</h1>
              <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>{nodes.length} ubicaciones activas registradas en la red</p>
            </div>
          </div>
          {/* Banner de Borrador Activo */}
          {activeInspection && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconChecklist size={22} color="#f59e0b" />
                <div>
                  <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '.92rem' }}>
                    Inspección en progreso: {activeInspection.nodeName}
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                    {activeInspection.formType === 'plant' ? `Planta ${activeInspection.plantTag}` : 'Inspección general de equipos'} · Guardado local {activeInspection.savedAt ? new Date(activeInspection.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bp" style={{ padding: '8px 16px', fontSize: '.82rem' }} onClick={resumeInspection}>
                  Continuar Inspección →
                </button>
                <button className="bs" style={{ padding: '8px 12px', fontSize: '.82rem', borderColor: 'rgba(239,68,68,.4)', color: '#ef4444' }} onClick={discardActiveInspection}>
                  Descartar
                </button>
              </div>
            </div>
          )}

          {/* Search Bar & Filter Button (Only Filter Button Visible Initially) */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--tx3)', display: 'flex', alignItems: 'center', pointerEvents: 'none'
              }}>
                <IconSearch size={17} />
              </span>
              <input 
                className="fi" 
                style={{ paddingLeft: 40, paddingRight: search ? 36 : 14, borderRadius: 24, height: 42 }} 
                placeholder="Buscar Datacenter, nodo o sede..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              title="Filtros de búsqueda"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: (showFilters || isFiltered) ? 'rgba(1, 102, 255, 0.12)' : 'var(--bg-surface)',
                border: '1px solid',
                borderColor: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--border)',
                color: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--tx2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <IconSliders size={19} />
            </button>
          </div>

          {/* Expandable Filter Drawer */}
          {(showFilters || isFiltered) && (
            <div 
              className="fin"
              style={{ 
                marginBottom: 20, 
                padding: '14px 16px', 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border)', 
                borderRadius: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 14, 
                flexWrap: 'wrap' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Ubicación:</span>
                <select 
                  className="fi" 
                  style={{ width: 180, borderRadius: 20, height: 38, padding: '0 12px' }} 
                  value={fState} 
                  onChange={e => setFState(e.target.value)}
                >
                  <option value="all">Todas las ubicaciones</option>
                  <optgroup label="Venezuela">
                    <option value="Venezuela">Toda Venezuela</option>
                    <option value="Zulia">Zulia</option>
                    <option value="Falcón">Falcón</option>
                    <option value="Lara">Lara</option>
                  </optgroup>
                  <optgroup label="Colombia">
                    <option value="Colombia">Colombia</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Tipo:</span>
                <div className="segmented-control">
                  {['all', ...Object.keys(NODE_TYPES)].map(t => {
                    const nt = NODE_TYPES[t];
                    const on = fType === t;
                    return (
                      <button 
                        key={t} 
                        onClick={() => setFType(t)}
                        className={`segmented-btn ${on ? 'active' : ''}`}
                      >
                        {t === 'all' ? 'Todos los nodos' : nt.label.toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isFiltered && (
                <button
                  onClick={resetFilters}
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(245, 91, 93, 0.1)',
                    border: '1px solid rgba(245, 91, 93, 0.3)',
                    color: '#f55b5d',
                    fontSize: '.78rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  Limpiar filtro
                </button>
              )}
            </div>
          )}
          {loading ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>Cargando nodos...</div>
            : filtered.length === 0 ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>No se encontraron nodos.</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
                  {filtered.map(n => {
                    const tc = NODE_TYPES[n.type] || { label: '—', color: '#64748b' };
                    return (
                      <div key={n.id} className="card ncard" style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
                        onClick={() => setSel(n)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <span className="badge" style={{ background: tc.color + '22', color: tc.color }}>{tc.label}</span>
                          <span style={{ color: 'var(--border-bright)', fontSize: 20 }}>›</span>
                        </div>
                        <div className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)', marginBottom: 4, lineHeight: 1.3 }}>{n.name}</div>
                        <div style={{ color: 'var(--tx4)', fontSize: '.8rem' }}><IconMapPin size={14} />{n.zone}</div>
                      </div>
                    );
                  })}
                </div>
              )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // AGREGAR USUARIO EXISTENTE
    // ═══════════════════════════════════════════════════

export default NodeList;
export {
  NodeList, NodeDetail, NodePlantas, RecordForm, RecordDetail,
  ReportModal, QRModal, EqMeasurements, EditEqModal, NodeDocs,
  NodeAlerts, NodeEvents, PlantRecordForm, CalibrateHoroModal,
  PlantCard, MeasurementDisplayCard, LoadChart
};
