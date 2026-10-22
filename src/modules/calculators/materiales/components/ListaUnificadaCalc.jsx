import { useState, useMemo, useEffect } from 'react';
import { loadXLSX } from '@/utils/exportLibs';


import { calcularMaterialesProyecto, calcularMaterialesComunidades, calcularMaterialesTablas } from '@/modules/calculators/materiales/calc';
import { DEFAULT_PROYECTO_FORM } from '@/modules/calculators/materiales/constants';
import { IconExcel } from '@/components/icons';

function ListaUnificadaCalc({ onNavigateTab }) {
      // Selección de calculadoras activas a combinar
      const [incProyecto, setIncProyecto] = useState(() => localStorage.getItem('airtek_uni_inc_proy') !== 'false');
      const [incComunidades, setIncComunidades] = useState(() => localStorage.getItem('airtek_uni_inc_com') !== 'false');
      const [incTablas, setIncTablas] = useState(() => localStorage.getItem('airtek_uni_inc_tab') !== 'false');

      // Modo de visualización: 'consolidado' (sumado) o 'desglosado' (por calculadora)
      const [viewMode, setViewMode] = useState('consolidado');

      // Estados locales sincronizados para edición rápida en vivo
      const [respaldos, setRespaldos] = useState(() => localStorage.getItem('energia_act_comunidades_resp') || '6');
      const [cantTrad, setCantTrad] = useState(() => localStorage.getItem('airtek_tablas_resp_trad') || '5');
      const [cantNodo, setCantNodo] = useState(() => localStorage.getItem('airtek_tablas_resp_nodo') || '');

      // Guardar preferencias de inclusión
      useEffect(() => {
        localStorage.setItem('airtek_uni_inc_proy', incProyecto);
        localStorage.setItem('airtek_uni_inc_com', incComunidades);
        localStorage.setItem('airtek_uni_inc_tab', incTablas);
      }, [incProyecto, incComunidades, incTablas]);

      // Guardar cambios rápidos de parámetros
      useEffect(() => {
        localStorage.setItem('energia_act_comunidades_resp', respaldos);
      }, [respaldos]);

      useEffect(() => {
        localStorage.setItem('airtek_tablas_resp_trad', cantTrad);
        localStorage.setItem('airtek_tablas_resp_nodo', cantNodo);
      }, [cantTrad, cantNodo]);

      // Cargar datos actuales de proyecto
      const proyectoForm = useMemo(() => {
        try {
          const s = localStorage.getItem('airtek_calc_proyecto_form');
          if (s) return { ...DEFAULT_PROYECTO_FORM, ...JSON.parse(s) };
        } catch {}
        return DEFAULT_PROYECTO_FORM;
      }, []);

      const proyectoNombre = useMemo(() => {
        return localStorage.getItem('airtek_calc_proyecto_nombre') || '';
      }, []);

      // Cálculo de cada lista individual
      const proyItems = useMemo(() => {
        if (!incProyecto) return [];
        return calcularMaterialesProyecto(proyectoForm);
      }, [incProyecto, proyectoForm]);

      const comItems = useMemo(() => {
        if (!incComunidades) return [];
        return calcularMaterialesComunidades(respaldos);
      }, [incComunidades, respaldos]);

      const tabItems = useMemo(() => {
        if (!incTablas) return [];
        return calcularMaterialesTablas(cantTrad, cantNodo);
      }, [incTablas, cantTrad, cantNodo]);

      const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

      // Consolidación y suma inteligente de materiales comunes
      const itemsConsolidados = useMemo(() => {
        const mapa = new Map();

        const addItems = (items, origenNombre, origenColor) => {
          items.forEach(it => {
            if (!it.cantidad || it.cantidad <= 0) return;
            const normKey = it.nombre.trim().toUpperCase();
            if (!mapa.has(normKey)) {
              mapa.set(normKey, {
                nombre: it.nombre,
                cantidad: it.cantidad,
                unidad: it.unidad || 'und',
                desglose: [{ origen: origenNombre, color: origenColor, cantidad: it.cantidad }]
              });
            } else {
              const entry = mapa.get(normKey);
              entry.cantidad += it.cantidad;
              entry.desglose.push({ origen: origenNombre, color: origenColor, cantidad: it.cantidad });
            }
          });
        };

        if (incProyecto && proyItems.length > 0) {
          addItems(proyItems, 'Proyecto', '#0166ff');
        }
        if (incComunidades && comItems.length > 0) {
          addItems(comItems, 'Comunidades', '#f59e0b');
        }
        if (incTablas && tabItems.length > 0) {
          addItems(tabItems, 'Tablas de Respaldo', '#10b981');
        }

        return Array.from(mapa.values());
      }, [incProyecto, incComunidades, incTablas, proyItems, comItems, tabItems]);

      const totalCalculadorasActivas = (incProyecto ? 1 : 0) + (incComunidades ? 1 : 0) + (incTablas ? 1 : 0);

      // Copiar texto formateado
      const copyConsolidado = () => {
        if (!itemsConsolidados || itemsConsolidados.length === 0) return;
        let txt = 'AIRTEK - LISTA UNIFICADA Y CONSOLIDADA DE MATERIALES\n';
        txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
        txt += 'Listas Unidas: ';
        let listasNombres = [];
        if (incProyecto) listasNombres.push(`Proyecto (${proyItems.length} materiales)`);
        if (incComunidades) listasNombres.push(`Activación Comunidades (${respaldos} respaldos)`);
        if (incTablas) listasNombres.push(`Armado Tablas (${(parseFloat(cantTrad)||0) + (parseFloat(cantNodo)||0)} tablas)`);
        txt += listasNombres.join(' + ') + '\n';
        txt += 'Total Materiales Consolidados: ' + itemsConsolidados.length + '\n';
        txt += '------------------------------------------------------------\n\n';

        itemsConsolidados.forEach((r, idx) => {
          const desgloseStr = r.desglose.length > 1
            ? ' (' + r.desglose.map(d => `${d.origen}: ${fmt(d.cantidad)} ${r.unidad}`).join(' + ') + ')'
            : '';
          txt += `${idx + 1}. ${r.nombre}: ${fmt(r.cantidad)} ${r.unidad}${desgloseStr}\n`;
        });

        navigator.clipboard.writeText(txt).then(() => {
          alert('¡Lista consolidada copiada al portapapeles!');
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          alert('¡Lista consolidada copiada al portapapeles!');
        });
      };

      // Exportar a Excel con hojas múltiples
      const exportExcelConsolidado = async () => {
        const XLSX = await loadXLSX();
        if (!itemsConsolidados || itemsConsolidados.length === 0) return;
        const wb = XLSX.utils.book_new();

        // 1. Hoja Consolidado General
        const rowsConsolidado = itemsConsolidados.map(r => ({
          'MATERIAL': r.nombre,
          'CANTIDAD TOTAL': fmt(r.cantidad),
          'UNIDAD': r.unidad,
          'ORIGEN / DESGLOSE': r.desglose.map(d => `${d.origen}: ${fmt(d.cantidad)} ${r.unidad}`).join(' | ')
        }));
        const wsConsolidado = XLSX.utils.json_to_sheet(rowsConsolidado);
        wsConsolidado['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 12 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado General');

        // 2. Hoja Materiales Proyecto (si está seleccionada)
        if (incProyecto && proyItems.length > 0) {
          const rowsProy = proyItems.map(p => ({
            'MATERIAL': p.nombre,
            'CANTIDAD': fmt(p.cantidad),
            'UNIDAD': p.unidad,
            'SECCIÓN': p.seccion || 'Proyecto'
          }));
          const wsProy = XLSX.utils.json_to_sheet(rowsProy);
          wsProy['!cols'] = [{ wch: 65 }, { wch: 16 }, { wch: 12 }, { wch: 20 }];
          XLSX.utils.book_append_sheet(wb, wsProy, 'Materiales Proyecto');
        }

        // 3. Hoja Activación Comunidades (si está seleccionada)
        if (incComunidades && comItems.length > 0) {
          const rowsCom = comItems.map((c, i) => ({
            'MATERIAL': c.nombre,
            'UNIDAD REQUERIDA': fmt(c.requeridaPorUnidad || 0),
            'NUMERO DE RESPALDOS': i === 0 ? (parseFloat(respaldos) || 0) : '',
            'MATERIAL TOTAL': fmt(c.cantidad),
            'UNIDAD': c.unidad
          }));
          const wsCom = XLSX.utils.json_to_sheet(rowsCom);
          wsCom['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 12 }];
          XLSX.utils.book_append_sheet(wb, wsCom, 'Activacion Comunidades');
        }

        // 4. Hoja Armado de Tablas de Respaldo (si está seleccionada)
        if (incTablas && tabItems.length > 0) {
          const numTrad = parseFloat(cantTrad) || 0;
          const numNodo = parseFloat(cantNodo) || 0;
          const totalTablas = (numTrad + numNodo) > 0 ? (numTrad + numNodo) : (parseFloat(cantTrad) || 0);

          const rowsTab = tabItems.map(t => ({
            'MATERIAL': t.nombre,
            'MATERIAL TOTAL': `${fmt(t.cantidad)} ${t.unidad}`
          }));
          const wsTab = XLSX.utils.json_to_sheet(rowsTab);
          wsTab['D1'] = { v: 'CANTIDAD DE TABLAS A CONSTRUIR', t: 's' };
          wsTab['D2'] = { v: 'COMUNIDAD TRADICIONAL', t: 's' };
          wsTab['E2'] = { v: numTrad, t: 'n' };
          wsTab['D3'] = { v: 'COMUNIDAD NODO', t: 's' };
          wsTab['E3'] = { v: numNodo || '', t: numNodo ? 'n' : 's' };
          wsTab['D4'] = { v: 'TOTAL TABLAS', t: 's' };
          wsTab['E4'] = { v: totalTablas, t: 'n' };
          wsTab['!cols'] = [{ wch: 65 }, { wch: 20 }, { wch: 4 }, { wch: 30 }, { wch: 14 }];
          XLSX.utils.book_append_sheet(wb, wsTab, 'Tablas de Respaldo');
        }

        XLSX.writeFile(wb, 'Materiales_Consolidado_Airtek_' + Date.now() + '.xlsx');
      };

      return (
        <div className="fin">
          {/* Encabezado */}
          <div style={{ marginBottom: 18 }}>
            <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
              Calculadora de Materiales — Lista Unificada y Consolidada
            </h1>
            <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
              Combina y suma automáticamente los materiales de 2 o 3 calculadoras en una sola lista unificada para compras y despacho de almacén.
            </p>
          </div>

          {/* Tarjetas de Selección de Calculadoras a Combinar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
            
            {/* Tarjeta 1: Materiales de Proyecto */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incProyecto ? '#0166ff' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incProyecto ? '0 4px 20px rgba(1, 102, 255, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incProyecto}
                    onChange={e => setIncProyecto(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#0166ff', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incProyecto ? '#0166ff' : 'var(--tx1)' }}>
                      Materiales Proyecto
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Fuentes ETP, Racks, Baterías, AC/DC
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incProyecto ? 'rgba(1, 102, 255, 0.12)' : 'var(--bg-elevated)',
                  color: incProyecto ? '#0166ff' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {proyItems.length} materiales
                </span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx2)', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {proyectoNombre ? `Proyecto: ${proyectoNombre}` : (proyItems.length > 0 ? 'Parámetros configurados' : 'Sin parámetros calculados')}
                </span>
                <button
                  type="button"
                  className="bs"
                  style={{ padding: '3px 8px', fontSize: '.7rem' }}
                  onClick={() => onNavigateTab && onNavigateTab('proyecto')}
                >
                  Configurar
                </button>
              </div>
            </div>

            {/* Tarjeta 2: Activación Comunidades */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incComunidades ? '#f59e0b' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incComunidades ? '0 4px 20px rgba(245, 158, 11, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incComunidades}
                    onChange={e => setIncComunidades(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incComunidades ? '#f59e0b' : 'var(--tx1)' }}>
                      Activación Comunidades
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      10 materiales catalogados
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incComunidades ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-elevated)',
                  color: incComunidades ? '#f59e0b' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {comItems.length} materiales
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <label className="lbl" style={{ margin: 0, fontSize: '.74rem', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                  Número de respaldos:
                </label>
                <input
                  className="fi fm"
                  type="number"
                  min="0"
                  value={respaldos}
                  onChange={e => setRespaldos(e.target.value)}
                  style={{ width: 80, padding: '4px 8px', fontSize: '.84rem', fontWeight: 700, textAlign: 'center' }}
                  placeholder="6"
                  disabled={!incComunidades}
                />
              </div>
            </div>

            {/* Tarjeta 3: Armado de Tablas de Respaldo */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incTablas ? '#10b981' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incTablas ? '0 4px 20px rgba(16, 185, 129, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incTablas}
                    onChange={e => setIncTablas(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incTablas ? '#10b981' : 'var(--tx1)' }}>
                      Armado Tablas Respaldo
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      19 materiales catalogados
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incTablas ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-elevated)',
                  color: incTablas ? '#10b981' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {tabItems.length} materiales
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Tradicional:</span>
                  <input
                    className="fi fm"
                    type="number"
                    min="0"
                    value={cantTrad}
                    onChange={e => setCantTrad(e.target.value)}
                    style={{ width: 60, padding: '4px 6px', fontSize: '.82rem', fontWeight: 700, textAlign: 'center' }}
                    placeholder="5"
                    disabled={!incTablas}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Nodo:</span>
                  <input
                    className="fi fm"
                    type="number"
                    min="0"
                    value={cantNodo}
                    onChange={e => setCantNodo(e.target.value)}
                    style={{ width: 60, padding: '4px 6px', fontSize: '.82rem', fontWeight: 700, textAlign: 'center' }}
                    placeholder="0"
                    disabled={!incTablas}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Barra de Control de Vista y Métricas */}
          <div className="card" style={{
            marginBottom: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)' }}>
                Modo de Visualización:
              </div>
              <div className="segmented-control" style={{ margin: 0 }}>
                <button
                  className={`segmented-btn ${viewMode === 'consolidado' ? 'active' : ''}`}
                  onClick={() => setViewMode('consolidado')}
                  style={{ fontSize: '.78rem', padding: '5px 14px' }}
                >
                  Consolidado General (Suma Total)
                </button>
                <button
                  className={`segmented-btn ${viewMode === 'desglosado' ? 'active' : ''}`}
                  onClick={() => setViewMode('desglosado')}
                  style={{ fontSize: '.78rem', padding: '5px 14px' }}
                >
                  Desglosado por Calculadora
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--tx2)', fontSize: '.74rem', padding: '5px 10px' }}>
                <strong>{totalCalculadorasActivas}</strong> {totalCalculadorasActivas === 1 ? 'calculadora unida' : 'calculadoras unidas'}
              </span>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', fontSize: '.78rem', padding: '5px 12px', fontWeight: 800 }}>
                <strong>{itemsConsolidados.length}</strong> materiales totales
              </span>
            </div>
          </div>

          {/* Alerta si no hay ninguna seleccionada */}
          {totalCalculadorasActivas === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                Ninguna calculadora seleccionada
              </div>
              <p style={{ margin: 0, fontSize: '.85rem' }}>
                Marca al menos una de las casillas superiores para generar la lista de materiales.
              </p>
            </div>
          )}

          {/* VISTA 1: Consolidado General (Suma Inteligente) */}
          {totalCalculadorasActivas > 0 && viewMode === 'consolidado' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 18, background: 'var(--bg-card)' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 240px 180px',
                background: 'var(--bg-elevated)',
                padding: '12px 20px',
                fontSize: '.72rem',
                color: 'var(--tx3)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontFamily: "'Outfit', 'Montserrat', sans-serif"
              }}>
                <span>Material</span>
                <span style={{ textAlign: 'center' }}>Origen / Desglose</span>
                <span style={{ textAlign: 'right' }}>Total Consolidado</span>
              </div>
              {itemsConsolidados.map((r, i) => (
                <div key={r.nombre || i} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 240px 180px',
                  padding: '12px 20px',
                  background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                  borderTop: '1px solid var(--border)',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <div>
                    <span style={{ fontSize: '.86rem', color: 'var(--tx1)', fontWeight: 500 }}>
                      {r.nombre}
                    </span>
                    {r.desglose.length > 1 && (
                      <span className="badge" style={{ marginLeft: 8, fontSize: '.66rem', background: 'rgba(1, 102, 255, 0.12)', color: 'var(--blue)', fontWeight: 700 }}>
                        Combina {r.desglose.length} listas
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {r.desglose.map((d, dIdx) => (
                      <span
                        key={dIdx}
                        style={{
                          fontSize: '.68rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: d.color + '18',
                          color: d.color,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {d.origen}: <strong>{fmt(d.cantidad)}</strong> {r.unidad}
                      </span>
                    ))}
                  </div>

                  <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    {fmt(r.cantidad)}
                    <span style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: r.unidad === 'mts' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(1, 102, 255, 0.12)',
                      color: r.unidad === 'mts' ? '#10b981' : 'var(--blue)'
                    }}>
                      {r.unidad}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISTA 2: Desglosado por Calculadora */}
          {totalCalculadorasActivas > 0 && viewMode === 'desglosado' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 18 }}>
              
              {/* Sección Proyecto */}
              {incProyecto && proyItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(1, 102, 255, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#0166ff', fontSize: '.9rem' }}>
                      Materiales de Proyecto ({proyItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>{proyectoNombre || 'Cálculo de Proyecto'}</span>
                  </div>
                  {proyItems.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{p.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#0166ff', textAlign: 'right' }}>
                        {fmt(p.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{p.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección Comunidades */}
              {incComunidades && comItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(245, 158, 11, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '.9rem' }}>
                      Activación Comunidades ({comItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>{respaldos} respaldos calculados</span>
                  </div>
                  {comItems.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{c.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#f59e0b', textAlign: 'right' }}>
                        {fmt(c.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{c.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección Tablas de Respaldo */}
              {incTablas && tabItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(16, 185, 129, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#10b981', fontSize: '.9rem' }}>
                      Armado de Tablas de Respaldo ({tabItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>Tradicional: {cantTrad || 0} | Nodo: {cantNodo || 0}</span>
                  </div>
                  {tabItems.map((t, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{t.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#10b981', textAlign: 'right' }}>
                        {fmt(t.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{t.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Botones de Acción Global */}
          {totalCalculadorasActivas > 0 && itemsConsolidados.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="bg" style={{ fontSize: '.84rem', padding: '9px 22px', minWidth: 160 }} onClick={copyConsolidado}>
                Copiar Lista Unificada
              </button>
              <button className="bs" style={{ fontSize: '.84rem', padding: '9px 22px', minWidth: 180, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportExcelConsolidado}>
                <IconExcel size={15} color="#10b981" />
                Descargar Excel Consolidado (.xlsx)
              </button>
            </div>
          )}
        </div>
      );
    }

export { ListaUnificadaCalc };
export default ListaUnificadaCalc;
