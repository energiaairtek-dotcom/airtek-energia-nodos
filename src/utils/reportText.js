import { sortEquipment, groupByBank } from '@/utils/energyCalculations';
import { DIAS_ES, FIELD_LABELS, FIELD_UNITS } from '@/modules/nodes/fieldLabels';

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

export { generateReportText };
export default generateReportText;
