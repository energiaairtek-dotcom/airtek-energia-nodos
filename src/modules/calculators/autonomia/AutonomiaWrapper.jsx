import React, { useState, useEffect, useMemo, useRef } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { db } from '@/services/firebase';
import { BAT_VN, BAT_DEFAULTS } from '@/config/constants';
import { IconExcel, IconCopy, IconAlertTriangle, IconCheckCircle } from '@/components/icons';
import { getBankId, calcLoad, getEqTypeFromTag, calcAutonomy, fmtHours } from '@/utils/energyCalculations';

    function AutonomiaInput({ label, val, onChange, unit, small }) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 0, fontFamily: "'Outfit', 'Montserrat', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>
            <span>{label}{unit && <span style={{ color: 'var(--amber)', marginLeft: 3 }}>({unit})</span>}</span>
          </label>
          <input className="mi" type="text" inputMode="decimal" value={val}
            onChange={e => onChange(e.target.value)}
            style={{ fontSize: small ? '.8rem' : '.88rem' }} placeholder="0" />
        </div>
      );
    }

    function AutonomiaCalc() {
      const [bancos, setBancos] = useState([
        { id: 1, tipo: 'LFP', capacidad: '', Vn: '48', SoH: '1.0', DoD: '0.95', ebanco: '0.98', eTemp: '1.0', carga: '', resultado: null }
      ]);

      const addBanco = () => setBancos(prev => [...prev, {
        id: Date.now(), tipo: 'LFP', capacidad: '', Vn: '48', SoH: '1.0', DoD: '0.95', ebanco: '0.98', eTemp: '1.0', carga: '', resultado: null
      }]);

      const removeBanco = id => setBancos(prev => prev.filter(b => b.id !== id));

      const updateBanco = (id, key, val) => setBancos(prev => prev.map(b => {
        if (b.id !== id) return b;
        const nb = { ...b, [key]: val };
        // Auto-fill defaults when type changes
        if (key === 'tipo') {
          const def = BAT_DEFAULTS[val] || BAT_DEFAULTS.LFP;
          const Vn = BAT_VN[val] || 48;
          nb.Vn = String(Vn);
          nb.DoD = String(def.DoD);
          nb.SoH = String(def.SoH);
          nb.ebanco = String(def.ebanco);
        }
        // Recalculate autonomy
        const toNum = s => parseFloat((s || '').toString().replace(',', '.'));
        const cap = toNum(nb.capacidad) || 0;
        const load = toNum(nb.carga) || 0;
        if (cap > 0 && load > 0) {
          const Vn = toNum(nb.Vn) || 48;
          const SoH = toNum(nb.SoH) || 1;
          const DoD = toNum(nb.DoD) || (BAT_DEFAULTS[nb.tipo] || BAT_DEFAULTS.LFP).DoD;
          const eb = toNum(nb.ebanco) || 0.95;
          const eT = toNum(nb.eTemp) || 1;
          const ereg = (BAT_DEFAULTS[nb.tipo] || BAT_DEFAULTS.LFP).ereg;
          nb.resultado = (Vn * cap * SoH * DoD * eb * eT) / (load * 1000 / ereg);
        } else {
          nb.resultado = null;
        }
        return nb;
      }));

      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="fd" style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Calculadora de Autonomía</div>
              <div style={{ fontSize: '.74rem', color: 'var(--tx4)', marginTop: 2 }}>t = (Vn × Cap × SoH × DoD × η) / (Carga_kW × 1000 / ηreg)</div>
            </div>
            <button className="bg" style={{ fontSize: '.8rem', padding: '7px 14px' }} onClick={addBanco}>+ Banco</button>
          </div>

          {bancos.map((b, idx) => {
            const autColor = !b.resultado ? '#64748b' : b.resultado > 4 ? '#008000' : b.resultado > 2 ? '#0166ff' : '#f55b5d';
            return (
              <div key={b.id} className="card" style={{ marginBottom: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.9rem' }}>Banco {idx + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {b.resultado && (
                      <div style={{ textAlign: 'right' }}>
                        <div className="fm" style={{ fontSize: '1.5rem', fontWeight: 800, color: autColor, lineHeight: 1 }}>{fmtHours(b.resultado)}</div>
                        <div style={{ fontSize: '.65rem', color: 'var(--tx3)' }}>autonomía estimada</div>
                      </div>
                    )}
                    {bancos.length > 1 && <button onClick={() => removeBanco(b.id)} className="bd" style={{ padding: '4px 10px', fontSize: '.72rem' }}>✕</button>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                    <label className="lbl" style={{ minHeight: '2.5em', display: 'flex', alignItems: 'flex-end', marginBottom: 4 }}>Tipo de Batería</label>
                    <select className="fi" value={b.tipo} onChange={e => updateBanco(b.id, 'tipo', e.target.value)}>
                      {['LFP', 'NMC', 'GEL', 'AGM', 'VRLA'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <AutonomiaInput label="Capacidad" unit="Ah" val={b.capacidad} onChange={v => updateBanco(b.id, 'capacidad', v)} />
                  <AutonomiaInput label="Carga del Banco" unit="kW" val={b.carga} onChange={v => updateBanco(b.id, 'carga', v)} />
                  <AutonomiaInput label="Vn Banco" unit="V" val={b.Vn} onChange={v => updateBanco(b.id, 'Vn', v)} small />
                  <AutonomiaInput label="SoH (0-1)" unit="" val={b.SoH} onChange={v => updateBanco(b.id, 'SoH', v)} small />
                  <AutonomiaInput label="DoD (0-1)" unit="" val={b.DoD} onChange={v => updateBanco(b.id, 'DoD', v)} small />
                  <AutonomiaInput label="η Banco" unit="" val={b.ebanco} onChange={v => updateBanco(b.id, 'ebanco', v)} small />
                  <AutonomiaInput label="η Temp" unit="" val={b.eTemp} onChange={v => updateBanco(b.id, 'eTemp', v)} small />
                </div>

                {!b.resultado && b.capacidad && b.carga && (
                  <div style={{ marginTop: 8, fontSize: '.75rem', color: '#0166ff' }}>Completa capacidad y carga para calcular.</div>
                )}
              </div>
            );
          })}

          {bancos.some(b => b.resultado) && (
            <div style={{ background: 'rgba(0, 128, 0,.08)', border: '1px solid rgba(0, 128, 0,.2)', borderRadius: 8, padding: '12px 16px', marginTop: 4 }}>
              <div className="fd" style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Resumen</div>
              {bancos.filter(b => b.resultado).map((b, i) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--tx2)', fontSize: '.85rem' }}>Banco {i + 1} — {b.tipo} {b.capacidad}Ah</span>
                  <span className="fm" style={{ fontWeight: 700, color: b.resultado > 4 ? '#008000' : b.resultado > 2 ? '#0166ff' : '#f55b5d' }}>{fmtHours(b.resultado)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    //  VISTA STANDALONE DE AUTONOMÍA
    // ═══════════════════════════════════════════════════
    function SimpleAutonomiaCalc() {
      const [cargaW, setCargaW] = useState('');
      const [horas, setHoras] = useState('');

      const toNum = s => parseFloat((s || '').toString().replace(',', '.'));
      const P = toNum(cargaW) || 0;
      const t = toNum(horas) || 0;

      const gel100 = P > 0 && t > 0 ? Math.ceil((P * t) / (48 * 100 * 0.6 * 0.25 * 0.95 * 0.85)) * 4 : 0;
      const gel200 = P > 0 && t > 0 ? Math.ceil((P * t) / (48 * 200 * 0.6 * 0.25 * 0.95 * 0.85)) * 4 : 0;
      const lfp100 = P > 0 && t > 0 ? Math.ceil((P * t) / (48 * 100 * 0.95 * 1.0 * 0.98 * 0.85)) : 0;
      const nmc52 = P > 0 && t > 0 ? Math.ceil((P * t) / (52.5 * 66 * 0.8 * 0.45 * 0.95 * 0.85)) : 0;

      return (
        <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(0, 128, 0,.3)', background: 'rgba(0, 128, 0,.03)' }}>
          <div style={{ marginBottom: 16 }}>
            <h3 className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)' }}>Proyección Rápida de Baterías</h3>
            <div style={{ fontSize: '.75rem', color: 'var(--tx3)' }}>Ingresa los requerimientos para estimar la cantidad de unidades necesarias (para sistemas a 48V).</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label className="lbl">Carga (Watts)</label>
              <div style={{ position: 'relative' }}>
                <input className="fi" type="number" step="any" value={cargaW} onChange={e => setCargaW(e.target.value)} placeholder="Ej: 1500" style={{ paddingRight: 40, fontSize: '1.1rem', fontWeight: 600 }} />
                <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--tx4)', fontSize: '.8rem', fontWeight: 700 }}>W</span>
              </div>
            </div>
            <div>
              <label className="lbl">Autonomía Deseada (Horas)</label>
              <div style={{ position: 'relative' }}>
                <input className="fi" type="number" step="any" value={horas} onChange={e => setHoras(e.target.value)} placeholder="Ej: 4" style={{ paddingRight: 40, fontSize: '1.1rem', fontWeight: 600 }} />
                <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--tx4)', fontSize: '.8rem', fontWeight: 700 }}>h</span>
              </div>
            </div>
          </div>

          {(P > 0 && t > 0) ? (
            <div>
              <div className="fd" style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Configuraciones Sugeridas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--bg-deep)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--tx2)', fontSize: '.8rem', fontWeight: 600, marginBottom: 4 }}>Pylontech LFP (48V 100Ah)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="fm" style={{ fontSize: '1.6rem', color: '#008000', fontWeight: 800 }}>{lfp100}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--tx4)' }}>unidades</span>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-deep)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--tx2)', fontSize: '.8rem', fontWeight: 600, marginBottom: 4 }}>Baterías GEL (12V 200Ah)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="fm" style={{ fontSize: '1.6rem', color: '#0166ff', fontWeight: 800 }}>{gel200}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--tx4)' }}>unidades ({gel200 / 4} arreglos)</span>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-deep)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--tx2)', fontSize: '.8rem', fontWeight: 600, marginBottom: 4 }}>Paquetes NMC (52.5V 66Ah)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="fm" style={{ fontSize: '1.6rem', color: '#21c0fa', fontWeight: 800 }}>{nmc52}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--tx4)' }}>paquetes</span>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-deep)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--tx2)', fontSize: '.8rem', fontWeight: 600, marginBottom: 4 }}>Baterías GEL (12V 100Ah)</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="fm" style={{ fontSize: '1.6rem', color: '#64748b', fontWeight: 800 }}>{gel100}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--tx4)' }}>unidades ({gel100 / 4} arreglos)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--tx4)', fontSize: '.85rem' }}>
              Ingresa la carga y las horas para ver la proyección de unidades.
            </div>
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // REPORTE GLOBAL DE AUTONOMÍA DE LA RED POR BANCOS
    // ═══════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════
    // REPORTE GLOBAL DE AUTONOMÍA DE LA RED POR BANCOS
    // ═══════════════════════════════════════════════════
        function AutonomiaRedView() {
      const [loading, setLoading] = useState(true);
      const [nodesData, setNodesData] = useState([]);
      const [search, setSearch] = useState('');
      const [statusFilter, setStatusFilter] = useState('all'); // all | critico | alerta | optimo
      const [nodeFilter, setNodeFilter] = useState('all');
      const [typeFilter, setTypeFilter] = useState('all'); // all | datacenter | nodo | otro
      const [loadFilter, setLoadFilter] = useState('all'); // all | con_carga | sin_carga
      const [showTextReport, setShowTextReport] = useState(true);
      const [copySuccess, setCopySuccess] = useState(false);

      useEffect(() => {
        let isMounted = true;
        
        async function fetchNetworkData() {
          setLoading(true);
          try {
            const nodesSnap = await db.collection('energy_nodes').get();
            const nodesList = nodesSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(n => n.active !== false);

            const allBankRows = [];

            await Promise.all(nodesList.map(async (node) => {
              try {
                const [eqSnap, recSnap] = await Promise.all([
                  db.collection('energy_nodes').doc(node.id).collection('energy_equipment').get(),
                  db.collection('energy_nodes').doc(node.id).collection('energy_records').orderBy('date', 'desc').limit(20).get()
                ]);

                const eqs = eqSnap.docs
                  .map(d => ({ id: d.id, ...d.data() }))
                  .filter(e => e.active !== false);

                const allRecs = recSnap.docs.map(d => d.data());
                // Buscar el registro más reciente que contenga mediciones (Inspección o Actualización de Carga)
                const latestRec = allRecs.find(r => 
                  (r.type === 'inspeccion' || r.type === 'actualizacion_carga' || r.type === 'actualizacion') && 
                  r.measurements && 
                  typeof r.measurements === 'object' && 
                  Object.keys(r.measurements).length > 0
                ) || allRecs.find(r => r.measurements && typeof r.measurements === 'object' && Object.keys(r.measurements).length > 0) || allRecs[0] || null;
                
                const meas = latestRec?.measurements || {};
                
                let recDateStr = 'Sin mediciones';
                if (latestRec?.date) {
                  try {
                    const d = latestRec.date.toDate ? latestRec.date.toDate() : new Date(latestRec.date);
                    const typeLabel = latestRec.type === 'actualizacion_carga' ? ' (Act. Carga)' : '';
                    recDateStr = d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + typeLabel;
                  } catch (e) { recDateStr = 'Fecha no disponible'; }
                }

                // Detectar todos los bancos presentes en inventario o en la última inspección
                const detectedBanks = new Set();
                eqs.forEach(e => {
                  if (e.type === 'BAT') {
                    const b = getBankId(e.tag);
                    if (b) detectedBanks.add(b);
                  }
                });
                Object.keys(meas).forEach(tag => {
                  const b = getBankId(tag);
                  if (b) detectedBanks.add(b);
                });

                if (detectedBanks.size === 0) {
                  allBankRows.push({
                    nodeId: node.id,
                    nodeName: node.name || 'Sin nombre',
                    zone: node.zone || 'N/A',
                    estado: node.estado || 'Zulia',
                    nodeType: node.type || 'fibra',
                    bankId: 'Sin Banco',
                    batTag: '—',
                    chem: '—',
                    capacity: 0,
                    vn: 0,
                    ac_kw: 0,
                    dc_kw: 0,
                    total_kw: 0,
                    hours: null,
                    hoursStr: 'Sin Batería',
                    timeFormatted: 'Sin Batería',
                    status: 'sin_bateria',
                    statusLabel: 'Sin Batería Registrada',
                    dateStr: recDateStr
                  });
                } else {
                  Array.from(detectedBanks).sort().forEach(bId => {
                    // Calcular cargas AC y DC asociadas a este banco en la última medición
                    let ac = 0, dc = 0;
                    Object.entries(meas).forEach(([tag, vals]) => {
                      if (getBankId(tag) === bId) {
                        const type = getEqTypeFromTag(tag, eqs);
                        const l = calcLoad(type, vals);
                        ac += l.ac;
                        dc += l.dc;
                      }
                    });

                    const tot = ac + dc;

                    // Buscar batería correspondiente en inventario
                    let bat = eqs.find(e => e.type === 'BAT' && getBankId(e.tag) === bId);
                    if (!bat) {
                      bat = eqs.find(e => e.type === 'BAT' && (e.tag.includes(bId) || bId.includes(e.tag)));
                    }

                    // Si no hay batería ni carga, ignorar banco fantasma
                    if (!bat && tot <= 0) return;

                    const cap = parseFloat(bat?.batCapacity) || 0;
                    const chem = (bat?.batteryType || (bId.includes('NMC') ? 'NMC' : bId.includes('GEL') ? 'GEL' : 'LFP')).toUpperCase();
                    const vn = BAT_VN[chem] || 48;
                    const hours = calcAutonomy(bat, ac, dc);
                    const hoursStr = fmtHours(hours);

                    // Formato digital HH:MM
                    let timeFormatted = '—';
                    if (hours !== null && hours > 0) {
                      let hh = Math.floor(hours);
                      let mm = Math.round((hours - hh) * 60);
                      if (mm === 60) { hh += 1; mm = 0; }
                      timeFormatted = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                    }

                    let status = 'sin_carga';
                    let statusLabel = 'Sin Carga Medida';
                    if (hours !== null) {
                      if (hours >= 4.0) { status = 'optimo'; statusLabel = 'Óptimo (>4h)'; }
                      else if (hours >= 2.0) { status = 'alerta'; statusLabel = 'Alerta (2h-4h)'; }
                      else { status = 'critico'; statusLabel = 'Crítico (<2h)'; }
                    } else if (!bat) {
                      statusLabel = 'Sin Batería Asignada';
                    }

                    allBankRows.push({
                      nodeId: node.id,
                      nodeName: node.name || 'Sin nombre',
                      zone: node.zone || 'N/A',
                      estado: node.estado || 'Zulia',
                      nodeType: node.type || 'fibra',
                      bankId: bId,
                      batTag: bat?.tag || bId,
                      chem,
                      capacity: cap,
                      vn,
                      ac_kw: ac,
                      dc_kw: dc,
                      total_kw: tot,
                      hours,
                      hoursStr,
                      timeFormatted,
                      status,
                      statusLabel,
                      dateStr: recDateStr
                    });
                  });
                }
              } catch (err) {
                console.error('Error procesando nodo:', node.name, err);
              }
            }));

            if (isMounted) {
              setNodesData(allBankRows.sort((a, b) => a.nodeName.localeCompare(b.nodeName)));
              setLoading(false);
            }
          } catch (e) {
            console.error('Error general cargando datos de autonomía:', e);
            if (isMounted) setLoading(false);
          }
        }

        fetchNetworkData();
        return () => { isMounted = false; };
      }, []);

      // Lista única de nodos para el dropdown
      const uniqueNodes = Array.from(new Set(nodesData.map(r => r.nodeName))).sort();

      // Filtrado interactivo multidimensional
      const filtered = nodesData.filter(r => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (nodeFilter !== 'all' && r.nodeName !== nodeFilter) return false;
        if (typeFilter !== 'all') {
          const t = (r.nodeType || '').toLowerCase();
          if (typeFilter === 'datacenter' && t !== 'datacenter') return false;
          if (typeFilter === 'nodo' && (t !== 'fibra' && t !== 'headend' && t !== 'nodo')) return false;
          if (typeFilter === 'otro' && t !== 'otro') return false;
        }
        if (loadFilter !== 'all') {
          if (loadFilter === 'con_carga' && (r.total_kw <= 0 || r.hours === null)) return false;
          if (loadFilter === 'sin_carga' && (r.total_kw > 0 && r.hours !== null)) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const matchNode = (r.nodeName || '').toLowerCase().includes(q);
          const matchBank = (r.bankId || '').toLowerCase().includes(q);
          const matchZone = (r.zone || '').toLowerCase().includes(q);
          const matchTag = (r.batTag || '').toLowerCase().includes(q);
          if (!matchNode && !matchBank && !matchZone && !matchTag) return false;
        }
        return true;
      });

      // Generación del texto estructurado para copiar y pegar
      const generateTextReport = () => {
        const todayStr = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        let text = `Autonomía por banco de baterías - ${todayStr}\n\n`;

        // Agrupar filas filtradas por nodo
        const groups = {};
        filtered.forEach(r => {
          if (!groups[r.nodeName]) groups[r.nodeName] = [];
          groups[r.nodeName].push(r);
        });

        Object.entries(groups).forEach(([nodeName, banks]) => {
          text += `${nodeName}:\n`;
          banks.forEach(b => {
            if (b.status === 'sin_bateria') {
              text += `Sin batería registrada\n`;
            } else if (b.status === 'sin_carga') {
              text += `${b.bankId}: Sin Carga Medida\n`;
            } else {
              text += `${b.bankId}: ${b.timeFormatted} (${b.hoursStr})\n`;
            }
          });
          text += `\n`;
        });

        return text.trim();
      };

      const copyReportToClipboard = () => {
        const text = generateTextReport();
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2500);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2500);
        });
      };

      // KPIs
      const totalNodes = new Set(nodesData.map(r => r.nodeId)).size;
      const totalBancos = nodesData.filter(r => r.status !== 'sin_bateria').length;
      const criticos = nodesData.filter(r => r.status === 'critico').length;
      const alertas = nodesData.filter(r => r.status === 'alerta').length;
      const optimos = nodesData.filter(r => r.status === 'optimo').length;
      const sinCarga = nodesData.filter(r => r.status === 'sin_carga').length;

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        if (!nodesData.length) return;
        const rows = filtered.map(r => ({
          'NODO': r.nodeName,
          'ZONA / MUNICIPIO': r.zone,
          'ESTADO GEOGRÁFICO': r.estado,
          'TIPO DE NODO': r.nodeType,
          'BANCO': r.bankId,
          'TAG BATERÍA': r.batTag,
          'QUÍMICA': r.chem,
          'CAPACIDAD (Ah)': r.capacity,
          'TENSIÓN NOMINAL (V)': r.vn,
          'CARGA AC (kW)': Number(r.ac_kw.toFixed(3)),
          'CARGA DC (kW)': Number(r.dc_kw.toFixed(3)),
          'CARGA TOTAL (kW)': Number(r.total_kw.toFixed(3)),
          'AUTONOMÍA (HH:MM)': r.timeFormatted,
          'AUTONOMÍA FORMATEADA': r.hoursStr,
          'ESTADO SEMÁFORO': r.statusLabel,
          'ÚLTIMA MEDICIÓN': r.dateStr
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 14 },
          { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
          { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
          { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 16 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Autonomía por Banco');
        XLSX.writeFile(wb, 'reporte_autonomia_red_airtek_' + Date.now() + '.xlsx');
      };

      const reportText = generateTextReport();

      return (
        <div>
          {/* Header con acciones */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Informe de Autonomía de la Red
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Monitoreo consolidado de {totalNodes} lugares y {totalBancos} bancos de baterías.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={copyReportToClipboard} disabled={loading || !filtered.length}>
                <IconCopy size={16} />
                {copySuccess ? 'Copiado al Portapapeles' : 'Copiar Reporte de Texto'}
              </button>
              <button className="bs" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={exportExcel} disabled={loading || !filtered.length}>
                <IconExcel size={16} color="#10b981" />
                Descargar Excel
              </button>
            </div>
          </div>

          {/* Formato de Texto Rápido para Copiar */}
          <div className="card" style={{ marginBottom: 18, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  Formato de Texto para Copiar y Pegar
                </span>
                <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>
                  ({filtered.length} bancos incluidos)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="bs"
                  style={{ padding: '4px 10px', fontSize: '.72rem' }}
                  onClick={() => setShowTextReport(!showTextReport)}
                >
                  {showTextReport ? 'Ocultar Texto' : 'Mostrar Texto'}
                </button>
                <button
                  className="bp"
                  style={{ padding: '4px 12px', fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={copyReportToClipboard}
                  disabled={loading || !filtered.length}
                >
                  <IconCopy size={14} />
                  {copySuccess ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {showTextReport && (
              <textarea
                className="fi fm"
                readOnly
                value={loading ? 'Cargando datos de la red...' : reportText}
                style={{
                  width: '100%',
                  height: 170,
                  fontSize: '.82rem',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  background: 'var(--bg-surface)',
                  color: 'var(--tx1)',
                  padding: '12px 14px',
                  borderRadius: 8
                }}
              />
            )}
          </div>

          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Total Nodos</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--tx1)' }}>{loading ? '...' : totalNodes}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(33, 192, 250, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#21c0fa' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="11" x2="23" y2="13"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Bancos Batería</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#21c0fa' }}>{loading ? '...' : totalBancos}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <IconAlertTriangle size={22} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Críticos (&lt;2h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{loading ? '...' : criticos}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Alerta (2h-4h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{loading ? '...' : alertas}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <IconCheckCircle size={22} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Óptimos (&gt;4h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{loading ? '...' : optimos}</div>
              </div>
            </div>
          </div>

          {/* Barra de Filtros Multidimensional */}
          <div className="card" style={{ padding: '16px 18px', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Lugar Específico</label>
                <select className="fi" value={nodeFilter} onChange={e => setNodeFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todos los Lugares ({uniqueNodes.length})</option>
                  {uniqueNodes.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Tipo de Infraestructura</label>
                <select className="fi" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todos los Tipos</option>
                  <option value="datacenter">Datacenter</option>
                  <option value="nodo">Nodo (Fibra / Headend)</option>
                  <option value="otro">Otro (ATC / Sede)</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Estado de Carga</label>
                <select className="fi" value={loadFilter} onChange={e => setLoadFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todas las Mediciones</option>
                  <option value="con_carga">Con Carga Medida (&gt; 0 kW)</option>
                  <option value="sin_carga">Sin Carga Medida (0 kW / Sin datos)</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Búsqueda de Texto</label>
                <input className="fi" type="text" placeholder="Buscar banco, tag o zona..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 14px', fontSize: '.84rem' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.75rem', color: 'var(--tx3)' }}>
                Mostrando <b>{filtered.length}</b> bancos filtrados
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'Todos', count: nodesData.length },
                  { key: 'critico', label: 'Críticos (<2h)', count: criticos, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },
                  { key: 'alerta', label: 'Alerta (2-4h)', count: alertas, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
                  { key: 'optimo', label: 'Óptimos (>4h)', count: optimos, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: statusFilter === tab.key ? '1px solid var(--blue)' : '1px solid var(--border)',
                      background: statusFilter === tab.key ? 'rgba(1, 102, 255, 0.15)' : 'var(--bg-surface)',
                      color: statusFilter === tab.key ? 'var(--blue)' : 'var(--tx2)',
                      fontSize: '.76rem',
                      fontWeight: statusFilter === tab.key ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{ fontSize: '.7rem', padding: '1px 6px', borderRadius: 10, background: tab.bg || 'var(--bg-card)', color: tab.color || 'var(--tx2)', fontWeight: 700 }}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla de Resultados */}
          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: 50, color: 'var(--tx3)' }}>
              <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%', margin: '0 auto 12px' }} />
              Calculando autonomías de todos los nodos y bancos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>
              No se encontraron bancos con los filtros seleccionados.
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                      <th style={{ padding: '12px 16px' }}>Nodo / Lugar</th>
                      <th style={{ padding: '12px 14px' }}>Banco / Batería</th>
                      <th style={{ padding: '12px 14px' }}>Química & Capacidad</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Carga Medida</th>
                      <th style={{ padding: '12px 14px' }}>Autonomía (HH:MM)</th>
                      <th style={{ padding: '12px 14px' }}>Estado</th>
                      <th style={{ padding: '12px 14px' }}>Última Insp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => {
                      const isCrit = r.status === 'critico';
                      const isAlert = r.status === 'alerta';
                      const isOpt = r.status === 'optimo';
                      const pct = r.hours ? Math.min(100, Math.round((r.hours / 12) * 100)) : 0;
                      const barColor = isCrit ? '#ef4444' : isAlert ? '#f59e0b' : isOpt ? '#10b981' : '#64748b';

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{r.nodeName}</div>
                            <div style={{ fontSize: '.74rem', color: 'var(--tx3)', display: 'flex', gap: 6, marginTop: 2 }}>
                              <span>{r.zone}</span>
                              <span>&middot;</span>
                              <span style={{ textTransform: 'capitalize' }}>{r.nodeType}</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span className="fm" style={{ fontWeight: 700, color: 'var(--blue)', fontSize: '.85rem' }}>{r.bankId}</span>
                            {r.batTag !== r.bankId && r.batTag !== '—' && (
                              <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{r.batTag}</div>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {r.status === 'sin_bateria' ? (
                              <span style={{ color: 'var(--tx4)', fontSize: '.78rem' }}>—</span>
                            ) : (
                              <div>
                                <span className="badge" style={{ background: r.chem === 'LFP' ? 'rgba(1, 102, 255, 0.12)' : r.chem === 'GEL' ? 'rgba(33, 192, 250, 0.12)' : 'rgba(168, 85, 247, 0.12)', color: r.chem === 'LFP' ? 'var(--blue)' : r.chem === 'GEL' ? '#21c0fa' : '#a855f7', fontSize: '.68rem', marginRight: 6 }}>
                                  {r.chem}
                                </span>
                                <span className="fm" style={{ fontWeight: 600, color: 'var(--tx1)', fontSize: '.84rem' }}>
                                  {r.capacity} Ah
                                </span>
                                <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginTop: 2 }}>{r.vn} V</div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {r.total_kw > 0 ? (
                              <div>
                                <div className="fm" style={{ fontWeight: 700, color: 'var(--green)', fontSize: '.9rem' }}>
                                  {r.total_kw.toFixed(2)} kW
                                </div>
                                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 1 }}>
                                  AC: {r.ac_kw.toFixed(2)} | DC: {r.dc_kw.toFixed(2)}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--tx4)', fontSize: '.78rem' }}>0.00 kW</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', minWidth: 160 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                              <span className="fm" style={{ fontWeight: 800, fontSize: '1.05rem', color: barColor }}>
                                {r.timeFormatted}
                              </span>
                              {r.hours !== null && (
                                <span style={{ fontSize: '.74rem', color: 'var(--tx3)' }}>
                                  ({r.hoursStr})
                                </span>
                              )}
                            </div>
                            {r.hours !== null && (
                              <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontSize: '.74rem',
                              fontWeight: 700,
                              background: isCrit ? 'rgba(239, 68, 68, 0.12)' : isAlert ? 'rgba(245, 158, 11, 0.12)' : isOpt ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                              color: isCrit ? '#ef4444' : isAlert ? '#f59e0b' : isOpt ? '#10b981' : 'var(--tx3)'
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isCrit ? '#ef4444' : isAlert ? '#f59e0b' : isOpt ? '#10b981' : '#64748b' }} />
                              {r.statusLabel}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '.78rem', color: 'var(--tx3)' }}>
                            {r.dateStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      );
    }

    function AutonomiaWrapper() {
      const [tab, setTab] = useState('red'); // red | simulacion
      return (
        <div className="fin">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <div className="segmented-control">
              <button className={`segmented-btn ${tab === 'red' ? 'active' : ''}`} onClick={() => setTab('red')}>
                Autonomía de la Red
              </button>
              <button className={`segmented-btn ${tab === 'simulacion' ? 'active' : ''}`} onClick={() => setTab('simulacion')}>
                Calculadora de Simulación
              </button>
            </div>
          </div>

          {tab === 'red' ? (
            <AutonomiaRedView />
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>Calculadoras de Autonomía</h1>
                <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>Herramientas para proyectar requerimientos y estimar el rendimiento de la red.</p>
              </div>
              <SimpleAutonomiaCalc />
              <AutonomiaCalc />
            </div>
          )}
        </div>
      );
    }


    // ═══════════════════════════════════════════════════════════════════════
    // MÓDULO DE GESTIÓN DE COMBUSTIBLE, SURTIDOS Y MANTENIMIENTO DE PLANTAS
    // ═══════════════════════════════════════════════════════════════════════


export default AutonomiaWrapper;
export { AutonomiaWrapper, AutonomiaRedView, AutonomiaCalc, SimpleAutonomiaCalc };
