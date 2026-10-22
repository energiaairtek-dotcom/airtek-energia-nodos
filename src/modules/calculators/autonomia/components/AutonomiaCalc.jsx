import React, { useState } from 'react';
import { AutonomiaInput } from '@/modules/calculators/autonomia/components/AutonomiaInput';
import { BAT_DEFAULTS, BAT_VN } from '@/config/constants';
import { fmtHours } from '@/utils/energyCalculations';

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

export { AutonomiaCalc };
export default AutonomiaCalc;
