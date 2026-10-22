import React, { useState, useEffect, useMemo } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { calcularMaterialesTablas, MATERIALES_TABLAS_RESPALDO } from '@/modules/calculators/materiales/calc';
import { IconExcel } from '@/components/icons';

function TablasRespaldoCalc({ onGoUnificada }) {
  const [cantTradicional, setCantTradicional] = useState(() => localStorage.getItem('airtek_tablas_resp_trad') || '5');
  const [cantNodo, setCantNodo] = useState(() => localStorage.getItem('airtek_tablas_resp_nodo') || '');

  const numTrad = parseFloat(cantTradicional) || 0;
  const numNodo = parseFloat(cantNodo) || 0;
  const totalTablas = (numTrad + numNodo) > 0 ? (numTrad + numNodo) : (parseFloat(cantTradicional) || 1);

  useEffect(() => {
    localStorage.setItem('airtek_tablas_resp_trad', cantTradicional);
    localStorage.setItem('airtek_tablas_resp_nodo', cantNodo);
  }, [cantTradicional, cantNodo]);

  const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

  const resultados = useMemo(() => {
    const tot = totalTablas;
    return MATERIALES_TABLAS_RESPALDO.map(m => ({
      id: m.id,
      nombre: m.nombre,
      requerida: m.base,
      unidad: m.unidad,
      tablas: tot,
      total: m.base * tot
    }));
  }, [totalTablas]);

  const copy = () => {
    if (!resultados || !resultados.length) return;
    let txt = 'AIRTEK - ARMADO DE TABLAS DE RESPALDO\n';
    txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
    txt += `Comunidad Tradicional: ${numTrad} tablas | Comunidad Nodo: ${numNodo} tablas | Total: ${totalTablas} tablas\n`;
    txt += '------------------------------------------------------------\n\n';
    resultados.forEach(r => {
      txt += `${r.nombre}: ${fmt(r.total)} ${r.unidad}\n`;
    });
    navigator.clipboard.writeText(txt).then(() => {
      alert('¡Listado copiado al portapapeles!');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      alert('¡Listado copiado al portapapeles!');
    });
  };

  const exportXlsx = async () => {

    const XLSX = await loadXLSX();
    if (!resultados || !resultados.length) return;
    const rows = resultados.map(r => ({
      'MATERIAL': r.nombre,
      'MATERIAL TOTAL': `${fmt(r.total)} ${r.unidad}`
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Agregar caja lateral de Cantidad de Tablas a Construir
    ws['F1'] = { v: 'CANTIDAD DE TABLAS A CONSTRUIR', t: 's' };
    ws['F2'] = { v: 'COMUNIDAD TRADICIONAL', t: 's' };
    ws['G2'] = { v: numTrad, t: 'n' };
    ws['F3'] = { v: 'COMUNIDAD NODO', t: 's' };
    ws['G3'] = { v: numNodo || '', t: numNodo ? 'n' : 's' };
    ws['F4'] = { v: 'TOTAL TABLAS', t: 's' };
    ws['G4'] = { v: totalTablas, t: 'n' };

    ws['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 4 }, { wch: 30 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Armado de Tablas de Respaldo');
    XLSX.writeFile(wb, 'Materiales_Armado_Tablas_Respaldo_' + Date.now() + '.xlsx');
  };

  return (
    <div className="fin">
      <div style={{ marginBottom: 18 }}>
        <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
          Calculadora Materiales - Armado de Tablas de Respaldo
        </h1>
        <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
          Cálculo y cómputo de componentes para construcción de tablas de respaldo fotovoltaicas.
        </p>
      </div>

      {/* Tarjeta de Entrada: Cantidad de Tablas a Construir */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          Cantidad de Tablas a Construir
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 18px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
              Comunidad Tradicional
            </label>
            <input
              className="fi fm"
              type="number"
              min="0"
              value={cantTradicional}
              onChange={e => setCantTradicional(e.target.value)}
              placeholder="Ej: 5"
              style={{ fontSize: '.92rem', fontWeight: 700 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
              Comunidad Nodo (Opcional)
            </label>
            <input
              className="fi fm"
              type="number"
              min="0"
              value={cantNodo}
              onChange={e => setCantNodo(e.target.value)}
              placeholder="Ej: 0"
              style={{ fontSize: '.92rem', fontWeight: 700 }}
            />
          </div>

          {/* Indicador de Total de Tablas */}
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
                Total Tablas a Construir
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx2)', marginTop: 2 }}>
                Tradicional: {numTrad} | Nodo: {numNodo}
              </div>
            </div>
            <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--blue)' }}>
              {totalTablas} <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--tx3)' }}>tablas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Listado Directo: Solo Material y Material Total */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: 'var(--bg-card)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 180px',
          background: 'var(--bg-elevated)',
          padding: '12px 20px',
          fontSize: '.72rem',
          color: 'var(--tx3)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          fontFamily: "'Outfit', 'Montserrat', sans-serif"
        }}>
          <span>Material</span>
          <span style={{ textAlign: 'right' }}>Material Total</span>
        </div>
        {resultados.map((r, i) => (
          <div key={r.id || i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 180px',
            padding: '12px 20px',
            background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
            borderTop: '1px solid var(--border)',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{ fontSize: '.86rem', color: 'var(--tx1)', fontWeight: 500 }}>
              {r.nombre}
            </span>
            <span className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {fmt(r.total)}
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
            </span>
          </div>
        ))}
      </div>

      {/* Botones de Acción */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="bg" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140 }} onClick={copy}>
          Copiar lista
        </button>
        <button className="bs" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportXlsx}>
          <IconExcel size={15} color="#10b981" />
          Descargar Excel (.xlsx)
        </button>
        {onGoUnificada && (
          <button className="bp" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 160, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onGoUnificada}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Unir con otras listas
          </button>
        )}
      </div>
    </div>
  );
}

export { TablasRespaldoCalc };
export default TablasRespaldoCalc;
