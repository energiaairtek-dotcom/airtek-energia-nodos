import React from 'react';
import { MF } from '@/modules/nodes/components/MF';
import { AWG_AMPACITY } from '@/config/constants';
import { IconAlertTriangle } from '@/components/icons';

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

export { EqMeasurements };
export default EqMeasurements;
