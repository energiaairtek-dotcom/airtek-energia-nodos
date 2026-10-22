

import { usePlantCard } from '@/modules/nodes/hooks/usePlantCard';
import { PlantCardContext } from '@/modules/nodes/context/plantCardContext';

import { formatHHMMSS, parseHours } from '@/utils/formatters';
import { INITIAL_MAINTENANCE_LOG } from '@/modules/fuel/fuelUtils';

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
        } catch {}

        let tankH = 0;
        try {
          const tk = JSON.parse(localStorage.getItem('airtek_fuel_tanks_v13') || '[]');
          const mTank = tk.find(t => t.tag === eq.tag);
          if (mTank && mTank.horometro_actual !== undefined) {
            tankH = typeof mTank.horometro_actual === 'number' ? mTank.horometro_actual : (parseHours(mTank.horometro_actual) || 0);
          }
        } catch {}

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
    }

export { PlantCard };
export default PlantCard;
