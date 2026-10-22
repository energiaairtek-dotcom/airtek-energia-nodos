import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from 'react';
import { db } from '@/services/firebase';
import { loadXLSX, loadHtml2Canvas } from '@/utils/exportLibs';
import { normalizeNodeName, formatCleanHoro, parseHorometerToHours } from '@/utils/formatters';
import { IconExcel, IconCopy } from '@/components/icons';
import { PlantasQuickList } from '@/modules/fuel/views/PlantasQuickList';
import { generateFuelReportText } from '@/modules/fuel/fuelUtils';

function SurtidosView({ refills = [], tanks = [], maintenances = [], customHorometers = {}, onUpdatePlantHorometer, onOpenBatchHoroModal, onOpenNewModal, onSelectPlant, onOpenAdjustModal, onDeleteRefill, toast }) {
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

      // Sub-pestaña interna: 'historial' (por defecto) o 'reporte'
      const [surtidosTab, setSurtidosTab] = useState('historial'); // historial | reporte

      // Filtros
      const [regionFilter, setRegionFilter] = useState('all'); // all | zulia | falcon
      const [zonaFilter, setZonaFilter] = useState('all');
      const [semanaFilter, setSemanaFilter] = useState('all');
      const [lugarFilter, setLugarFilter] = useState('all');
      const [search, setSearch] = useState('');

      // Paginación para Historial de Despachos
      const [page, setPage] = useState(1);
      const [pageSize, setPageSize] = useState(15);

      // Reiniciar paginación al cambiar cualquier filtro
      useEffect(() => {
        setPage(1);
      }, [search, regionFilter, zonaFilter, semanaFilter, lugarFilter]);

      // Estado de reportes ejecutivos
      const [reportMode, setReportMode] = useState('cuadro'); // cuadro | monospace | lista | surtidos
      const [showTextReport, setShowTextReport] = useState(true);
      const [copySuccess, setCopySuccess] = useState(false);
      const [showImageModal, setShowImageModal] = useState(false);
      const [generatingImg, setGeneratingImg] = useState(false);

      const normFn = normalizeNodeName;

      // Función auxiliar para parsear fechas de surtido
      const parseRefillDate = str => {
        if (!str) return null;
        let datePart = String(str);
        if (datePart.includes(' / ')) {
          const parts = datePart.split(' / ');
          datePart = parts[parts.length - 1].trim();
        }
        if (/^\d{4}-\d{2}-\d{2}/.test(datePart)) {
          const d = new Date(datePart.replace(' ', 'T'));
          if (!isNaN(d.getTime())) return d;
        }
        const m = datePart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (m) {
          const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
          if (!isNaN(d.getTime())) return d;
        }
        const d = new Date(datePart);
        return isNaN(d.getTime()) ? null : d;
      };

      const uniqueSemanas = Array.from(new Set(refills.map(r => r.semana))).filter(Boolean);
      const uniqueZonas = Array.from(new Set(tanks.map(t => t.zona))).filter(Boolean).sort();
      const uniqueLugares = Array.from(new Set([...refills.map(r => r.lugar), ...tanks.map(t => t.lugar)])).filter(Boolean).sort();

      // Vercel Best Practice: rerender-use-deferred-value - Instant typing in search
      const deferredSearch = useDeferredValue(search);

      // Vercel Best Practice: js-index-maps - O(1) tank lookup Map instead of O(N*M) nested .find() loops
      const tanksLookup = useMemo(() => {
        const byTag = new Map();
        const byNormLugar = new Map();
        for (let i = 0; i < tanks.length; i++) {
          const t = tanks[i];
          if (t.tag) byTag.set(t.tag, t);
          const nl = normalizeNodeName(t.lugar);
          if (nl && !byNormLugar.has(nl)) byNormLugar.set(nl, t);
        }
        return { byTag, byNormLugar };
      }, [tanks]);

      // Vercel Best Practice: rerender-memo - Memoized filtered refills
      const filtered = useMemo(() => {
        const q = (deferredSearch || '').toLowerCase().trim();
        const regLow = regionFilter !== 'all' ? regionFilter.toLowerCase() : null;
        return refills.filter(r => {
          const matchingTank = (r.tag && tanksLookup.byTag.get(r.tag)) || tanksLookup.byNormLugar.get(normalizeNodeName(r.lugar)) || {};
          const tankRegion = (matchingTank.region || 'Zulia').toLowerCase();
          const tankZona = matchingTank.zona || '';

          if (regLow && tankRegion !== regLow) return false;
          if (zonaFilter !== 'all' && tankZona !== zonaFilter) return false;
          if (semanaFilter !== 'all' && r.semana !== semanaFilter) return false;
          if (lugarFilter !== 'all' && r.lugar !== lugarFilter) return false;
          if (q) {
            const matchLugar = (r.lugar || '').toLowerCase().includes(q);
            const matchTag = (r.tag || '').toLowerCase().includes(q);
            const matchTec = (r.tecnico || '').toLowerCase().includes(q);
            if (!matchLugar && !matchTag && !matchTec) return false;
          }
          return true;
        });
      }, [refills, tanksLookup, regionFilter, zonaFilter, semanaFilter, lugarFilter, deferredSearch]);

      // Vercel Best Practice: js-combine-iterations & rerender-memo - Single pass calculation
      const refillStats = useMemo(() => {
        let totalLitros = 0;
        let totPlanta = 0;
        let totReserva = 0;
        const lugaresSet = new Set();

        for (let i = 0; i < filtered.length; i++) {
          const r = filtered[i];
          const lts = parseFloat(r.litros) || 0;
          totalLitros += lts;
          if (r.lugar) lugaresSet.add(r.lugar);

          const lp = parseFloat(r.litros_planta) || 0;
          const lr = parseFloat(r.litros_reserva) || 0;
          if (lp > 0 || lr > 0) {
            totPlanta += lp;
            totReserva += lr;
          } else {
            const dest = r.destino || '';
            if (dest.includes('Planta')) {
              totPlanta += lts;
            } else {
              totReserva += lts;
            }
          }
        }
        const totalDespachos = filtered.length;
        const lugaresAtendidos = lugaresSet.size;
        const avgLitrosDespacho = totalDespachos > 0 ? Math.round(totalLitros / totalDespachos) : 0;
        return { totalLitros, totalDespachos, lugaresAtendidos, avgLitrosDespacho, totPlanta, totReserva };
      }, [filtered]);

      const { totalLitros, totalDespachos, lugaresAtendidos, avgLitrosDespacho, totPlanta, totReserva } = refillStats;
      const pctPlanta = totalLitros > 0 ? Math.round((totPlanta / totalLitros) * 100) : 0;
      const pctReserva = totalLitros > 0 ? (100 - pctPlanta) : 0;

      // Surtidos en los últimos 30 días
      const now = new Date();
      const maxRefillDate = filtered.reduce((max, r) => {
        const d = parseRefillDate(r.fecha);
        return d && (!max || d > max) ? d : max;
      }, null);
      const hasRecent = filtered.some(r => {
        const d = parseRefillDate(r.fecha);
        return d && (now - d) <= (30 * 24 * 60 * 60 * 1000) && (now - d) >= 0;
      });
      const refDate = hasRecent ? now : (maxRefillDate || now);
      const cutoff30Days = new Date(refDate.getTime() - (30 * 24 * 60 * 60 * 1000));

      const recentRefills = filtered.filter(r => {
        const d = parseRefillDate(r.fecha);
        return d && d >= cutoff30Days && d <= refDate;
      });
      const litrosUltimos30Dias = recentRefills.reduce((acc, r) => acc + (parseFloat(r.litros) || 0), 0);
      const despachosUltimos30Dias = recentRefills.length;

      // Paginación
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const startIndex = (page - 1) * pageSize;
      const endIndex = Math.min(startIndex + pageSize, filtered.length);
      const paginatedRefills = filtered.slice(startIndex, endIndex);

      // Cálculo de resumen ejecutivo con delta de horas operativas (H_act - H_surtido) y combustible consumido
      const getSitesSummaryData = () => {
        let filteredTanks = tanks;
        if (regionFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => (t.region || 'Zulia').toLowerCase() === regionFilter.toLowerCase());
        }
        if (zonaFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => t.zona === zonaFilter);
        }
        if (lugarFilter !== 'all') {
          filteredTanks = filteredTanks.filter(t => normFn(t.lugar) === normFn(lugarFilter));
        }
        if (search) {
          const q = search.toLowerCase();
          filteredTanks = filteredTanks.filter(t => 
            (t.lugar || '').toLowerCase().includes(q) || 
            (t.tag || '').toLowerCase().includes(q) || 
            (t.zona || '').toLowerCase().includes(q)
          );
        }

        return filteredTanks.map(t => {
          const sn = normFn(t.lugar);
          const siteTanks = tanks.filter(x => normFn(x.lugar) === sn);
          const isMulti = siteTanks.length > 1;
          const sharedRes = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.reserva_lts) || 0), 0);
          const sharedCapRes = siteTanks.reduce((max, x) => Math.max(max, parseFloat(x.cap_reserva || x.cap_reserva_lts) || 0), 0);
          const sumSub = siteTanks.reduce((acc, x) => acc + (parseFloat(x.subtanque_actual) || 0), 0);
          const totNodo = sumSub + sharedRes;

          // Buscar último surtido para esta planta específica por tag o por sitio
          const plantRefills = refills.filter(r => r.tag ? r.tag === t.tag : normFn(r.lugar) === sn);
          const lastRefill = plantRefills.length > 0 ? plantRefills[0] : null;

          // Horómetro del último surtido
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

          // Horas de operación acumuladas desde el último surtido (Delta H)
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
          // Combustible consumido estimado desde último surtido
          const combustibleConsumido = Math.round(deltaH * consumoLh);

          // Stock neto disponible en nodo
          const subActual = parseFloat(t.subtanque_actual) || 0;
          const stockBruto = isMulti ? (subActual + Math.round(sharedRes / siteTanks.length)) : (subActual + sharedRes);
          const stockNeto = Math.max(0, Math.round(stockBruto - combustibleConsumido));

          // Autonomía neta
          const autNetoH = consumoLh > 0 ? parseFloat((stockNeto / consumoLh).toFixed(1)) : 0;
          const diasAutNeto = parseFloat((autNetoH / 24.0).toFixed(1));

          const isCrit = diasAutNeto < 1.5;
          const isAlert = diasAutNeto >= 1.5 && diasAutNeto < 3.0;
          const status = isCrit ? 'critico' : (isAlert ? 'alerta' : 'optimo');
          const statusLabel = isCrit ? 'Crítico' : (isAlert ? 'Alerta' : 'Óptimo');

          return {
            t,
            sn,
            plantKey,
            lugar: t.lugar,
            tag: t.tag,
            zona: t.zona,
            region: t.region || 'Zulia',
            equipo: t.equipo || t.tag,
            consumoLh,
            subActual,
            sharedRes,
            sharedCapRes,
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
            statusLabel,
            isMulti
          };
        });
      };

      // Generador del Reporte de Texto (Lista detallada con Delta H y Horómetros)
      const generateAutonomiaReport = () => {
        const data = getSitesSummaryData();
        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        const siteMap = new Map();
        data.forEach(item => {
          if (!siteMap.has(item.sn)) siteMap.set(item.sn, []);
          siteMap.get(item.sn).push(item);
        });

        let lines = [
          `Reporte de Autonomía y Combustible en Nodos (Coordinación de Grupos Electrógenos)`,
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Nodos: ${siteMap.size}`,
          ''
        ];

        let totNetoTotal = 0;
        let totConsumoTotal = 0;

        siteMap.forEach((plants, sn) => {
          const lugarName = plants[0]?.lugar || sn;
          const isMulti = plants.length > 1;
          const sharedRes = plants[0]?.sharedRes || 0;
          const sumSub = plants.reduce((acc, p) => acc + p.subActual, 0);
          const sumNeto = plants.reduce((acc, p) => acc + p.stockNeto, 0);
          const sumBurned = plants.reduce((acc, p) => acc + p.combustibleConsumido, 0);
          const sumConsumoLh = plants.reduce((acc, p) => acc + p.consumoLh, 0);
          const autTotH = sumConsumoLh > 0 ? Math.round(sumNeto / sumConsumoLh * 10) / 10 : 0;
          const diasAut = Math.round(autTotH / 24.0 * 10) / 10;

          totNetoTotal += sumNeto;
          totConsumoTotal += sumBurned;

          lines.push(`• ${lugarName}:`);
          if (isMulti) {
            plants.forEach(p => {
              lines.push(`  Planta ${p.tag}: Sub: ${p.subActual}L | Horo Act: ${p.hActStr} | Surtido: ${p.fechaSur} (${p.hSurStr}) | Op: +${p.deltaH}h (Consumo: ~${p.combustibleConsumido}L)`);
            });
            lines.push(`  Reserva: ${sharedRes} Lts | Stock Neto: ${sumNeto} Lts | Autonomía: ${diasAut} Días (${autTotH}h)`);
          } else {
            const p = plants[0];
            lines.push(`  Planta: ${p.subActual} Lts | Reserva: ${sharedRes} Lts | Stock Neto: ${sumNeto} Lts | Horo: ${p.hActStr} (+${p.deltaH}h op) | Autonomía: ${diasAut} Días (${autTotH}h)`);
          }
        });

        lines.push('');
        lines.push('══════════════════════════════════════════════');
        lines.push(`Total Gasoil Neto en Red: ${totNetoTotal.toLocaleString()} Lts | Consumo Est. Acumulado: ${totConsumoTotal.toLocaleString()} Lts`);

        return lines.join('\n');
      };

      // Generador del Reporte en Tabla Monospace (formato limpio y alineado para WhatsApp)
      const generateMonospaceTableReport = () => {
        const data = getSitesSummaryData();
        const regLabel = regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS';
        const zonaLabel = zonaFilter !== 'all' ? ` | Zona: ${zonaFilter}` : '';
        const todayStr = new Date().toLocaleDateString('es-VE');

        const pad = (s, len, right = false) => {
          const str = String(s || '');
          if (str.length > len) return str.slice(0, len - 1) + '…';
          return right ? str.padStart(len) : str.padEnd(len);
        };

        let lines = [
          '```',
          'AIRTEK ENERGY • REPORTE EJECUTIVO DE COMBUSTIBLE EN NODOS',
          `Región: ${regLabel}${zonaLabel} | Fecha: ${todayStr} | Plantas: ${data.length}`,
          '─'.repeat(74),
          `${pad('NODO / PLANTA', 22)} | ${pad('ÚLT. SURTIDO', 12)} | ${pad('HORÓM.', 8)} | ${pad('OP.ACUM', 7)} | ${pad('GASOIL', 7, true)} | ${pad('AUTONOMÍA', 11)}`,
          '─'.repeat(74)
        ];

        let totalGasoil = 0;
        let totalConsumo = 0;

        data.forEach(item => {
          totalGasoil += item.stockNeto;
          totalConsumo += item.combustibleConsumido;

          const nodoCol = `${item.lugar.slice(0, 14)} (${item.tag.slice(0, 6)})`;
          const surCol = `${item.fechaSur.slice(0, 5)} ${item.hSurStr.slice(0, 6)}`;
          const horoCol = item.hActStr.slice(0, 8);
          const opCol = `+${item.deltaH.toFixed(1)}h`;
          const gasCol = `${item.stockNeto}L`;
          const autCol = `${item.diasAutNeto}d (${item.autNetoH}h)`;

          lines.push(`${pad(nodoCol, 22)} | ${pad(surCol, 12)} | ${pad(horoCol, 8)} | ${pad(opCol, 7)} | ${pad(gasCol, 7, true)} | ${pad(autCol, 11)}`);
        });

        lines.push('─'.repeat(74));
        lines.push(`TOTAL GASOIL EN RED: ${totalGasoil.toLocaleString()} Lts | CONSUMO EST.: ${totalConsumo.toLocaleString()} Lts`);
        lines.push('```');

        return lines.join('\n');
      };

      // Generador del Reporte de Despachos Semanales
      const generateSurtidosReport = () => {
        const titleSemana = semanaFilter !== 'all' ? ` - ${semanaFilter}` : '';
        let text = `Reporte de Surtidos de Combustible (Coordinación de Grupos Electrógenos)${titleSemana}\n\n`;
        filtered.forEach(r => {
          text += `${r.lugar}: ${r.litros} Lts (${r.destino || 'Reserva'}) | Total en Nodo: ${r.total_nodo || '—'} Lts\n`;
        });
        text += `\nTotal Litros Despachados: ${totalLitros} Lts en ${totalDespachos} despachos.`;
        return text;
      };

      const generateTextReport = () => {
        if (reportMode === 'monospace') return generateMonospaceTableReport();
        if (reportMode === 'lista') return generateAutonomiaReport();
        return generateSurtidosReport();
      };

      const copyReport = () => {
        const text = generateTextReport();
        navigator.clipboard.writeText(text).then(() => {
          setCopySuccess(true);
          if (toast) toast('¡Reporte de texto copiado al portapapeles!', 'success');
          setTimeout(() => setCopySuccess(false), 2200);
        });
      };

      // Copiar cuadro como imagen usando html2canvas (con fondo adaptativo neutro #121214 / #ffffff)
      const copyExecutiveImage = async () => {
        const html2canvas = await loadHtml2Canvas();
        const cardEl = document.getElementById('airtek-executive-fuel-card-surtidos');
        if (!cardEl) return;
        setGeneratingImg(true);
        setTimeout(() => {
          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
            canvas.toBlob(blob => {
              if (navigator.clipboard && navigator.clipboard.write) {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
                  setGeneratingImg(false);
                  if (toast) toast('¡Cuadro copiado como imagen! Pégalo directamente en WhatsApp con Ctrl + V.', 'success');
                }).catch(() => {
                  const link = document.createElement('a');
                  link.download = `reporte_combustible_${Date.now()}.png`;
                  link.href = canvas.toDataURL('image/png');
                  link.click();
                  setGeneratingImg(false);
                  if (toast) toast('¡Imagen descargada como archivo PNG!', 'success');
                });
              } else {
                const link = document.createElement('a');
                link.download = `reporte_combustible_${Date.now()}.png`;
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
        }, 120);
      };

      const downloadExecutiveImage = async () => {

        const html2canvas = await loadHtml2Canvas();
        const cardEl = document.getElementById('airtek-executive-fuel-card-surtidos');
        if (!cardEl) return;
        setGeneratingImg(true);
        setTimeout(() => {
          html2canvas(cardEl, { scale: 2, useCORS: true, backgroundColor: isDark ? '#121214' : '#ffffff' }).then(canvas => {
            const link = document.createElement('a');
            link.download = `reporte_combustible_${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            setGeneratingImg(false);
            if (toast) toast('¡Imagen PNG descargada con éxito!', 'success');
          }).catch(e => {
            setGeneratingImg(false);
            if (toast) toast('Error al descargar: ' + e.message, 'error');
          });
        }, 120);
      };

      const exportExcel = async () => {

        const XLSX = await loadXLSX();
        const rows = filtered.map(r => ({
          'LUGAR / NODO': r.lugar,
          'TAG PLANTA': r.tag,
          'FECHA': r.fecha,
          'SEMANA': r.semana,
          'LITROS SURTIDOS': r.litros,
          'DESTINO': r.destino,
          'SUB-TANQUE (Lts)': r.subtanque_lts,
          'RESERVA (Lts)': r.reserva_lts,
          'TOTAL EN NODO (Lts)': r.total_nodo,
          'HORÓMETRO ACTUAL': r.horometro,
          'HORAS DE TRABAJO': r.horas_trabajo,
          'TÉCNICO / CUADRILLA': r.tecnico,
          'OBSERVACIONES': r.obs
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 28 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Surtidos de Combustible');
        XLSX.writeFile(wb, 'reporte_surtidos_combustible_' + Date.now() + '.xlsx');
      };

      const summaryData = getSitesSummaryData();
      const totalStockNeto = summaryData.reduce((acc, x) => acc + x.stockNeto, 0);
      const totalHorasOp = summaryData.reduce((acc, x) => acc + x.deltaH, 0);
      const totalConsumoEst = summaryData.reduce((acc, x) => acc + x.combustibleConsumido, 0);
      const optCount = summaryData.filter(x => x.diasAutNeto >= 3).length;
      const alertCount = summaryData.filter(x => x.diasAutNeto >= 1.5 && x.diasAutNeto < 3).length;
      const critCount = summaryData.filter(x => x.diasAutNeto < 1.5).length;

      return (
        <div>
          {/* Header Superior con Título y Acciones Principales */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 className="fd" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Control de Surtidos de Combustible
              </h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.84rem', margin: '4px 0 0' }}>
                Registro, trazabilidad histórica y reportes ejecutivos de combustible para plantas eléctricas.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', fontSize: '.84rem' }}
                onClick={() => onOpenAdjustModal && onOpenAdjustModal(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Calibrar Niveles
              </button>
              <button
                className="bs"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '.84rem' }}
                onClick={onOpenBatchHoroModal}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Actualizar Horómetros
              </button>
              <button className="bp" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }} onClick={onOpenNewModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Registrar Surtido
              </button>
            </div>
          </div>

          {/* Componente Modular: Lista Rápida de Plantas Eléctricas */}
          <PlantasQuickList
            tanks={tanks}
            onSelectPlant={onSelectPlant || onOpenNewModal}
            onAdjustPlant={onOpenAdjustModal}
          />

          {/* Sub-navegación por Pestañas Internas (Segmented Control Corporativo) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setSurtidosTab('historial')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 18px',
                  borderRadius: 8,
                  fontSize: '.82rem',
                  fontWeight: surtidosTab === 'historial' ? 700 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: surtidosTab === 'historial' ? 'var(--primary)' : 'transparent',
                  color: surtidosTab === 'historial' ? '#ffffff' : 'var(--tx2)',
                  boxShadow: surtidosTab === 'historial' ? '0 2px 8px rgba(1, 102, 255, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Historial de Despachos
                <span style={{
                  fontSize: '.72rem',
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: surtidosTab === 'historial' ? 'rgba(255,255,255,0.22)' : (isDark ? '#27272a' : '#e2e8f0'),
                  color: surtidosTab === 'historial' ? '#ffffff' : 'var(--tx2)',
                  fontWeight: 700
                }}>
                  {filtered.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSurtidosTab('reporte')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 18px',
                  borderRadius: 8,
                  fontSize: '.82rem',
                  fontWeight: surtidosTab === 'reporte' ? 700 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  background: surtidosTab === 'reporte' ? 'var(--primary)' : 'transparent',
                  color: surtidosTab === 'reporte' ? '#ffffff' : 'var(--tx2)',
                  boxShadow: surtidosTab === 'reporte' ? '0 2px 8px rgba(1, 102, 255, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                Reportes & Cuadro WhatsApp
              </button>
            </div>

            {surtidosTab === 'historial' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="bs" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: '.82rem' }} onClick={exportExcel}>
                  <IconExcel size={15} color="#10b981" />
                  Descargar Excel
                </button>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════════
              PESTAÑA 1: HISTORIAL DE DESPACHOS (ENFOQUE 100% EN TABLA Y MÉTRICAS DE SURTIDO)
              ══════════════════════════════════════════════════════════════════════ */}
          {surtidosTab === 'historial' && (
            <div>
              {/* Tarjetas KPI de Despacho */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
                {/* KPI 1: Total Suministrado */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(1, 102, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/><rect x="6" y="7" width="6" height="5" rx="1"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Suministrado</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--tx1)', margin: '2px 0' }}>{totalLitros.toLocaleString()} Lts</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{lugaresAtendidos} sitios atendidos</div>
                  </div>
                </div>

                {/* KPI 2: Total Despachos */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(33, 192, 250, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#21c0fa', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Total Despachos</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#21c0fa', margin: '2px 0' }}>{totalDespachos}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Promedio: ~{avgLitrosDespacho} Lts/despacho</div>
                  </div>
                </div>

                {/* KPI 3: Suministro Últimos 30 Días */}
                <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Surtido en 30 Días</div>
                    <div className="fm" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', margin: '2px 0' }}>{litrosUltimos30Dias.toLocaleString()} Lts</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{despachosUltimos30Dias} despachos en el ciclo</div>
                  </div>
                </div>

                {/* KPI 4: Destino Planta vs Reserva */}
                <div className="card" style={{ padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>Destino Combustible</div>
                    <div style={{ fontSize: '.72rem', fontWeight: 700 }}>
                      <span style={{ color: '#21c0fa' }}>{pctPlanta}%</span> <span style={{ color: 'var(--tx3)' }}>/</span> <span style={{ color: 'var(--primary)' }}>{pctReserva}%</span>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 7, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden', display: 'flex', marginTop: 8, border: '1px solid var(--border)' }}>
                    <div style={{ width: `${pctPlanta}%`, background: '#21c0fa', transition: 'width 0.3s ease' }} title={`Planta: ${totPlanta.toLocaleString()} Lts (${pctPlanta}%)`} />
                    <div style={{ width: `${pctReserva}%`, background: 'var(--primary)', transition: 'width 0.3s ease' }} title={`Reserva: ${totReserva.toLocaleString()} Lts (${pctReserva}%)`} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--tx3)', marginTop: 6 }}>
                    <span>Plt: <strong style={{ color: 'var(--tx1)' }}>{totPlanta.toLocaleString()}L</strong></span>
                    <span>Res: <strong style={{ color: 'var(--tx1)' }}>{totReserva.toLocaleString()}L</strong></span>
                  </div>
                </div>
              </div>

              {/* Barra de Filtros Compacta Integrada */}
              <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                    {/* Búsqueda Rápida */}
                    <div style={{ position: 'relative', minWidth: 200, flex: '1 1 200px', maxWidth: 280 }}>
                      <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input
                        className="fi"
                        type="text"
                        placeholder="Buscar lugar, tag o técnico..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '7px 12px 7px 30px', fontSize: '.82rem', width: '100%' }}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--tx3)', cursor: 'pointer', padding: 2, fontSize: '.75rem' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Filtro Región */}
                    <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 130 }}>
                      <option value="all">Todas las Regiones</option>
                      <option value="zulia">Zulia</option>
                      <option value="falcon">Falcón</option>
                    </select>

                    {/* Filtro Zona */}
                    <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 140 }}>
                      <option value="all">Todas las Zonas ({uniqueZonas.length})</option>
                      {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>

                    {/* Filtro Semana */}
                    <select className="fi" value={semanaFilter} onChange={e => setSemanaFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 140 }}>
                      <option value="all">Todas las Semanas ({uniqueSemanas.length})</option>
                      {uniqueSemanas.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Filtro Lugar */}
                    <select className="fi" value={lugarFilter} onChange={e => setLugarFilter(e.target.value)} style={{ padding: '7px 10px', fontSize: '.82rem', width: 'auto', minWidth: 150 }}>
                      <option value="all">Todos los Lugares ({uniqueLugares.length})</option>
                      {uniqueLugares.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    {/* Botón Limpiar Filtros */}
                    {(search || regionFilter !== 'all' || zonaFilter !== 'all' || semanaFilter !== 'all' || lugarFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setRegionFilter('all');
                          setZonaFilter('all');
                          setSemanaFilter('all');
                          setLugarFilter('all');
                        }}
                        className="bs"
                        style={{ padding: '6px 12px', fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--tx2)' }}
                        title="Limpiar todos los filtros"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabla Histórica de Surtidos con Paginación Inmediata */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.84rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--tx3)', textTransform: 'uppercase', fontSize: '.7rem', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                        <th style={{ padding: '12px 16px' }}>Lugar / Planta</th>
                        <th style={{ padding: '12px 14px' }}>Fecha & Semana</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Litros Suministrados</th>
                        <th style={{ padding: '12px 14px' }}>Destino</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total en Nodo</th>
                        <th style={{ padding: '12px 14px' }}>Horómetro</th>
                        <th style={{ padding: '12px 14px' }}>Técnico / Obs</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRefills.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--tx3)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              </svg>
                              <div style={{ fontWeight: 600, fontSize: '.92rem', color: 'var(--tx2)' }}>No se encontraron registros de surtidos</div>
                              <div style={{ fontSize: '.78rem' }}>Intenta ajustar o limpiar los filtros seleccionados.</div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedRefills.map((r, i) => (
                          <tr key={r.id || i} style={{ borderBottom: '1px solid var(--border)', background: (i % 2 === 0) ? 'var(--bg-card)' : 'var(--bg-surface)' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div className="fd" style={{ fontWeight: 700, color: 'var(--tx1)', fontSize: '.88rem' }}>{r.lugar}</div>
                              <div style={{ fontSize: '.74rem', color: 'var(--blue)', marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{r.tag}</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div className="fm" style={{ fontWeight: 600, color: 'var(--tx1)' }}>{r.fecha}</div>
                              <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{r.semana}</div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span className="fm" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
                                +{r.litros} Lts
                              </span>
                              {(r.destino === 'Surtido Planta y Reserva' || (r.litros_planta > 0 && r.litros_reserva > 0)) && (
                                <div style={{ fontSize: '.7rem', color: 'var(--tx3)', marginTop: 2 }}>
                                  Plt: {r.litros_planta}L | Res: {r.litros_reserva}L
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {(() => {
                                const d = r.destino || 'Surtido Reserva';
                                let bg = 'rgba(1, 102, 255, 0.12)';
                                let color = 'var(--blue)';
                                if (d.includes('Planta y Reserva') || d === 'Ambos' || d === 'Distribuido') {
                                  bg = 'rgba(139, 92, 246, 0.15)'; color = '#8b5cf6';
                                } else if (d.includes('Planta') || d === 'Sub-tanque') {
                                  bg = 'rgba(33, 192, 250, 0.12)'; color = '#21c0fa';
                                }
                                return (
                                  <span className="badge" style={{ background: bg, color, fontWeight: 700 }}>
                                    {d}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div className="fm" style={{ fontWeight: 700, color: 'var(--green)' }}>{r.total_nodo} Lts</div>
                              <div style={{ fontSize: '.7rem', color: 'var(--tx3)' }}>Sub: {r.subtanque_lts}L | Res: {r.reserva_lts}L</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div className="fm" style={{ fontWeight: 700, color: 'var(--tx1)' }}>{r.horometro}</div>
                              {r.horas_trabajo && <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Trabajadas: {r.horas_trabajo}</div>}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontSize: '.8rem', color: 'var(--tx1)', fontWeight: 600 }}>{r.tecnico}</div>
                              {r.obs && <div style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{r.obs}</div>}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  className="bs"
                                  style={{ padding: '5px 10px', fontSize: '.74rem', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                                  onClick={() => {
                                    const text = generateFuelReportText({ nodeName: r.lugar, date: r.fecha, record: r, tanks });
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                      navigator.clipboard.writeText(text).then(() => {
                                        if (toast) toast('¡Mensaje de surtido para WhatsApp copiado al portapapeles!', 'success');
                                      });
                                    }
                                  }}
                                  title="Copiar mensaje de este surtido para WhatsApp"
                                >
                                  <IconCopy size={12} />
                                  WhatsApp
                                </button>
                                {onDeleteRefill && (
                                  <button
                                    className="bd"
                                    style={{ padding: '5px 10px', fontSize: '.74rem', borderRadius: 6, color: '#f55b5d', borderColor: 'rgba(245, 91, 93, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                    onClick={() => {
                                      if (window.confirm(`¿Deseas eliminar este registro de surtido (${r.litros}L en ${r.lugar})? Se revertirán los niveles de combustible y el horómetro a sus valores anteriores.`)) {
                                        onDeleteRefill(r);
                                      }
                                    }}
                                    title="Eliminar surtido y revertir valores"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer de Paginación */}
                {filtered.length > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 18px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-elevated)',
                    fontSize: '.8rem',
                    color: 'var(--tx2)',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        Mostrando <strong style={{ color: 'var(--tx1)' }}>{filtered.length === 0 ? 0 : startIndex + 1}</strong> – <strong style={{ color: 'var(--tx1)' }}>{endIndex}</strong> de <strong style={{ color: 'var(--tx1)' }}>{filtered.length}</strong> despachos
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                        <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>Por página:</span>
                        <select
                          value={pageSize}
                          onChange={e => {
                            setPageSize(Number(e.target.value));
                            setPage(1);
                          }}
                          className="fi"
                          style={{ padding: '3px 8px', fontSize: '.76rem', width: 'auto', minWidth: 60 }}
                        >
                          <option value={15}>15</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="bs"
                        disabled={page <= 1}
                        onClick={() => setPage(1)}
                        style={{ padding: '5px 10px', fontSize: '.76rem', opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                        title="Primera página"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="bs"
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ padding: '5px 12px', fontSize: '.76rem', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ‹ Anterior
                      </button>

                      <span style={{ padding: '0 8px', fontSize: '.78rem', fontWeight: 600, color: 'var(--tx1)' }}>
                        Página {page} de {totalPages}
                      </span>

                      <button
                        type="button"
                        className="bs"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        style={{ padding: '5px 12px', fontSize: '.76rem', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                      >
                        Siguiente ›
                      </button>
                      <button
                        type="button"
                        className="bs"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                        style={{ padding: '5px 10px', fontSize: '.76rem', opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                        title="Última página"
                      >
                        »
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              PESTAÑA 2: REPORTES EJECUTIVOS & CUADRO WHATSAPP
              ══════════════════════════════════════════════════════════════════════ */}
          {surtidosTab === 'reporte' && (
            <div>
              {/* Barra Superior del Reporte: Selector de Formato y Botones de Exportación */}
              <div className="card" style={{ marginBottom: 16, border: '1px solid var(--border)', background: 'var(--bg-card)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span className="fd" style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--tx1)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Formato de Reporte
                    </span>
                    <div style={{ display: 'inline-flex', background: 'var(--bg-elevated)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'cuadro' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'cuadro' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'cuadro' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'cuadro' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('cuadro')}
                      >
                        Cuadro Gráfico
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'monospace' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'monospace' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'monospace' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'monospace' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('monospace')}
                      >
                        Tabla en Texto (WhatsApp)
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'lista' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'lista' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'lista' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'lista' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('lista')}
                      >
                        Lista Detallada
                      </button>
                      <button
                        style={{
                          padding: '5px 14px',
                          fontSize: '.74rem',
                          fontWeight: reportMode === 'surtidos' ? 700 : 500,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          background: reportMode === 'surtidos' ? 'var(--primary)' : 'transparent',
                          color: reportMode === 'surtidos' ? '#ffffff' : 'var(--tx2)',
                          boxShadow: reportMode === 'surtidos' ? '0 2px 6px rgba(1, 102, 255, 0.3)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setReportMode('surtidos')}
                      >
                        Despachos Semanales
                      </button>
                    </div>
                  </div>

                  {/* Acciones de Exportación */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {reportMode === 'cuadro' ? (
                      <>
                        <button
                          className="bp"
                          disabled={generatingImg}
                          style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={copyExecutiveImage}
                        >
                          <IconCopy size={14} />
                          {generatingImg ? 'Generando Imagen...' : 'Copiar como Imagen para WhatsApp'}
                        </button>
                        <button
                          className="bs"
                          disabled={generatingImg}
                          style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={downloadExecutiveImage}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Descargar PNG
                        </button>
                        <button
                          className="bs"
                          style={{ padding: '6px 12px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => setShowImageModal(true)}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                          Pantalla Completa
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="bs" style={{ padding: '5px 12px', fontSize: '.74rem' }} onClick={() => setShowTextReport(!showTextReport)}>
                          {showTextReport ? 'Ocultar' : 'Mostrar'}
                        </button>
                        <button className="bp" style={{ padding: '6px 14px', fontSize: '.76rem', display: 'flex', alignItems: 'center', gap: 6 }} onClick={copyReport}>
                          <IconCopy size={14} />
                          {copySuccess ? '¡Copiado!' : 'Copiar Reporte'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Filtros específicos para el reporte */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Región:</label>
                    <select className="fi" value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todas las Regiones</option>
                      <option value="zulia">Zulia</option>
                      <option value="falcon">Falcón</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Zona:</label>
                    <select className="fi" value={zonaFilter} onChange={e => setZonaFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todas las Zonas</option>
                      {uniqueZonas.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: '.72rem', color: 'var(--tx3)', fontWeight: 600 }}>Lugar:</label>
                    <select className="fi" value={lugarFilter} onChange={e => setLugarFilter(e.target.value)} style={{ padding: '5px 10px', fontSize: '.78rem', width: 'auto' }}>
                      <option value="all">Todos los Lugares</option>
                      {uniqueLugares.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  {(regionFilter !== 'all' || zonaFilter !== 'all' || lugarFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setRegionFilter('all');
                        setZonaFilter('all');
                        setLugarFilter('all');
                      }}
                      className="bs"
                      style={{ padding: '4px 10px', fontSize: '.72rem', color: 'var(--tx2)' }}
                    >
                      Restablecer filtros
                    </button>
                  )}
                </div>
              </div>

              {/* Vista Previa: Cuadro Gráfico o Textarea */}
              {reportMode === 'cuadro' ? (
                <div style={{ overflowX: 'auto', background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}`, padding: 8 }}>
                  <div
                    id="airtek-executive-fuel-card-surtidos"
                    style={{
                      minWidth: '980px',
                      padding: '24px 26px',
                      background: isDark ? '#121214' : '#ffffff',
                      borderRadius: 14,
                      fontFamily: "'Outfit', 'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
                      color: isDark ? '#f8fafc' : '#090d16',
                      boxShadow: isDark ? '0 20px 40px rgba(0,0,0,0.85)' : '0 10px 30px rgba(0,0,0,0.06)',
                      border: isDark ? '1px solid #26262a' : '1px solid #e2e8f0'
                    }}
                  >
                    {/* Banner Superior */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isDark ? '2px solid rgba(1, 102, 255, 0.3)' : '2px solid rgba(1, 102, 255, 0.25)', paddingBottom: 14, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: '.76rem', fontWeight: 800, color: isDark ? '#21c0fa' : '#0166ff', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                          AIRTEK ENERGY • COORDINACIÓN DE GRUPOS ELECTRÓGENOS
                        </div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 900, color: isDark ? '#ffffff' : '#090d16', letterSpacing: '-0.02em', marginTop: 1 }}>
                          ESTADO DE GASOIL & OPERACIÓN DE PLANTAS
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: isDark ? 'rgba(1, 102, 255, 0.15)' : 'rgba(1, 102, 255, 0.08)', border: isDark ? '1px solid rgba(1, 102, 255, 0.35)' : '1px solid rgba(1, 102, 255, 0.25)', fontSize: '.76rem', fontWeight: 700, color: isDark ? '#60a5fa' : '#0166ff', marginBottom: 3 }}>
                          Región: {regionFilter !== 'all' ? regionFilter.toUpperCase() : 'TODAS'} {zonaFilter !== 'all' ? `• ${zonaFilter}` : ''}
                        </div>
                        <div style={{ fontSize: '.72rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                          Fecha de Corte: {new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Resumen KPI Ejecutivo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Gasoil Neto</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#38bdf8' : '#0284c7', marginTop: 2 }}>{totalStockNeto.toLocaleString()} Lts</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Horas Op. Acumuladas</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#f59e0b' : '#d97706', marginTop: 2 }}>+{totalHorasOp.toFixed(1)} h</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Consumo Est. Acumulado</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: isDark ? '#ef4444' : '#dc2626', marginTop: 2 }}>~{totalConsumoEst.toLocaleString()} Lts</div>
                      </div>
                      <div style={{ background: isDark ? '#18181b' : '#f8fafc', padding: '10px 14px', borderRadius: 10, border: isDark ? '1px solid #27272a' : '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Semáforo de Nodos</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: '.72rem', fontWeight: 800 }}>
                          <span style={{ color: isDark ? '#10b981' : '#15803d' }}>{optCount} Ópt</span>
                          <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>•</span>
                          <span style={{ color: isDark ? '#f59e0b' : '#d97706' }}>{alertCount} Alert</span>
                          <span style={{ color: isDark ? '#64748b' : '#94a3b8' }}>•</span>
                          <span style={{ color: isDark ? '#ef4444' : '#dc2626' }}>{critCount} Crít</span>
                        </div>
                      </div>
                    </div>

                    {/* Tabla Gráfica Ejecutiva */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.76rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: isDark ? '#141416' : '#f1f5f9', borderBottom: isDark ? '2px solid #27272a' : '2px solid #cbd5e1', color: isDark ? '#a1a1aa' : '#475569', textTransform: 'uppercase', fontSize: '.66rem', letterSpacing: '.06em' }}>
                          <th style={{ padding: '9px 12px' }}>Lugar / Nodo</th>
                          <th style={{ padding: '9px 10px' }}>Planta & Tag</th>
                          <th style={{ padding: '9px 10px' }}>Último Surtido</th>
                          <th style={{ padding: '9px 10px' }}>Horómetro Actual</th>
                          <th style={{ padding: '9px 10px', textAlign: 'center' }}>Horas Op. Acum.</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right' }}>Gasoil Neto</th>
                          <th style={{ padding: '9px 10px' }}>Autonomía Neta</th>
                          <th style={{ padding: '9px 12px', textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.map((item, idx) => {
                          const badgeColor = item.status === 'critico' ? (isDark ? '#ef4444' : '#dc2626') : (item.status === 'alerta' ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#10b981' : '#15803d'));
                          const badgeBg = item.status === 'critico' ? (isDark ? 'rgba(239,68,68,0.15)' : 'rgba(220,38,38,0.12)') : (item.status === 'alerta' ? (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(217,119,6,0.12)') : (isDark ? 'rgba(16,185,129,0.15)' : 'rgba(21,128,61,0.12)'));

                          return (
                            <tr key={idx} style={{ borderBottom: isDark ? '1px solid #222226' : '1px solid #e2e8f0', background: (idx % 2 === 0) ? (isDark ? '#141416' : '#ffffff') : (isDark ? '#18181b' : '#f8fafc') }}>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ fontWeight: 800, color: isDark ? '#ffffff' : '#090d16', fontSize: '.8rem' }}>{item.lugar}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#64748b' : '#64748b' }}>{item.zona}</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, color: isDark ? '#e2e8f0' : '#0166ff', fontFamily: "'JetBrains Mono', monospace" }}>{item.tag}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#38bdf8' : '#0284c7' }}>Consumo: {item.consumoLh} L/h</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 600, color: isDark ? '#f1f5f9' : '#090d16' }}>{item.fechaSur}</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>Horo: {item.hSurStr}</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {generatingImg ? (
                                  <div style={{ fontWeight: 700, color: isDark ? '#38bdf8' : '#0166ff', fontFamily: "'JetBrains Mono', monospace" }}>
                                    {item.hActStr}
                                  </div>
                                ) : (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                      type="number"
                                      step="0.1"
                                      value={item.hAct !== null ? item.hAct : ''}
                                      placeholder={item.hSur !== null ? item.hSur : '0'}
                                      onChange={e => onUpdatePlantHorometer && onUpdatePlantHorometer(item.tag || item.sn, {
                                        horometro_actual: e.target.value,
                                        hSur: item.hSur
                                      })}
                                      style={{
                                        width: '74px',
                                        background: isDark ? '#0e0e10' : '#ffffff',
                                        border: isDark ? '1px solid #3f3f46' : '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        color: isDark ? '#38bdf8' : '#0166ff',
                                        fontSize: '.74rem',
                                        fontWeight: 700,
                                        fontFamily: "'JetBrains Mono', monospace",
                                        padding: '2px 6px',
                                        textAlign: 'right',
                                        outline: 'none'
                                      }}
                                      title="Clic para editar horómetro actual (calcula Delta H automáticamente)"
                                    />
                                    <span style={{ fontSize: '.68rem', color: isDark ? '#94a3b8' : '#64748b' }}>h</span>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                {generatingImg ? (
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: '.72rem',
                                    fontWeight: 800,
                                    background: item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(217, 119, 6, 0.12)') : (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.1)'),
                                    color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff'),
                                    border: `1px solid ${item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)') : (isDark ? 'rgba(33, 192, 250, 0.3)' : 'rgba(1, 102, 255, 0.25)')}`
                                  }}>
                                    +{item.deltaH.toFixed(1)} h
                                  </span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                      <span style={{ fontSize: '.72rem', fontWeight: 800, color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff') }}>+</span>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={item.deltaH !== undefined && item.deltaH !== null ? item.deltaH : ''}
                                        placeholder="0.0"
                                        onChange={e => onUpdatePlantHorometer && onUpdatePlantHorometer(item.tag || item.sn, {
                                          delta_h: e.target.value,
                                          hSur: item.hSur
                                        })}
                                        style={{
                                          width: '56px',
                                          background: item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(217, 119, 6, 0.12)') : (isDark ? 'rgba(33, 192, 250, 0.15)' : 'rgba(1, 102, 255, 0.08)'),
                                          border: `1px solid ${item.deltaH > 20 ? (isDark ? 'rgba(245, 158, 11, 0.45)' : 'rgba(217, 119, 6, 0.35)') : (isDark ? 'rgba(33, 192, 250, 0.35)' : 'rgba(1, 102, 255, 0.25)')}`,
                                          borderRadius: '6px',
                                          color: item.deltaH > 20 ? '#f59e0b' : '#38bdf8',
                                          fontSize: '.72rem',
                                          fontWeight: 800,
                                          fontFamily: "'JetBrains Mono', monospace",
                                          padding: '2px 4px',
                                          textAlign: 'center',
                                          outline: 'none'
                                        }}
                                        title="Clic para editar horas trabajadas post-surtido (calcula horómetro actual)"
                                      />
                                      <span style={{ fontSize: '.68rem', fontWeight: 700, color: item.deltaH > 20 ? (isDark ? '#f59e0b' : '#d97706') : (isDark ? '#38bdf8' : '#0166ff') }}>h</span>
                                    </div>
                                    {item.combustibleConsumido > 0 && (
                                      <div style={{ fontSize: '.64rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 }}>
                                        ~{item.combustibleConsumido} L quemados
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <div style={{ fontSize: '.92rem', fontWeight: 900, color: isDark ? '#10b981' : '#15803d' }}>{item.stockNeto.toLocaleString()} Lts</div>
                                <div style={{ fontSize: '.64rem', color: isDark ? '#64748b' : '#64748b' }}>Sub: {item.subActual}L | Res: {item.sharedRes}L</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 800, color: badgeColor, fontSize: '.84rem' }}>{item.diasAutNeto} Días</div>
                                <div style={{ fontSize: '.66rem', color: isDark ? '#94a3b8' : '#64748b' }}>({item.autNetoH} hrs)</div>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: '.68rem', fontWeight: 800, background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}33` }}>
                                  {item.statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pie del Cuadro Gráfico */}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: isDark ? '1px solid #26262a' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.66rem', color: isDark ? '#71717a' : '#64748b' }}>
                      <div>Airtek Energy • Coordinación de Grupos Electrógenos • Horas de Operación Acumuladas = Horo Actual - Horo Surtido</div>
                      <div>Generado el {new Date().toLocaleString('es-VE')}</div>
                    </div>
                  </div>
                </div>
              ) : (
                showTextReport && (
                  <textarea
                    className="fi fm"
                    readOnly
                    value={generateTextReport()}
                    style={{
                      width: '100%',
                      height: 220,
                      fontSize: '.82rem',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      background: 'var(--bg-surface)',
                      color: 'var(--tx1)',
                      padding: '12px 14px',
                      borderRadius: 8
                    }}
                  />
                )
              )}
            </div>
          )}

          {/* Modal de Pantalla Completa para Exportación de Imagen */}
          {showImageModal && (
            <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div className="card fin" style={{ width: '95%', maxWidth: 1060, maxHeight: '90vh', overflowY: 'auto', padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 className="fd" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tx1)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Exportador de Cuadro Gráfico para WhatsApp
                    </h3>
                    <p style={{ fontSize: '.8rem', color: 'var(--tx3)', margin: '4px 0 0' }}>
                      Genera la imagen en alta resolución lista para copiar y pegar directamente en WhatsApp con Ctrl + V.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      className="bp"
                      disabled={generatingImg}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '.84rem' }}
                      onClick={copyExecutiveImage}
                    >
                      <IconCopy size={16} />
                      {generatingImg ? 'Generando Imagen...' : 'Copiar Imagen (Pegar en WhatsApp)'}
                    </button>
                    <button
                      className="bs"
                      disabled={generatingImg}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '.84rem' }}
                      onClick={downloadExecutiveImage}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Descargar PNG
                    </button>
                    <button className="bs" onClick={() => setShowImageModal(false)} style={{ padding: '8px 14px' }}>
                      ✕ Cerrar
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', padding: 8, background: isDark ? '#0c0c0e' : 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${isDark ? '#26262a' : 'var(--border)'}` }}>
                  <div style={{ fontSize: '.8rem', color: '#94a3b8', padding: '8px 0', textAlign: 'center' }}>
                    Haz clic en <strong>"Copiar Imagen"</strong> para llevarla directo al portapapeles y pegarla con <strong>Ctrl + V</strong> en WhatsApp.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      );
    }

export { SurtidosView };
export default SurtidosView;
