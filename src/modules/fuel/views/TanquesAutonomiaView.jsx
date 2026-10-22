import React, { useState, useEffect } from 'react';

import { loadXLSX, loadHtml2Canvas } from '@/utils/exportLibs';
import { normalizeNodeName, formatCleanHoro, parseHorometerToHours } from '@/utils/formatters';
import { IconExcel, IconCopy } from '@/components/icons';

function TanquesAutonomiaView({ tanks = [], refills = [], maintenances = [], customHorometers = {}, onUpdatePlantHorometer, onOpenBatchHoroModal, toast }) {
      const [isDark, setIsDark] = useState(() => (document.documentElement.getAttribute('data-theme') || 'light') === 'dark');

      useEffect(() => {
        const updateTheme = () => {
          setIsDark((document.documentElement.getAttribute('data-theme') || 'light') === 'dark');
        };
        updateTheme();
        const obs = new MutationObserver(updateTheme);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => obs.disconnect();
      }, []);
      const [regionFilter, setRegionFilter] = useState('all');
      const [zonaFilter, setZonaFilter] = useState('all');
      const [statusFilter, setStatusFilter] = useState('all');
      const [search, setSearch] = useState('');
      const [showTextReport, setShowTextReport] = useState(false);
      const [copySuccess, setCopySuccess] = useState(false);
      const [showImageModal, setShowImageModal] = useState(false);
      const [generatingImg, setGeneratingImg] = useState(false);
      const [modalZoneFilter, setModalZoneFilter] = useState('all');

      const normFn = normalizeNodeName;

      const uniqueZonas = Array.from(new Set(tanks.map(t => t.zona))).filter(Boolean).sort();

      // Cálculo de métricas avanzadas (Delta H, consumo y stock neto) para cada planta
      const enrichedTanks = tanks.map(t => {
        const sn = normFn(t.lugar);
        const siteTanks = tanks.filter(x => normFn(x.lugar) === sn);
        const isMultiPlant = siteTanks.length > 1;
        const sharedReserva = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.reserva_lts) || 0), 0);
        const sharedCapReserva = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.cap_reserva || x.cap_reserva_lts) || 0), 0);
        const sumSubtanques = siteTanks.reduce((acc, x) => acc + (parseFloat(x.subtanque_actual) || 0), 0);
        const totNodo = sumSubtanques + sharedReserva;

        // Buscar último surtido por tag o sitio
        const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
        const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

        const hSur = lastRefill?.horometro ? parseHorometerToHours(lastRefill.horometro) : null;
        const hSurStr = lastRefill?.horometro ? formatCleanHoro(lastRefill.horometro) : '—';
        const fechaSur = lastRefill?.fecha || '—';

        // Ver si hay un valor ingresado manualmente en customHorometers
        const plantKey = t.tag || sn;
        const customEntry = customHorometers[plantKey] || (t.tag ? customHorometers[t.tag] : null);

        let hAct = null;
        let deltaH = null;

        if (customEntry) {
          if (customEntry.horometro_actual != null && !isNaN(customEntry.horometro_actual)) {
            hAct = parseFloat(customEntry.horometro_actual);
          }
          if (customEntry.delta_h != null && !isNaN(customEntry.delta_h)) {
            deltaH = parseFloat(customEntry.delta_h);
          }
        }

        if (hAct === null) {
          const mMtto = maintenances.find(m => m.tag ? (t.tag && m.tag === t.tag) : normFn(m.planta).includes(sn));
          if (mMtto && mMtto.horometro_actual != null) {
            hAct = typeof mMtto.horometro_actual === 'number' ? mMtto.horometro_actual : parseHorometerToHours(mMtto.horometro_actual);
          }
          if (hAct === null && t.horometro_actual != null) {
            hAct = typeof t.horometro_actual === 'number' ? t.horometro_actual : parseHorometerToHours(t.horometro_actual);
          }
          if (hAct === null && hSur !== null) {
            hAct = hSur;
          }
        }

        // Horas de operación acumuladas desde el último surtido
        if (deltaH === null) {
          if (hAct !== null && hSur !== null && hAct >= hSur) {
            deltaH = parseFloat((hAct - hSur).toFixed(1));
          } else {
            deltaH = 0;
          }
        } else if (hAct === null && hSur !== null) {
          hAct = parseFloat((hSur + deltaH).toFixed(1));
        }

        const hActStr = hAct !== null ? formatCleanHoro(hAct) : '—';

        const consumoLh = parseFloat(t.consumo_lh) || 10;
        const combustibleConsumido = Math.round(deltaH * consumoLh);

        const subActual = parseFloat(t.subtanque_actual) || 0;
        const stockBruto = isMultiPlant ? (subActual + Math.round(sharedReserva / siteTanks.length)) : (subActual + sharedReserva);
        const stockNeto = Math.max(0, Math.round(stockBruto - combustibleConsumido));

        const autNetoH = consumoLh > 0 ? parseFloat((stockNeto / consumoLh).toFixed(1)) : 0;
        const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));

        const isCrit = diasAutNeto < 1.5;
        const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
        const status = isCrit ? 'critico' : (isAlert ? 'alerta' : 'optimo');
        const statusText = isCrit ? 'Crítico (<1.5d)' : isAlert ? 'Alerta (1.5-3d)' : 'Óptimo (>3d)';
        const badgeColor = isCrit ? '#ef4444' : isAlert ? '#f59e0b' : '#10b981';
        const badgeBg = isCrit ? 'rgba(239,68,68,0.12)' : isAlert ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';

        return {
          ...t,
          sn,
          plantKey,
          isMultiPlant,
          sharedReserva,
          sharedCapReserva,
          sumSubtanques,
          totNodo,
          lastRefill,
          fechaSur,
          hSur,
          hSurStr,
          hAct,
          hActStr,
          deltaH,
          combustibleConsumido,
          stockNeto,
          autNetoH,
          diasAutNeto,
          status,
          statusText,
          badgeColor,
          badgeBg
        };
      });

      const filtered = enrichedTanks.filter(t => {
        const tankRegion = (t.region || 'Zulia').toLowerCase();
        if (regionFilter !== 'all' && tankRegion !== regionFilter.toLowerCase()) return false;
        if (zonaFilter !== 'all' && t.zona !== zonaFilter) return false;
        if (statusFilter !== 'all') {
          if (statusFilter === 'optimo' && t.status !== 'optimo') return false;
          if (statusFilter === 'alerta' && t.status !== 'alerta') return false;
          if (statusFilter === 'critico' && t.status !== 'critico') return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const matchLugar = (t.lugar || '').toLowerCase().includes(q);
          const matchEq = (t.equipo || '').toLowerCase().includes(q);
          const matchTag = (t.tag || '').toLowerCase().includes(q);
          const matchZona = (t.zona || '').toLowerCase().includes(q);
          if (!matchLugar && !matchEq && !matchTag && !matchZona) return false;
        }
        return true;
      });

      const totalLtsRedNeto = filtered.reduce((acc, t) => acc + t.stockNeto, 0);
      const totalHorasOpRed = filtered.reduce((acc, t) => acc + t.deltaH, 0);
      const totalConsumoEstRed = filtered.reduce((acc, t) => acc + t.combustibleConsumido, 0);
      const optimos = filtered.filter(t => t.status === 'optimo').length;
      const alertas = filtered.filter(t => t.status === 'alerta').length;
      const criticos = filtered.filter(t => t.status === 'critico').length;

      const generateAutonomiaReportText = () => {
        const uniqueSites = [];
        const seen = new Set();
        filtered.forEach(t => {
          const sn = normFn(t.lugar);
          if (!seen.has(sn)) {
            seen.add(sn);
            uniqueSites.push(sn);
          }
        });

        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        let lines = [
          `Reporte de Autonomía y Combustible en Nodos (Coordinación de Grupos Electrógenos)`,
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Nodos Listados: ${uniqueSites.length}`,
          ''
        ];

        let totSub = 0;
        let totRes = 0;

        uniqueSites.forEach(sn => {
          const st = filtered.filter(t => normFn(t.lugar) === sn);
          const lugarName = st[0]?.lugar || sn;
          const isMulti = st.length > 1;

          const sharedRes = st.reduce((max, t) => Math.max(max, parseFloat(t.reserva_lts) || 0), 0);
          const sumSub = st.reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
          const totNodo = sumSub + sharedRes;

          totSub += sumSub;
          totRes += sharedRes;

          const totalConsumo = st.reduce((acc, t) => acc + (parseFloat(t.consumo_lh) || 10), 0);
          const autTotH = totalConsumo > 0 ? Math.round(totNodo / totalConsumo * 10) / 10 : 0;
          const diasAut = Math.round(autTotH / 24.0 * 10) / 10;

          if (isMulti) {
            const subsDetail = st.map(t => `${t.tag}: ${t.subtanque_actual}L`).join(', ');
            lines.push(`• ${lugarName}:`);
            lines.push(`  Planta: ${sumSub} Lts (${subsDetail}) | Reserva: ${sharedRes} Lts | Total: ${totNodo} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          } else {
            lines.push(`• ${lugarName}:`);
            lines.push(`  Planta: ${sumSub} Lts | Reserva: ${sharedRes} Lts | Total: ${totNodo} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          }
        });

        lines.push('');
        lines.push('══════════════════════════════════════════════');
        lines.push(`Total Gasoil: ${totSub + totRes} Lts (Plantas: ${totSub} Lts | Reservas: ${totRes} Lts)`);

        return lines.join('\n');
      };

      const copyReport = () => {
        const text = generateAutonomiaReportText();
        navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2200);
          if (toast) toast('¡Reporte copiado al portapapeles!', 'success');
        });
      };

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(t => ({
          'ZONA': t.zona,
          'LUGAR / DATACENTER': t.lugar,
          'EQUIPO': t.equipo,
          'TAG PLANTA': t.tag,
          'POTENCIA (kVA)': t.kva,
          'ÚLTIMO SURTIDO FECHA': t.fechaSur,
          'HORÓMETRO ÚLTIMO SURTIDO': t.hSurStr,
          'HORÓMETRO ACTUAL': t.hActStr,
          'HORAS OP. ACUMULADAS': t.deltaH,
          'CONSUMO ESTIMADO (Lts)': t.combustibleConsumido,
          'SUB-TANQUE (Lts)': t.subtanque_actual,
          'CAPACIDAD SUB-TANQUE (Lts)': t.tanque_lts,
          'RESERVA ACTUAL (Lts)': t.reserva_lts,
          'CAPACIDAD RESERVA (Lts)': t.cap_reserva,
          'TOTAL EN NODO (Lts)': (t.subtanque_actual || 0) + (t.reserva_lts || 0),
          'CONSUMO (L/h)': t.consumo_lh,
          'GASOIL NETO REAL (Lts)': t.stockNeto,
          'AUTONOMÍA NETA (h)': t.autNetoH,
          'AUTONOMÍA NETA (Días)': t.diasAutNeto,
          'ESTADO': t.statusText
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 18 }, { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Autonomía de Combustible');
        XLSX.writeFile(wb, 'reporte_autonomia_combustible_' + Date.now() + '.xlsx');
      };

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Estado de Tanques y Autonomía de Combustible
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Monitoreo de almacenamiento de gasoil, consumos y proyección de días de respaldo continuo.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                onClick={onOpenBatchHoroModal}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Actualizar Horómetros
              </button>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                onClick={() => setShowImageModal(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Cuadro para WhatsApp
              </button>
              <button className="bs" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={exportExcel}>
                <IconExcel size={16} color="#10b981" />
                Descargar Excel
              </button>
            </div>
          </div>

          {/* Tarjetas KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
            {/* Card 1: Total Gasoil Neto */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 22h12M4 9h10M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Gasoil Neto</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--tx1)', marginTop: 2, whiteSpace: 'nowrap' }}>{totalLtsRedNeto.toLocaleString()} Lts</div>
              </div>
            </div>

            {/* Card 2: Horas Op. Acumuladas */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Horas Op. Acumuladas</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b', marginTop: 2, whiteSpace: 'nowrap' }}>+{totalHorasOpRed.toFixed(1)} h</div>
              </div>
            </div>

            {/* Card 3: Nodos Óptimos (>3D) */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Nodos Óptimos (&gt;3d)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>{optimos}</div>
              </div>
            </div>

            {/* Card 4: Nodos Críticos (<1.5D) */}
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ width: 44, height: 44, minWidth: 44, borderRadius: 10, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Nodos Críticos (&lt;1.5d)</div>
                <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444', marginTop: 2 }}>{criticos}</div>
              </div>
            </div>
          </div>

          {/* Formato de Texto Rápido para WhatsApp / Slack */}
          <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="fd" style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Reporte Rápido de Autonomía y Stock para WhatsApp
                </span>
                <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>
                  (Con Horómetros y Horas de Operación Acumuladas)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="bs" style={{ padding: '4px 10px', fontSize: '.72rem' }} onClick={() => setShowTextReport(!showTextReport)}>
                  {showTextReport ? 'Ocultar' : 'Mostrar'}
                </button>
                <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={copyReport}>
                  <IconCopy size={14} />
                  {copySuccess ? '¡Copiado!' : 'Copiar Reporte'}
                </button>
              </div>
            </div>

            {showTextReport && (
              <textarea
                className="fi fm"
                readOnly
                value={generateAutonomiaReportText()}
                style={{
                  width: '100%',
                  height: 160,
                  fontSize: '.82rem',
                  lineHeight: 1.55,
                  resize: 'vertical',
                  background: 'var(--bg-surface)',
                  color: 'var(--tx1)',
                  padding: '10px 14px',
                  borderRadius: 8
                }}
              />
            )}
          </div>

          {/* Filtros */}
          <div className="card" style={{ padding: '14px 18px', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Región</label>
                <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todas las Regiones</option>
                  <option value="zulia">Zulia</option>
                  <option value="falcon">Falcón</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Zona Geográfica</label>
                <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                  {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Estado de Autonomía</label>
                <select className="fi" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '.84rem' }}>
                  <option value="all">Todos los Estados</option>
                  <option value="optimo">Óptimos (&gt;3 días)</option>
                  <option value="alerta">Alerta (1.5 - 3 días)</option>
                  <option value="critico">Críticos (&lt;1.5 días)</option>
                </select>
              </div>

              <div>
                <label className="lbl" style={{ fontSize: '.7rem', marginBottom: 4 }}>Búsqueda</label>
                <input className="fi" type="text" placeholder="Buscar lugar o planta..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 14px', fontSize: '.84rem' }} />
              </div>
            </div>
          </div>

          {/* Tabla de Autonomías con Horas de Operación Acumuladas */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    <th style={{ padding: '12px 16px' }}>Lugar / Datacenter</th>
                    <th style={{ padding: '12px 14px' }}>Equipo & Consumo</th>
                    <th style={{ padding: '12px 14px' }}>Último Surtido & Horas Op.</th>
                    <th style={{ padding: '12px 14px' }}>Sub-tanque</th>
                    <th style={{ padding: '12px 14px' }}>Reserva Externa</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Gasoil Neto</th>
                    <th style={{ padding: '12px 14px' }}>Autonomía Neta</th>
                    <th style={{ padding: '12px 14px' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, i) => {
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{t.lugar}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{t.zona}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx1)' }}>{t.equipo}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--blue)', fontFamily: "'JetBrains Mono', monospace" }}>{t.tag} • {t.consumo_lh} L/h</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontSize: '.76rem', color: 'var(--tx1)', fontWeight: 600 }}>{t.fechaSur} (Horo: {t.hSurStr})</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Horómetro Actual (calcula Delta H automáticamente)">
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>H.Act:</span>
                              <input
                                type="number"
                                step="0.1"
                                value={t.hAct !== null ? t.hAct : ''}
                                placeholder={t.hSur !== null ? t.hSur : '0'}
                                onChange={(e) => onUpdatePlantHorometer && onUpdatePlantHorometer(t.tag || t.sn, { horometro_actual: e.target.value, hSur: t.hSur })}
                                style={{
                                  width: '68px',
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '5px',
                                  color: 'var(--blue)',
                                  fontSize: '.74rem',
                                  fontWeight: 700,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  padding: '2px 4px',
                                  textAlign: 'right'
                                }}
                              />
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="Horas acumuladas trabajadas post-surtido (Delta H)">
                              <span style={{ fontSize: '.74rem', fontWeight: 800, color: t.deltaH > 20 ? '#f59e0b' : 'var(--blue)' }}>+</span>
                              <input
                                type="number"
                                step="0.1"
                                value={t.deltaH !== undefined && t.deltaH !== null ? t.deltaH : ''}
                                placeholder="0.0"
                                onChange={(e) => onUpdatePlantHorometer && onUpdatePlantHorometer(t.tag || t.sn, { delta_h: e.target.value, hSur: t.hSur })}
                                style={{
                                  width: '54px',
                                  background: t.deltaH > 20 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-surface)',
                                  border: `1px solid ${t.deltaH > 20 ? 'rgba(245, 158, 11, 0.45)' : 'var(--border)'}`,
                                  borderRadius: '5px',
                                  color: t.deltaH > 20 ? '#f59e0b' : 'var(--tx1)',
                                  fontSize: '.74rem',
                                  fontWeight: 800,
                                  fontFamily: "'JetBrains Mono', monospace",
                                  padding: '2px 4px',
                                  textAlign: 'center'
                                }}
                              />
                              <span style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>h op</span>
                            </div>
                          </div>
                          {t.combustibleConsumido > 0 && (
                            <div style={{ fontSize: '.68rem', color: 'var(--tx3)', marginTop: 2 }}>
                              ~{t.combustibleConsumido}L quemados ({t.consumoLh} L/h)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{t.subtanque_actual} / {t.tanque_lts} Lts</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontWeight: 700, color: t.sharedReserva > 0 ? 'var(--green)' : 'var(--tx3)' }}>
                            {t.sharedReserva} {t.sharedCapReserva > 0 ? `/ ${t.sharedCapReserva}` : ''} Lts
                          </div>
                          {t.isMultiPlant && (
                            <div style={{ fontSize: '.68rem', color: 'var(--blue)', fontWeight: 600, marginTop: 1 }}>
                              (Compartida en Datacenter)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx1)' }}>{t.stockNeto.toLocaleString()} Lts</div>
                          <div style={{ fontSize: '.68rem', color: 'var(--tx3)' }}>Bruto: {t.totNodo}L</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: t.badgeColor }}>
                            {t.diasAutNeto} Días
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>({t.autNetoH} horas continuas)</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, fontSize: '.74rem', fontWeight: 700, background: t.badgeBg, color: t.badgeColor }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.badgeColor }} />
                            {t.statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal de Exportación de Cuadro en Imagen para WhatsApp */}
          {showImageModal && (() => {
            const modalTanks = filtered.filter(t => {
              if (modalZoneFilter === 'dc_sedes') return t.tipo === 'datacenter' || t.tipo === 'sede';
              if (modalZoneFilter === 'maracaibo') return t.zona === 'Maracaibo' && t.tipo === 'nodo';
              if (modalZoneFilter === 'col') return t.zona === 'Costa Oriental del Lago';
              if (modalZoneFilter === 'subregiones') return !['Maracaibo', 'Costa Oriental del Lago', 'San Francisco', 'Móvil'].includes(t.zona) || t.zona.includes('Guajira') || t.zona.includes('Perijá') || t.zona.includes('Cañada') || t.zona.includes('Lossada');
              return true;
            });

            const modalTotNeto = modalTanks.reduce((acc, t) => acc + (t.stockNeto || 0), 0);
            const modalTotSub = modalTanks.reduce((acc, t) => acc + (parseFloat(t.subtanque_actual) || 0), 0);
            const modalTotRes = modalTanks.reduce((acc, t) => acc + (parseFloat(t.sharedReserva) || 0), 0);
            const modalTotDeltaH = modalTanks.reduce((acc, t) => acc + (t.deltaH || 0), 0);
            const modalTotConsumo = modalTanks.reduce((acc, t) => acc + (t.combustibleConsumido || 0), 0);
            const modalOptimos = modalTanks.filter(t => t.status === 'optimo').length;
            const modalAlertas = modalTanks.filter(t => t.status === 'alerta').length;
            const modalCriticos = modalTanks.filter(t => t.status === 'critico').length;

            const dcTanks = modalTanks.filter(t => t.tipo === 'datacenter');
            const sedeTanks = modalTanks.filter(t => t.tipo === 'sede');
            const mcboTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona === 'Maracaibo');
            const colTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona === 'Costa Oriental del Lago');
            const subregTanks = modalTanks.filter(t => t.tipo === 'nodo' && t.zona !== 'Maracaibo' && t.zona !== 'Costa Oriental del Lago');
            const auxTanks = modalTanks.filter(t => t.tipo === 'auxiliar');

            const groups = [
              { title: 'Datacenters de Misión Crítica', items: dcTanks, iconColor: '#0166ff', badge: 'Tier III High-Availability' },
              { title: 'Sedes Principales & Oficinas Administrativas', items: sedeTanks, iconColor: '#21c0fa', badge: 'Continuidad de Operaciones' },
              { title: 'Nodos Zona Maracaibo & Atlantis', items: mcboTanks, iconColor: '#38bdf8', badge: 'Red Troncal Metropolitana' },
              { title: 'Nodos Costa Oriental del Lago (COL)', items: colTanks, iconColor: '#06b6d4', badge: 'Red Troncal Este' },
              { title: 'Nodos Sub Regiones (Guajira, Perijá, Cañada, Lossada)', items: subregTanks, iconColor: '#8b5cf6', badge: 'Red Foránea & Sub-regiones' },
              { title: 'Unidades Móviles & Generadores Auxiliares', items: auxTanks, iconColor: '#f59e0b', badge: 'Respaldo Móvil' }
            ].filter(g => g.items.length > 0);

            const activeZoneLabel = modalZoneFilter === 'dc_sedes' ? 'Datacenters & Sedes' :
              modalZoneFilter === 'maracaibo' ? 'Zona Maracaibo' :
              modalZoneFilter === 'col' ? 'Costa Oriental del Lago' :
              modalZoneFilter === 'subregiones' ? 'Sub Regiones' : 'Toda la Red';

            return (
              <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div className="card fin" style={{ width: '96%', maxWidth: 1120, maxHeight: '92vh', overflowY: 'auto', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  {/* Header del Modal */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0166ff', boxShadow: '0 0 10px #0166ff' }} />
                        Exportador de Cuadro Gráfico para WhatsApp
                      </h3>
                      <p style={{ fontSize: '.8rem', color: 'var(--tx3)', margin: '4px 0 0' }}>
                        Diseño corporativo oficial Airtek Energy en alta definición. Listo para copiar al portapapeles y pegar directo con <kbd style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>Ctrl + V</kbd>.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="bp"
                        disabled={generatingImg}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', fontSize: '.84rem' }}
                        onClick={async () => {
                          const cardEl = document.getElementById('airtek-executive-fuel-card');
                          if (!cardEl) return;
                          const html2canvas = await loadHtml2Canvas();
                          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
                            canvas.toBlob(blob => {
                              if (navigator.clipboard && navigator.clipboard.write) {
                                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                                  setGeneratingImg(false);
                                  if (toast) toast('¡Imagen copiada al portapapeles! Pégala en WhatsApp con Ctrl + V.', 'success');
                                }).catch(() => {
                                  const link = document.createElement('a');
                                  link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                                  link.href = canvas.toDataURL('image/png');
                                  link.click();
                                  setGeneratingImg(false);
                                  if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                                });
                              } else {
                                const link = document.createElement('a');
                                link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                                link.href = canvas.toDataURL('image/png');
                                link.click();
                                setGeneratingImg(false);
                                if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                              }
                            });
                          }).catch(e => {
                            setGeneratingImg(false);
                            if (toast) toast('Error al generar imagen: ' + e.message, 'error');
                          });
                        }}
                      >
                        <IconCopy size={16} />
                        {generatingImg ? 'Generando Imagen...' : 'Copiar Imagen (WhatsApp)'}
                      </button>
                      <button
                        className="bs"
                        disabled={generatingImg}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: '.84rem' }}
                        onClick={async () => {
                          const cardEl = document.getElementById('airtek-executive-fuel-card');
                          if (!cardEl) return;
                          const html2canvas = await loadHtml2Canvas();
                          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
                            const link = document.createElement('a');
                            link.download = `reporte_combustible_airtek_${Date.now()}.png`;
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            setGeneratingImg(false);
                            if (toast) toast('¡Imagen PNG descargada con éxito!', 'success');
                          }).catch(e => {
                            setGeneratingImg(false);
                            if (toast) toast('Error: ' + e.message, 'error');
                          });
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Descargar PNG
                      </button>
                      <button className="bs" onClick={() => setShowImageModal(false)} style={{ padding: '9px 16px' }}>
                        ✕ Cerrar
                      </button>
                    </div>
                  </div>

                  {/* Selector Rápido de Zona / Grupo */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Corte Visual:
                    </span>
                    {[
                      { id: 'all', label: 'Toda la Red', count: filtered.length },
                      { id: 'dc_sedes', label: 'Datacenters & Sedes', count: filtered.filter(t => t.tipo === 'datacenter' || t.tipo === 'sede').length },
                      { id: 'maracaibo', label: 'Maracaibo', count: filtered.filter(t => t.zona === 'Maracaibo' && t.tipo === 'nodo').length },
                      { id: 'col', label: 'Costa Oriental', count: filtered.filter(t => t.zona === 'Costa Oriental del Lago').length },
                      { id: 'subregiones', label: 'Sub Regiones', count: filtered.filter(t => !['Maracaibo', 'Costa Oriental del Lago', 'San Francisco', 'Móvil'].includes(t.zona) || t.zona.includes('Guajira') || t.zona.includes('Perijá') || t.zona.includes('Cañada') || t.zona.includes('Lossada')).length }
                    ].map(btn => {
                      const isActive = modalZoneFilter === btn.id;
                      return (
                        <button
                          key={btn.id}
                          onClick={() => setModalZoneFilter(btn.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontSize: '.75rem',
                            fontWeight: 700,
                            fontFamily: "'Montserrat', sans-serif",
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            background: isActive ? 'linear-gradient(135deg, #0166ff 0%, #21c0fa 100%)' : 'var(--bg-surface)',
                            color: isActive ? '#ffffff' : 'var(--tx2)',
                            border: isActive ? '1px solid #0166ff' : '1px solid var(--border)',
                            boxShadow: isActive ? '0 2px 10px rgba(1, 102, 255, 0.35)' : 'none'
                          }}
                        >
                          <span>{btn.label}</span>
                          <span style={{
                            background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-elevated)',
                            color: isActive ? '#ffffff' : 'var(--tx3)',
                            padding: '1px 6px',
                            borderRadius: 10,
                            fontSize: '.68rem',
                            fontWeight: 800
                          }}>
                            {btn.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Previsualización del Cuadro Gráfico (Elemento capturado por html2canvas) */}
                  <div style={{ overflowX: 'auto', padding: 12, background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 14, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}` }}>
                    <div
                      id="airtek-executive-fuel-card"
                      style={{
                        width: '1060px',
                        padding: '28px 32px',
                        background: isDark ? '#121214' : '#ffffff',
                        borderRadius: 16,
                        fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        color: isDark ? '#f8fafc' : '#090d16',
                        boxShadow: isDark ? '0 25px 50px rgba(0,0,0,0.85)' : '0 10px 30px rgba(0,0,0,0.06)',
                        border: isDark ? '1px solid #26262a' : '1px solid #e2e8f0'
                      }}
                    >
                      {/* Banner Superior Corporativo Airtek */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '2px solid rgba(1, 102, 255, 0.35)' : '2px solid rgba(1, 102, 255, 0.25)', paddingBottom: 18, marginBottom: 20 }}>
                        <div>
                          <div style={{ fontSize: '.78rem', fontWeight: 800, color: isDark ? '#21c0fa' : '#0166ff', letterSpacing: '.14em', textTransform: 'uppercase' }}>
                            AIRTEK ENERGY • COORDINACIÓN DE GRUPOS ELECTRÓGENOS
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#ffffff' : '#090d16', letterSpacing: '-0.02em', marginTop: 2, fontFamily: "'Heading Pro Wide', 'Outfit', 'Montserrat', sans-serif" }}>
                            ESTADO DE COMBUSTIBLE & AUTONOMÍA EN NODOS
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 20, background: isDark ? 'rgba(1, 102, 255, 0.15)' : 'rgba(1, 102, 255, 0.08)', border: isDark ? '1px solid rgba(1, 102, 255, 0.4)' : '1px solid rgba(1, 102, 255, 0.25)', fontSize: '.8rem', fontWeight: 800, color: isDark ? '#60a5fa' : '#0166ff', marginBottom: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#21c0fa', boxShadow: '0 0 8px #21c0fa' }} />
                            <span>{activeZoneLabel.toUpperCase()}</span>
                            {regionFilter !== 'all' && <span>• {regionFilter.toUpperCase()}</span>}
                          </div>
                          <div style={{ fontSize: '.74rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                            Fecha de Corte: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</strong> • {new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>

                      {/* Resumen KPI Ejecutivo (4 Tarjetas con Indicadores Clave) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
                        {/* KPI 1 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #0166ff, #21c0fa)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Total Gasoil Neto</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#21c0fa" strokeWidth="2.2"><path d="M3 2v20M21 2v20M12 2v20M3 12h18"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#38bdf8' : '#0284c7', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            {modalTotNeto.toLocaleString()} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4, display: 'flex', gap: 6 }}>
                            <span>Sub: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTotSub.toLocaleString()}L</strong></span>
                            <span>•</span>
                            <span>Res: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTotRes.toLocaleString()}L</strong></span>
                          </div>
                        </div>

                        {/* KPI 2 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Horas Op. Acumuladas</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#f59e0b' : '#d97706', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            +{modalTotDeltaH.toFixed(1)} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>hrs</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4 }}>
                            Operación registrada post-surtido
                          </div>
                        </div>

                        {/* KPI 3 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #ef4444, #f87171)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Consumo Estimado</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                          </div>
                          <div style={{ fontSize: '1.45rem', fontWeight: 900, color: isDark ? '#ef4444' : '#dc2626', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                            ~{modalTotConsumo.toLocaleString()} <span style={{ fontSize: '.84rem', fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 4 }}>
                            Combustible consumido en ciclo
                          </div>
                        </div>

                        {/* KPI 4 */}
                        <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '14px 18px', borderRadius: 12, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0', position: 'relative', overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.06em' }}>Semáforo de Disponibilidad</div>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(21, 128, 61, 0.12)', color: isDark ? '#10b981' : '#15803d', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(21, 128, 61, 0.25)'}` }}>
                              {modalOptimos} Ópt
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.12)', color: isDark ? '#f59e0b' : '#d97706', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(217, 119, 6, 0.25)'}` }}>
                              {modalAlertas} Alert
                            </span>
                            <span style={{ padding: '3px 8px', borderRadius: 6, background: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.12)', color: isDark ? '#ef4444' : '#dc2626', fontWeight: 800, fontSize: '.76rem', border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(220, 38, 38, 0.25)'}` }}>
                              {modalCriticos} Crít
                            </span>
                          </div>
                          <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', marginTop: 6 }}>
                            Total: <strong style={{ color: isDark ? '#cbd5e1' : '#090d16' }}>{modalTanks.length}</strong> plantas monitoreadas
                          </div>
                        </div>
                      </div>

                      {/* Tabla Estilizada con Agrupación y Barras Visuales de Autonomía */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: isDark ? '#141416' : '#f1f5f9', borderBottom: isDark ? '2px solid #27272a' : '2px solid #cbd5e1', color: isDark ? '#a1a1aa' : '#475569', textTransform: 'uppercase', fontSize: '.66rem', letterSpacing: '.06em' }}>
                            <th style={{ padding: '10px 14px' }}>Lugar / Nodo</th>
                            <th style={{ padding: '10px 10px' }}>Planta & Tag</th>
                            <th style={{ padding: '10px 10px' }}>Último Surtido</th>
                            <th style={{ padding: '10px 10px' }}>Horómetro Actual</th>
                            <th style={{ padding: '10px 10px', textAlign: 'center' }}>Horas Op. (+Δh)</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gasoil Neto</th>
                            <th style={{ padding: '10px 12px' }}>Autonomía Neta</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((grp, gIdx) => {
                            const groupTotLts = grp.items.reduce((acc, t) => acc + (t.stockNeto || 0), 0);
                            return (
                              <React.Fragment key={gIdx}>
                                {/* Separador de Grupo / Categoría */}
                                <tr style={{ background: isDark ? 'linear-gradient(90deg, rgba(1, 102, 255, 0.15) 0%, #18181b 100%)' : 'linear-gradient(90deg, rgba(1, 102, 255, 0.08) 0%, rgba(241, 245, 249, 0.95) 100%)', borderTop: isDark ? '2px solid rgba(1, 102, 255, 0.35)' : '2px solid rgba(1, 102, 255, 0.2)', borderBottom: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                                  <td colSpan={8} style={{ padding: '7px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: grp.iconColor }} />
                                        <span style={{ fontSize: '.75rem', fontWeight: 800, color: isDark ? '#f8fafc' : '#090d16', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                                          {grp.title}
                                        </span>
                                        <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b', background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>
                                          {grp.items.length} {grp.items.length === 1 ? 'unidad' : 'unidades'}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '.72rem', color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                                        Total Grupo: {groupTotLts.toLocaleString()} Lts
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Filas del Grupo */}
                                {grp.items.map((t, idx) => {
                                  const autPct = Math.min(100, Math.round((t.diasAutNeto / 7) * 100));
                                  const barGradient = t.diasAutNeto >= 3 ? 'linear-gradient(90deg, #10b981, #34d399)' :
                                    t.diasAutNeto >= 1.5 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)';

                                  return (
                                    <tr key={idx} style={{ borderBottom: isDark ? '1px solid #222226' : '1px solid #e2e8f0', background: (idx % 2 === 0) ? (isDark ? '#141416' : '#ffffff') : (isDark ? '#18181b' : '#f8fafc') }}>
                                      <td style={{ padding: '9px 14px' }}>
                                        <div style={{ fontWeight: 800, color: isDark ? '#ffffff' : '#090d16', fontSize: '.84rem' }}>{t.lugar}</div>
                                        <div style={{ fontSize: '.68rem', color: isDark ? '#64748b' : '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                          <span>{t.zona}</span>
                                          {t.kva && <span>• {t.kva} kVA</span>}
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace", fontSize: '.8rem' }}>{t.tag}</div>
                                        <div style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>Consumo: {t.consumo_lh} L/h</div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#090d16' }}>{t.fechaSur}</div>
                                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {t.hSurStr}</div>
                                      </td>
                                      <td style={{ padding: '9px 10px' }}>
                                        <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace", fontSize: '.84rem' }}>
                                          {t.hActStr}
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: 6,
                                          fontSize: '.72rem',
                                          fontWeight: 800,
                                          background: t.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(217, 119, 6, 0.12)') : (t.deltaH > 0 ? (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.1)') : (isDark ? 'rgba(100, 116, 139, 0.15)' : 'rgba(100, 116, 139, 0.08)')),
                                          color: t.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (t.deltaH > 0 ? (isDark ? '#38bdf8' : '#0166ff') : (isDark ? '#94a3b8' : '#64748b')),
                                          border: `1px solid ${t.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)') : (t.deltaH > 0 ? (isDark ? 'rgba(33, 192, 250, 0.3)' : 'rgba(1, 102, 255, 0.25)') : (isDark ? 'rgba(100, 116, 139, 0.3)' : 'rgba(100, 116, 139, 0.2)'))}`
                                        }}>
                                          +{t.deltaH.toFixed(1)} h
                                        </span>
                                        {t.combustibleConsumido > 0 && (
                                          <div style={{ fontSize: '.64rem', color: isDark ? '#ef4444' : '#dc2626', fontWeight: 600, marginTop: 2 }}>
                                            ~{t.combustibleConsumido} L quemados
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                        <div style={{ fontSize: '.96rem', fontWeight: 900, color: isDark ? '#10b981' : '#15803d', fontFamily: "'JetBrains Mono', monospace" }}>
                                          {t.stockNeto.toLocaleString()} <span style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>Lts</span>
                                        </div>
                                        <div style={{ fontSize: '.64rem', color: isDark ? '#64748b' : '#64748b' }}>
                                          Sub: {t.subtanque_actual}L | Res: {t.sharedReserva}L
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                          <span style={{ fontWeight: 800, color: t.badgeColor, fontSize: '.9rem' }}>{t.diasAutNeto} Días</span>
                                          <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>({t.autNetoH}h)</span>
                                        </div>
                                        {/* Barra Visual de Nivel de Autonomía */}
                                        <div style={{ width: '100%', maxWidth: 110, height: 5, background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                                          <div style={{
                                            width: `${autPct}%`,
                                            height: '100%',
                                            background: barGradient,
                                            borderRadius: 3
                                          }} />
                                        </div>
                                      </td>
                                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          padding: '3px 9px',
                                          borderRadius: 6,
                                          fontSize: '.7rem',
                                          fontWeight: 800,
                                          background: t.badgeBg,
                                          color: t.badgeColor,
                                          border: `1px solid ${t.badgeColor}40`
                                        }}>
                                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.badgeColor, boxShadow: `0 0 6px ${t.badgeColor}` }} />
                                          {t.statusText}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Footer Oficial del Cuadro */}
                      <div style={{ marginTop: 18, paddingTop: 12, borderTop: isDark ? '1px solid #26262a' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.7rem', color: isDark ? '#71717a' : '#64748b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isDark ? '#10b981' : '#15803d' }} />
                          <span>Airtek Energy • Coordinación de Grupos Electrógenos • Monitoreo de Red 24/7</span>
                        </div>
                        <div>
                          Generado el {new Date().toLocaleString('es-VE')} • Sistema Oficial
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}</div>
      );
    }

export { TanquesAutonomiaView };
export default TanquesAutonomiaView;
