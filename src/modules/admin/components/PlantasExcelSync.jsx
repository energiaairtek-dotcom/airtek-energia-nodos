import React, { useState, useEffect } from 'react';
import { db, TS } from '@/services/firebase';
import { loadXLSX } from '@/utils/exportLibs';
import { sanitize, parseHours, formatHHMMSS } from '@/utils/formatters';

function PlantasExcelSync({ nodes, toast, userProfile }) {
      const [loading, setLoading] = useState(false);
      const [log, setLog] = useState([]);

      const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setLog(["Leyendo archivo Excel..."]);

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const data = evt.target.result;
            const XLSX = await loadXLSX();
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames.find(n => n.includes('MANTTO 2026')) || workbook.SheetNames[0];
            setLog(prev => [...prev, `Hoja seleccionada: "${sheetName}"`]);
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

            let headerIdx = -1;
            for (let r = 0; r < rows.length; r++) {
              if (rows[r]) {
                const hasPlanta = rows[r].some(cell => String(cell || '').toLowerCase().includes('planta'));
                const hasFuncionamiento = rows[r].some(cell => String(cell || '').toLowerCase().includes('funcionamiento'));
                if (hasPlanta && hasFuncionamiento) {
                  headerIdx = r;
                  break;
                }
              }
            }

            if (headerIdx === -1) {
              setLog(prev => [...prev, "Error: No se encontró la fila de cabecera con las columnas 'planta' y 'horas de funcionamiento'."]);
              setLoading(false);
              return;
            }

            const headers = rows[headerIdx].map(h => String(h || '').trim().toLowerCase());
            const colPlanta = headers.findIndex(h => h.includes('planta'));
            const colHoras = headers.findIndex(h => h.includes('funcionamiento')); // horas de funcionamiento al momento del cambio
            const colProximo = headers.findIndex(h => h.includes('proximo') || h.includes('próximo') || h.includes('cabio') || h.includes('cambio')); // proximo cabio de aceite
            const colTrabajadas = headers.findIndex(h => h.includes('trabajadas')); // horas trabajadas

            if (colPlanta === -1 || colHoras === -1) {
              setLog(prev => [...prev, "Error: Faltan las columnas requeridas 'planta' o 'horas de funcionamiento...'."]);
              setLoading(false);
              return;
            }

            const excelData = [];
            for (let r = headerIdx + 1; r < rows.length; r++) {
              const row = rows[r];
              if (!row || !row[colPlanta]) continue;
              const name = String(row[colPlanta]).trim();
              const lastMaintH = parseHours(row[colHoras]);
              const nextMaintH = colProximo !== -1 ? parseHours(row[colProximo]) : 0;
              const currentH = colTrabajadas !== -1 ? parseHours(row[colTrabajadas]) : lastMaintH;
              if (lastMaintH > 0 || currentH > 0) {
                excelData.push({ name, lastMaintH, nextMaintH, currentH });
              }
            }

            setLog(prev => [...prev, `Encontradas ${excelData.length} plantas con registros en Excel. Iniciando comparación...`]);

            let updatedCount = 0;
            let logBuffer = [];

            for (const n of nodes) {
              const nId = n.id;
              const nName = n.name || '';
              
              const equipSnap = await db.collection('energy_nodes').doc(nId).collection('energy_equipment')
                .where('type', '==', 'GEN').get();

              for (const eqDoc of equipSnap.docs) {
                const eqData = eqDoc.data();
                if (eqData.active === false) continue;
                const tag = (eqData.tag || '').trim().toLowerCase();
                const serial = (eqData.serial || '').trim().toLowerCase();

                const match = excelData.find(u => {
                  const uName = u.name.toLowerCase();
                  return tag === uName || tag.includes(uName) || uName.includes(tag) ||
                         (serial && (serial === uName || serial.includes(uName) || uName.includes(serial))) ||
                         (nName.toLowerCase().includes(uName) || uName.includes(nName.toLowerCase()));
                });

                if (match) {
                  const oldHorometer = parseFloat(eqData.horometer) || 0;
                  const oldLastMaint = parseFloat(eqData.lastMaintenanceHorometer) || 0;
                  const interval = parseFloat(eqData.maintenanceInterval) || 250;
                  const newInterval = match.nextMaintH > match.lastMaintH ? Math.round(match.nextMaintH - match.lastMaintH) : interval;

                  const updateObj = {
                    lastMaintenanceHorometer: match.lastMaintH,
                    maintenanceInterval: newInterval
                  };

                  let horometerUpdated = false;
                  if (!eqData.horometer || oldHorometer < match.currentH) {
                    updateObj.horometer = match.currentH;
                    horometerUpdated = true;
                  }

                  await db.collection('energy_nodes').doc(nId).collection('energy_equipment').doc(eqDoc.id).update(updateObj);
                  updatedCount++;
                  
                  let logMsg = `Match: Excel "${match.name}" -> BD Tag "${eqData.tag}" (Nodo: ${nName}). `;
                  logMsg += `Último Mantt: ${formatHHMMSS(oldLastMaint)} -> ${formatHHMMSS(match.lastMaintH)}. `;
                  if (horometerUpdated) {
                    logMsg += `Horómetro: ${formatHHMMSS(oldHorometer)} -> ${formatHHMMSS(match.currentH)}. `;
                  } else {
                    logMsg += `Horómetro: ${formatHHMMSS(oldHorometer)} (sin cambios, Excel: ${formatHHMMSS(match.currentH)}). `;
                  }
                  logMsg += `Intervalo: ${newInterval}H.`;
                  logBuffer.push(logMsg);
                }
              }
            }

            setLog(prev => [
              ...prev,
              ...logBuffer,
              `Sincronización completada: ${updatedCount} plantas eléctricas actualizadas exitosamente en Firebase.`
            ]);
            toast(`Sincronización finalizada. ${updatedCount} plantas actualizadas.`, 'success');

          } catch (err) {
            console.error(err);
            setLog(prev => [...prev, `Error: ${err.message}`]);
            toast('Error al sincronizar plantas.', 'error');
          } finally {
            setLoading(false);
          }
        };
        reader.readAsBinaryString(file);
      };

      return (
        <div className="card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--amber)', marginBottom: 10 }}>
            Sincronizar Mantenimientos desde Excel
          </h3>
          <p style={{ color: 'var(--tx2)', fontSize: '.82rem', marginBottom: 16 }}>
            Selecciona el archivo <code className="fm">MANTTO DE LAS PLANTAS.xlsx</code> para sincronizar automáticamente el horómetro actual y del último mantenimiento de la hoja <code className="fm">MANTTO 2026</code>.
          </p>

          <div style={{ marginBottom: 18 }}>
            <label className="bp" style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: '.85rem' }}>
              {loading ? 'Procesando...' : 'Cargar Excel'}
              <input type="file" accept=".xlsx" onChange={handleImport} disabled={loading} style={{ display: 'none' }} />
            </label>
          </div>

          {log.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, maxHeight: 300, overflowY: 'auto' }}>
              <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Historial de Sincronización</div>
              {log.map((line, idx) => (
                <div key={idx} className="fm" style={{ fontSize: '.76rem', color: line.startsWith('Error:') ? 'var(--red)' : line.startsWith('Sincronización') ? 'var(--green)' : 'var(--tx2)', marginBottom: 4, lineHeight: 1.4 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

export { PlantasExcelSync };
export default PlantasExcelSync;
