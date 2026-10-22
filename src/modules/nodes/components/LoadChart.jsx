import React from 'react';
import { IconExcel } from '@/components/icons';
import { getBankId, getEqTypeFromTag, calcLoad, calcAutonomy, fmtHours } from '@/utils/energyCalculations';
import { BAT_VN } from '@/config/constants';
    function LoadChart({ records, equipment, onExport }) {
      const [selBank, setSelBank] = React.useState('_total');

      const inspRecords = records
        .filter(r => (r.type === 'inspeccion' || r.type === 'actualizacion_carga') && r.measurements && Object.keys(r.measurements).length > 0)
        .slice().reverse();

      if (inspRecords.length === 0) return (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--tx3)' }}>
          <p>Aún no hay mediciones de carga registradas en este nodo.</p>
        </div>
      );

      const lastRec = inspRecords[inspRecords.length - 1];

      // Bancos presentes en la última inspección o en el inventario de baterías activo
      const allBanks = new Set();
      if (lastRec?.measurements) {
        Object.keys(lastRec.measurements).forEach(tag => { const b = getBankId(tag); if (b) allBanks.add(b); });
      }
      (equipment || []).forEach(e => {
        if (e.type === 'BAT' && e.active !== false) {
          const b = getBankId(e.tag);
          if (b) allBanks.add(b);
        }
      });
      const bankList = ['_total', ...Array.from(allBanks).sort()];

      // Series para gráfico
      const series = inspRecords.map(r => {
        const d = r.date?.toDate ? r.date.toDate() : new Date(r.date);
        const label = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
        let total = 0; const bankLoads = {};
        Object.entries(r.measurements).forEach(([tag, vals]) => {
          const type = getEqTypeFromTag(tag, equipment);
          const load = calcLoad(type, vals);
          const aggLoad = load.ac + load.dc;
          total += aggLoad;
          const bank = getBankId(tag); if (bank) bankLoads[bank] = (bankLoads[bank] || 0) + aggLoad;
        });
        return { label, date: d, total: parseFloat(total.toFixed(2)), ...bankLoads };
      });

      const dataKey = selBank === '_total' ? 'total' : selBank;
      const dataColor = selBank === '_total' ? '#008000' : '#0166ff';
      const maxVal = Math.max(...series.map(s => parseFloat(s[dataKey]) || 0), 0.1);
      const barW = Math.max(6, Math.min(20, 600 / Math.max(series.length, 1) - 3));
      const H = 110;

      // Calcular autonomía de todos los bancos con la última inspección
      const bankAutonomies = Array.from(allBanks).sort().map(bank => {
        const bankLoad = Object.entries(lastRec.measurements || {}).reduce((sum, [tag, vals]) => {
          if (getBankId(tag) !== bank) return sum;
          const type = getEqTypeFromTag(tag, equipment);
          const ld = calcLoad(type, vals);
          return { ac: sum.ac + ld.ac, dc: sum.dc + ld.dc };
        }, { ac: 0, dc: 0 });
        const batEq = equipment.find(e => e.type === 'BAT' && getBankId(e.tag) === bank);
        const aut = calcAutonomy(batEq, bankLoad.ac, bankLoad.dc);
        return { bank, bankLoad: (bankLoad.ac + bankLoad.dc), acLoad: bankLoad.ac, dcLoad: bankLoad.dc, batEq, aut };
      }).filter(x => x.bankLoad > 0 || x.batEq);

      return (
        <div className="fin">

          {/* ── AUTONOMÍA POR BANCO ── */}
          {bankAutonomies.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: "'Outfit', 'Montserrat', sans-serif", marginBottom: 10 }}>
                 Autonomía por Banco — última inspección
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                {bankAutonomies.map(({ bank, bankLoad, acLoad, dcLoad, batEq, aut }) => {
                  const autColor = !aut ? '#64748b' : aut > 4 ? '#008000' : aut > 2 ? '#0166ff' : '#f55b5d';
                  const cap = batEq?.batCapacity || null;
                  const type = batEq?.batteryType || '—';
                  const Vn = BAT_VN[type] || 48;
                  return (
                    <div key={bank} style={{ background: 'var(--bg-surface)', borderRadius: 9, padding: '13px 14px', border: `1px solid ${autColor}44` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <span className="badge" style={{ background: 'rgba(33, 192, 250,.15)', color: '#21c0fa', marginBottom: 4, display: 'block' }}>Banco {bank}</span>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>
                            {cap ? cap + ' Ah' : '—'} · {type} · {Vn}V
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="fm" style={{ fontSize: '1.4rem', fontWeight: 800, color: autColor, lineHeight: 1 }}>{fmtHours(aut)}</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 2 }}>autonomía</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: '.74rem' }}>
                        <span style={{ color: 'var(--tx3)' }}>Σ: <span className="fm" style={{ color: '#0166ff', fontWeight: 700 }}>{bankLoad > 0 ? bankLoad.toFixed(2) + ' kW' : '—'}</span></span>
                        {bankLoad > 0 && <span style={{ color: 'var(--tx3)' }}>(AC:<span className="fm" style={{ color: '#008000' }}>{acLoad?.toFixed(1)}</span> DC:<span className="fm" style={{ color: '#0166ff' }}>{dcLoad?.toFixed(1)}</span>)</span>}
                        {!batEq && <span style={{ color: '#f55b5d', fontSize: '.68rem' }}>Sin banco</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 8 }}>
                t = (Vn × Cap × SoH × DoD × η) / ( (CargaAC/eInv) + (CargaDC/eReg) ) &nbsp;·&nbsp; Verde &gt;4h · Amarillo 2-4h · Rojo &lt;2h
              </div>
            </div>
          )}

          {/* ── SELECTOR DE BANCO PARA EL GRÁFICO ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {bankList.map(b => (
                <button key={b} onClick={() => setSelBank(b)}
                  style={{
                    padding: '4px 11px', borderRadius: 5, border: '1px solid', fontSize: '.74rem', cursor: 'pointer',
                    fontFamily: "'Outfit', 'Montserrat', sans-serif", fontWeight: 600, transition: 'all .15s',
                    background: selBank === b ? (b === '_total' ? '#008000' : '#0166ff') : 'transparent',
                    borderColor: b === '_total' ? '#008000' : '#0166ff',
                    color: selBank === b ? '#000' : (b === '_total' ? '#008000' : '#0166ff')
                  }}>
                  {b === '_total' ? 'Total Nodo' : 'Banco ' + b}
                </button>
              ))}
            </div>
            {onExport && (
              <button onClick={onExport} className="bs" style={{ padding: '5px 12px', fontSize: '.74rem', color: '#008000', border: '1px solid rgba(0, 128, 0,.35)' }}>
                <IconExcel size={14} /> Exportar Excel
              </button>
            )}
          </div>

          {/* ── GRÁFICO TIPO LÍNEA DE ÁREA / LÍNEA CON PUNTOS (Full Width Card Responsive) ── */}
          {(() => {
            const chartW = Math.max(600, series.length * 42);
            const xStart = 45;
            const xEnd = chartW - 25;
            const count = series.length;
            const slotW = count > 1 ? (xEnd - xStart) / (count - 1) : 0;
            
            // Calculate coordinates for points
            const points = series.map((s, i) => {
              const val = parseFloat(s[dataKey]) || 0;
              const bh = (val / maxVal) * (H - 20);
              const x = count === 1 ? (xStart + xEnd) / 2 : xStart + slotW * i;
              const y = H - bh;
              return { x, y, val, label: s.label };
            });

            // SVG Path strings for line and area fill
            const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
            const areaPoints = points.length > 0 
              ? `${points[0].x},${H} ${polylinePoints} ${points[points.length - 1].x},${H}` 
              : '';

            return (
              <div className="card" style={{ padding: '20px 18px 14px', overflowX: 'auto', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.75rem', color: 'var(--tx2)', fontFamily: "'Outfit', 'Montserrat', sans-serif", textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 16, fontWeight: 700 }}>
                  Historial carga (kW) — {selBank === '_total' ? 'Total Nodo' : 'Banco ' + selBank}
                </div>
                <svg viewBox={`0 0 ${chartW} ${H + 40}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={dataColor} stopOpacity="0.35" />
                      <stop offset="100%" stopColor={dataColor} stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Rejilla de Fondo Horizontal Plana */}
                  {[0, 0.25, 0.5, 0.75, 1].map(p => {
                    const yPos = H - H * p;
                    return (
                      <g key={p}>
                        <line x1={xStart - 10} y1={yPos} x2={xEnd} y2={yPos} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray={p > 0 && p < 1 ? "4,4" : ""} />
                        <text x={xStart - 15} y={yPos + 3} fill="var(--tx4)" fontSize="8.5" fontFamily="JetBrains Mono" textAnchor="end" fontWeight="500">
                          {(maxVal * p).toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Relleno de Área bajo la curva (Si hay 2 o más puntos) */}
                  {count > 1 && (
                    <polygon points={areaPoints} fill="url(#areaGradient)" />
                  )}

                  {/* Línea Principal del Gráfico */}
                  {count > 1 && (
                    <polyline points={polylinePoints} fill="none" stroke={dataColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  )}

                  {/* Puntos de Medición y Valores */}
                  {points.map((p, i) => (
                    <g key={i} className="hover-col">
                      {/* Punto brillante más discreto */}
                      <circle cx={p.x} cy={p.y} r={count > 12 ? "2.5" : "3.5"} fill="var(--bg-card)" stroke={dataColor} strokeWidth={count > 12 ? "1.2" : "1.8"} />
                      <circle cx={p.x} cy={p.y} r={count > 12 ? "1" : "1.5"} fill={dataColor} />
                      
                      {/* Etiqueta de Valor numérico arriba del punto */}
                      {p.val > 0.01 && (
                        <text x={p.x} y={p.y - 9} fill="var(--tx1)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="700">
                          {p.val.toFixed(2)}
                        </text>
                      )}
                      
                      {/* Etiqueta de Fecha en el eje X */}
                      <text x={p.x} y={H + 16} fill="var(--tx3)" fontSize="7.5" textAnchor="middle" fontFamily="JetBrains Mono">{p.label}</text>
                    </g>
                  ))}
                </svg>
              </div>
            );
          })()}

          {/* ── TABLA HISTÓRICO ── */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-surface)' }}>
                  {['Fecha', 'Carga (kW)', 'Variación'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', color: 'var(--tx2)', fontFamily: "'Outfit', 'Montserrat', sans-serif", fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: h === 'Fecha' ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((s, i, arr) => {
                  const cur = parseFloat(s[dataKey]) || 0;
                  const prev = arr[i + 1] ? parseFloat(arr[i + 1][dataKey]) || 0 : null;
                  const diff = prev !== null ? cur - prev : null;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', transition: 'background .2s' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--tx2)', fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>{s.label}</td>
                      <td style={{ padding: '10px 12px', color: '#008000', fontFamily: "'JetBrains Mono',monospace", textAlign: 'right', fontWeight: 800, fontSize: '.85rem' }}>{cur.toFixed(2)}</td>
                      <td style={{
                        padding: '10px 12px', textAlign: 'right', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                        color: diff === null ? 'var(--tx4)' : diff > 0.2 ? '#f55b5d' : diff < -0.2 ? '#008000' : 'var(--tx3)'
                      }}>
                        {diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(2) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }



    // ═══════════════════════════════════════════════════
    // HISTORIAL DE EVENTOS / EVENTUALIDADES DEL NODO

export { LoadChart };
export default LoadChart;
