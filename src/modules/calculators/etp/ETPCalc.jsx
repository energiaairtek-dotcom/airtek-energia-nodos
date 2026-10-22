import React, { useRef } from 'react';
import { IconAlertTriangle } from '@/components/icons';

    function ETPCalc() {
      const containerRef = useRef(null);
      const escenario = 1;
      const [tipoCarga, setTipoCarga] = React.useState('DC');
      const [cargaW, setCargaW] = React.useState('');
      const [numBaterias, setNumBaterias] = React.useState('');
      const [ampBateria, setAmpBateria] = React.useState('');
      const [userRect, setUserRect] = React.useState(0);
      const [results, setResults] = React.useState(null);

      React.useEffect(() => {
        const cW = parseFloat(cargaW) || 0;
        const nB = parseFloat(numBaterias) || 0;
        const aB = parseFloat(ampBateria) || 0;
        const VDC = 4800 / 91.1;
        const FUENTES = 2;
        const cargaEfectiva = cW > 5000 ? 5000 : cW;
        const cargaExcedente = cW > 5000 ? cW - 5000 : 0;
        const corrienteCargaTotal = cargaEfectiva / VDC;
        const corrienteBateriasTotal = nB * aB;
        const Q_total = corrienteBateriasTotal + corrienteCargaTotal;
        let corrienteCargaA, corrienteBateriasA, corrienteTotalPorFuente;
        if (escenario === 1) {
          corrienteCargaA = corrienteCargaTotal / FUENTES;
          corrienteBateriasA = corrienteBateriasTotal / FUENTES;
          corrienteTotalPorFuente = Q_total / FUENTES;
        } else {
          corrienteCargaA = corrienteCargaTotal;
          corrienteBateriasA = corrienteBateriasTotal;
          corrienteTotalPorFuente = Q_total;
        }
        const MAX_AMP_70 = (70 * 80) / 121;
        let autoRect = Math.ceil(corrienteTotalPorFuente / MAX_AMP_70);
        if (autoRect === 0 && corrienteTotalPorFuente > 0) autoRect = 1;
        if (autoRect > 3) autoRect = 3;
        const rectPorFuente = userRect > 0 ? userRect : autoRect;
        const corrientePorRect = rectPorFuente > 0 ? corrienteTotalPorFuente / rectPorFuente : 0;
        const percReg = (corrientePorRect * 121) / 80;
        const consumoAC = ((Math.ceil(percReg) * 20.5) / 121) * rectPorFuente;
        const consumoACTotal = consumoAC * FUENTES;
        const totalSistema = escenario === 1 ? Q_total : Q_total * FUENTES;
        let invPorFuente = tipoCarga === 'AC' && cargaEfectiva > 0 ? Math.min(Math.ceil(cargaEfectiva / 2000), 3) : 0;
        setResults({ corrienteCargaA, corrienteBateriasA, corrienteTotalPorFuente, corrienteBateriasTotal, totalSistema, consumoAC, consumoACTotal, rectPorFuente: rectPorFuente * FUENTES, corrientePorRect, percReg, invPorFuente, cargaExcedente, autoRect });
      }, [escenario, tipoCarga, cargaW, numBaterias, ampBateria, userRect]);

      const r = results;
      const fmt = (v, d=2) => (v||0).toFixed(d);
      const overloaded = r && r.percReg > 70;
      const invAlert = r && r.invPorFuente >= 3 && tipoCarga === 'AC' && parseFloat(cargaW) > 6000;

      return (
        <div className="fin">
          <div style={{ marginBottom: 20 }}>
            <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>Calculadora ETP23006</h1>
            <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>Cálculo de rectificadores, inversores y modulación de carga (N+1) para fuentes Huawei.</p>
          </div>

          {/* Escenario I — Carga Compartida (único) */}
          <div style={{ marginBottom: 16, background: 'rgba(1, 102, 255,.08)', border: '1px solid rgba(1, 102, 255,.25)', borderRadius: 8, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'Outfit', 'Montserrat', sans-serif", fontWeight: 700, fontSize: '.78rem', color: '#0166ff', textTransform: 'uppercase', letterSpacing: '.06em' }}>Escenario I – Carga Compartida</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Parámetros */}
            <div className="card">
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>1. Demanda de Energía</h3>
              <div style={{ marginBottom: 12 }}>
                <label className="lbl">Tipo de Carga</label>
                <select className="fi" value={tipoCarga} onChange={e => setTipoCarga(e.target.value)}>
                  <option value="DC">Carga DC (Solo Rectificadores)</option>
                  <option value="AC">Carga AC (Requiere Inversores)</option>
                </select>
              </div>
              <div>
                <label className="lbl">Carga Total Requerida (W)</label>
                <input className="fi" type="number" value={cargaW} onChange={e => { setCargaW(e.target.value); setUserRect(0); }} placeholder="Ej: 5800" />
              </div>
            </div>
            <div className="card">
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>2. Almacenamiento (Baterías)</h3>
              <div style={{ marginBottom: 12 }}>
                <label className="lbl">Módulos Pylontech (US/UP)</label>
                <input className="fi" type="number" value={numBaterias} onChange={e => setNumBaterias(e.target.value)} placeholder="Ej: 6" />
              </div>
              <div>
                <label className="lbl">Amperaje de Carga (Por Batería)</label>
                <input className="fi" type="number" value={ampBateria} onChange={e => setAmpBateria(e.target.value)} placeholder="Ej: 10" />
              </div>
            </div>
          </div>

          {r && (
            <>
              {/* Métricas de Corriente Symmetrical Layout */}
              <div className="card" style={{ marginBottom: 14 }}>
                <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Análisis de Corriente (Por Fuente A/B)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {[
                    ['Carga Activa (DC)', fmt(r.corrienteCargaA) + ' A', '#0166ff', false],
                    ['Carga de Baterías', fmt(r.corrienteBateriasA) + ' A', '#21c0fa', false],
                    ['Entrada AC (por Fuente)', fmt(r.consumoAC) + ' A', '#008000', false],
                    ['Total Por Fuente', fmt(r.corrienteTotalPorFuente) + ' A', '#0166ff', false],
                    ['Total Baterías (A+B)', fmt(r.corrienteBateriasTotal) + ' A', '#21c0fa', false],
                    ['Total Entrada AC (A+B)', fmt(r.consumoACTotal) + ' A', '#008000', false],
                    ['Total Sistema (A+B)', fmt(r.totalSistema) + ' A', '#f55b5d', true]
                  ].map(([lbl, val, color, isFeatured]) => (
                    <div key={lbl} style={{
                      background: isFeatured ? 'rgba(245, 91, 93, 0.06)' : 'var(--bg-deep)',
                      border: isFeatured ? '1px solid rgba(245, 91, 93, 0.3)' : '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      gridColumn: isFeatured ? 'span 2' : 'span 1'
                    }}>
                      <div style={{ fontSize: '.68rem', color: isFeatured ? '#f55b5d' : 'var(--tx3)', marginBottom: 4, fontFamily: "'Outfit', 'Montserrat', sans-serif", textTransform: 'uppercase', fontWeight: 600 }}>{lbl}</div>
                      <div className="fm" style={{ fontSize: isFeatured ? '1.25rem' : '1.1rem', fontWeight: 800, color }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rectificadores */}
              <div className="card" style={{ marginBottom: 14, border: '1px solid var(--border)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                  <div>
                    <h3 className="fd" style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      MÓDULO RECTIFICADOR HUAWEI R4875G5 <span style={{ color: 'var(--tx4)', fontWeight: 400 }}>48VDC / 75ADC</span>
                    </h3>
                  </div>

                  {/* Esquina Superior Derecha: Sistema Completo al lado de la Selección de Módulos */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ background: 'var(--bg-deep)', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--tx3)', fontSize: '.78rem', fontWeight: 600 }}>Sistema Completo:</span>
                      <span className="fm" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0166ff' }}>{r.rectPorFuente}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Selecciona configuración (Por Fuente):</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[1,2,3].map(n => {
                          const hAmp = r.corrienteTotalPorFuente / n;
                          const hPerc = (hAmp * 121) / 80;
                          const isOver = hPerc > 70;
                          const isActive = n === (userRect > 0 ? userRect : r.autoRect);
                          return (
                            <button key={n} onClick={() => setUserRect(n)}
                              style={{ padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Outfit', 'Montserrat', sans-serif", fontSize: '.8rem', fontWeight: 700, border: '1px solid', transition: 'all .15s', textAlign: 'center',
                                background: isActive ? (isOver ? '#f55b5d' : '#0166ff') : 'var(--bg-surface)',
                                color: isActive ? '#fff' : (isOver ? '#f55b5d' : 'var(--tx2)'),
                                borderColor: isOver ? (isActive ? '#f55b5d' : 'rgba(245, 91, 93,.4)') : (isActive ? '#0166ff' : 'var(--border)') }}>
                              {n} {n === 1 ? 'Mód' : 'Móds'}<br />
                              <span style={{ fontSize: '.68rem', fontWeight: 600 }}>{Math.ceil(hPerc)}%</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    ['Corriente por Módulo', fmt(r.corrientePorRect, 3) + ' A'],
                    ['Carga de Trabajo', fmt(r.percReg, 3) + '% ≈ ' + Math.ceil(r.percReg) + '%'],
                    ['Entrada AC (por Fuente)', fmt(r.consumoAC) + ' A']
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ background: 'var(--bg-deep)', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--tx3)', marginBottom: 4, fontWeight: 600 }}>
                        {lbl}
                      </div>
                      <div className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: overloaded ? '#f55b5d' : '#0166ff' }}>{val}</div>
                    </div>
                  ))}
                </div>

                {overloaded && (
                  <div style={{ marginTop: 10, background: 'rgba(245, 91, 93,.1)', border: '1px solid rgba(245, 91, 93,.3)', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: '.82rem', display: 'flex', alignItems: 'center' }}>
                    <IconAlertTriangle size={15} color="#f55b5d" />
                    <span><strong>Advertencia:</strong> Esta configuración supera el límite de trabajo recomendado del 70%.</span>
                  </div>
                )}
              </div>

              {/* Inversores */}
              {tipoCarga === 'AC' && parseFloat(cargaW) > 0 && (
                <div className="card" style={{ marginBottom: 14, borderLeft: '3px solid #008000', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="fd" style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      MÓDULO INVERSOR HUAWEI I23003G1 <span style={{ color: 'var(--tx4)', fontWeight: 400 }}>3KVA / 230VAC</span>
                    </h3>
                    <div style={{ background: 'var(--bg-deep)', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--tx3)', fontSize: '.78rem', fontWeight: 600 }}>Unidades por Fuente:</span>
                      <span className="fm" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#008000' }}>{r.invPorFuente}</span>
                    </div>
                  </div>
                  {invAlert && (
                    <div style={{ background: 'rgba(245, 91, 93,.1)', border: '1px solid rgba(245, 91, 93,.3)', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: '.82rem', display: 'flex', alignItems: 'center' }}>
                      <IconAlertTriangle size={15} color="#f55b5d" />
                      <span><strong>Límite Superado:</strong> ETP23006 admite máx. 3 inversores. Carga AC excede soporte nominal.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Chasis */}
              <div className="card" style={{ border: '1px solid var(--border)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="fd" style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    CHASIS HUAWEI ETP23006-C3A1
                  </h3>
                  <div style={{ background: 'var(--bg-deep)', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--tx3)', fontSize: '.78rem', fontWeight: 600 }}>Sistemas Requeridos:</span>
                    <span className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#008000' }}>1 Par (Fuentes A y B)</span>
                  </div>
                </div>
                {r.cargaExcedente > 0 && (
                  <div style={{ marginTop: 10, background: 'rgba(245, 91, 93,.1)', border: '1px solid rgba(245, 91, 93,.3)', borderRadius: 8, padding: '8px 12px', color: '#fca5a5', fontSize: '.82rem', display: 'flex', alignItems: 'center' }}>
                    <IconAlertTriangle size={15} color="#f55b5d" />
                    <span><strong>Límite Superado (5.000 W):</strong> La carga excedente de {r.cargaExcedente} W debe distribuirse en otro par de fuentes.</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    //  CALCULADORA DE AUTONOMÍA STANDALONE
    // ═══════════════════════════════════════════════════
    // Input de autonomía fuera del componente → sin pérdida de foco al escribir

export default ETPCalc;
export { ETPCalc };
