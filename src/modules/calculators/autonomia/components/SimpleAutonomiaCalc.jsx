import React, { useState } from 'react';
import { AutonomiaInput } from '@/modules/calculators/autonomia/components/AutonomiaInput';
import { BAT_DEFAULTS } from '@/config/constants';
import { fmtHours } from '@/utils/energyCalculations';

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

export { SimpleAutonomiaCalc };
export default SimpleAutonomiaCalc;
