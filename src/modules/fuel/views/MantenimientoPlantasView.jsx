import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '@/services/firebase';
import { normalizeNodeName, formatCleanHoro } from '@/utils/formatters';
import { loadXLSX } from '@/utils/exportLibs';
import { IconExcel, IconCheckCircle, IconAlertTriangle } from '@/components/icons';

function MantenimientoPlantasView({ maintenances, onOpenNewModal, toast }) {
      const [statusFilter, setStatusFilter] = useState('all');
      const [search, setSearch] = useState('');

      const filtered = maintenances.filter(m => {
        if (statusFilter !== 'all' && m.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchPlanta = (m.planta || '').toLowerCase().includes(q);
          const matchTag = (m.tag || '').toLowerCase().includes(q);
          if (!matchPlanta && !matchTag) return false;
        }
        return true;
      });

      const optimos = maintenances.filter(m => m.status === 'optimo').length;
      const alertas = maintenances.filter(m => m.status === 'alerta').length;
      const criticos = maintenances.filter(m => m.status === 'critico').length;

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(m => ({
          'PLANTA / LUGAR': m.planta,
          'TAG': m.tag,
          'POTENCIA (kVA)': m.kva,
          'FECHA ÚLTIMO MTTO': m.fecha,
          'HORÓMETRO MTTO': m.horometro_mtto,
          'HORÓMETRO ACTUAL': m.horometro_actual,
          'HORAS TRABAJADAS': m.horas_trabajadas,
          'INTERVALO (H)': m.intervalo,
          'HORAS RESTANTES (H/MTTO)': m.horas_restantes,
          'LITROS ACEITE': m.litros_aceite,
          'FILTRO ACEITE': m.filtro_aceite,
          'FILTRO TRAMPA AGUA': m.filtro_trampa,
          'FILTRO COMBUSTIBLE': m.filtro_comb,
          'FILTRO AIRE': m.filtro_aire,
          'PRÓXIMO CAMBIO': m.prox_cambio,
          'OBSERVACIONES': m.obs
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Mantenimiento de Plantas');
        XLSX.writeFile(wb, 'reporte_mantenimiento_plantas_' + Date.now() + '.xlsx');
      };

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Control de Horómetros y Mantenimiento Preventivo
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Seguimiento de horas de operación, ciclo de 250h y recambio de aceite y filtros.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="bp" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={onOpenNewModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Registrar Mantenimiento
              </button>
              <button className="bs" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={exportExcel}>
                <IconExcel size={16} color="#10b981" />
                Descargar Excel
              </button>
            </div>
          </div>

          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <IconCheckCircle size={22} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Al Día (&gt;50h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981' }}>{optimos}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Próximo (20-50h)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>{alertas}</div>
              </div>
            </div>

            <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <IconAlertTriangle size={22} color="#ef4444" />
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Urgente / Vencido</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{criticos}</div>
              </div>
            </div>
          </div>

          {/* Tabla de Mantenimientos */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '12px 16px' }}>Planta / Ubicación</th>
                    <th style={{ padding: '12px 14px' }}>Último Mantenimiento</th>
                    <th style={{ padding: '12px 14px' }}>Horómetro Actual</th>
                    <th style={{ padding: '12px 14px' }}>Horas Trabajadas</th>
                    <th style={{ padding: '12px 14px' }}>Horas Restantes (H/MTTO)</th>
                    <th style={{ padding: '12px 14px' }}>Filtros & Aceite</th>
                    <th style={{ padding: '12px 14px' }}>Próximo Cambio</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => {
                    const isCrit = m.status === 'critico';
                    const isAlert = m.status === 'alerta';
                    const badgeColor = isCrit ? '#ef4444' : isAlert ? '#f59e0b' : '#10b981';
                    const pctLife = Math.max(0, Math.min(100, Math.round((m.horas_restantes / m.intervalo) * 100)));

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{m.planta}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--blue)' }}>{m.tag} &middot; {m.kva} kVA</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 600, color: 'var(--tx1)' }}>{m.fecha}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>En horómetro: {m.horometro_mtto}h</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="fm" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.95rem' }}>{m.horometro_actual}h</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="fm" style={{ fontWeight: 700, color: 'var(--blue)' }}>+{m.horas_trabajadas}h</span>
                        </td>
                        <td style={{ padding: '12px 14px', minWidth: 150 }}>
                          <div className="fm" style={{ fontWeight: 800, fontSize: '1.05rem', color: badgeColor, marginBottom: 4 }}>
                            {m.horas_restantes}h
                          </div>
                          <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                            <div style={{ width: `${pctLife}%`, height: '100%', background: badgeColor, borderRadius: 3 }} />
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '.76rem', color: 'var(--tx1)', fontWeight: 600 }}>Aceite: {m.litros_aceite} ({m.filtro_aceite})</div>
                          <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>Comb: {m.filtro_comb} | Aire: {m.filtro_aire}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{m.prox_cambio}</div>
                          {m.obs && <div style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>{m.obs}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

export { MantenimientoPlantasView };
export default MantenimientoPlantasView;
