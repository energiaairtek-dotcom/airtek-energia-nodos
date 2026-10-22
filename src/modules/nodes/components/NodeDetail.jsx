import { useState, useEffect } from 'react';
import firebase, { db } from '@/services/firebase';
import { RecordForm } from '@/modules/nodes/components/RecordForm';
import { NodePlantas } from '@/modules/nodes/components/NodePlantas';
import { NodeEvents } from '@/modules/nodes/components/NodeEvents';
import { NodeAlerts } from '@/modules/nodes/components/NodeAlerts';
import { NodeDocs } from '@/modules/nodes/components/NodeDocs';
import { LoadChart } from '@/modules/nodes/components/LoadChart';
import { RecordDetail } from '@/modules/nodes/components/RecordDetail';
import { EditEqModal } from '@/modules/nodes/components/EditEqModal';
import { QRModal } from '@/modules/nodes/components/QrModal';

import { loadXLSX, loadJsPDF } from '@/utils/exportLibs';
import { fmtDate, slugify, sanitize, normalizeNodeName } from '@/utils/formatters';
import { NODE_TYPES, EQ_TYPES, REC_TYPES } from '@/config/constants';

import { sortEquipment, getEqTypeFromTag, getBankId, calcLoad, calcAutonomy, fmtHours, groupByBank } from '@/utils/energyCalculations';
import { IconPdf, IconExcel, IconMapPin } from '@/components/icons';
import { INITIAL_FUEL_TANKS } from '@/modules/fuel/fuelUtils';
import { ConfirmModal } from '@/components/common/ConfirmDialog';

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
              } catch {}
              try {
                const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
                const idx = tk.findIndex(t => t.tag === editEq.tag);
                if (idx !== -1) {
                  tk[idx].horometro_actual = updateData.horometer;
                  localStorage.setItem('airtek_fuel_tanks_v13', JSON.stringify(tk));
                }
              } catch {}
              window.dispatchEvent(new CustomEvent('airtek_horo_updated', {
                detail: { plantTag: editEq.tag, horometer: updateData.horometer, lastMaint: updateData.lastMaintenanceHorometer }
              }));
            }
          }
          await db.collection('energy_nodes').doc(node.id).collection('energy_equipment').doc(editEq.id).update(updateData);
          toast('Equipo actualizado.', 'success');
          setEditEq(null);
        } catch { toast('Error al guardar.', 'error'); }
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
                                } catch {}
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

export { NodeDetail };
export default NodeDetail;
