import React, { useState, useEffect, useMemo } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { calcularMaterialesComunidades, MATERIALES_ACTIVACION } from '@/modules/calculators/materiales/calc';
import { IconExcel } from '@/components/icons';

function ComunidadesCalc({ onGoUnificada }) {
  const [respaldos, setRespaldos] = useState(() => localStorage.getItem('energia_act_comunidades_resp') || '6');

  useEffect(() => {
    localStorage.setItem('energia_act_comunidades_resp', respaldos);
  }, [respaldos]);

  const numResp = parseFloat(respaldos) || 0;
  const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

  const resultados = useMemo(() => {
    const r = numResp > 0 ? numResp : 0;
    return MATERIALES_ACTIVACION.map(m => ({
      id: m.id,
      nombre: m.nombre,
      requerida: m.base,
      respaldos: r,
      total: m.base * r
    }));
  }, [numResp]);

  const copy = () => {
    if (!resultados || !resultados.length) return;
    let txt = 'AIRTEK - MATERIALES ACTIVACION COMUNIDADES (COMUNIDAD TRADICIONAL)\n';
    txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
    txt += `Número de Respaldos: ${numResp}\n`;
    txt += '------------------------------------------------------------\n\n';
    resultados.forEach(r => {
      txt += `${r.nombre}: ${fmt(r.total)} (Requerido: ${fmt(r.requerida)}/respaldo)\n`;
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
    const rows = resultados.map((r, idx) => ({
      'MATERIAL': r.nombre,
      'UNIDAD REQUERIDA': fmt(r.requerida),
      'NUMERO DE RESPALDOS': idx === 0 ? numResp : '',
      'MATERIAL TOTAL': fmt(r.total)
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 65 }, { wch: 20 }, { wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Activacion C.Tradicional');
    XLSX.writeFile(wb, 'Materiales_Activacion_Comunidades_' + Date.now() + '.xlsx');
  };

  return (
    <div className="fin">
      <div style={{ marginBottom: 18 }}>
        <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
          Calculadora Materiales - Activación Comunidades
        </h1>
        <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
          Activación C. Tradicional - listado de materiales por número de respaldos
        </p>
      </div>

      {/* Tarjeta de Entrada: Solo Número de Respaldos (Idéntico a la hoja Excel) */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 18px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
              Número de respaldos
            </label>
            <input
              className="fi fm"
              type="number"
              min="0"
              value={respaldos}
              onChange={e => setRespaldos(e.target.value)}
              placeholder="Ej: 6"
              style={{ fontSize: '.95rem', fontWeight: 700 }}
            />
          </div>

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
                Respaldos a Construir
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx2)', marginTop: 2 }}>
                C. Tradicional
              </div>
            </div>
            <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--blue)' }}>
              {numResp} <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--tx3)' }}>respaldos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Lista Generada Directamente */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: 'var(--bg-card)' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 140px 140px',
          background: 'var(--bg-elevated)',
          padding: '10px 16px',
          fontSize: '.7rem',
          color: 'var(--tx3)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          fontFamily: "'Outfit', 'Montserrat', sans-serif"
        }}>
          <span>Material</span>
          <span style={{ textAlign: 'center' }}>Unidad Requerida</span>
          <span style={{ textAlign: 'center' }}>Número de Respaldos</span>
          <span style={{ textAlign: 'right' }}>Material Total</span>
        </div>
        {resultados.map((r, i) => (
          <div key={r.id || i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 140px 140px 140px',
            padding: '10px 16px',
            background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
            borderTop: '1px solid var(--border)',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 500 }}>
              {r.nombre}
            </span>
            <span style={{ fontSize: '.84rem', color: 'var(--tx2)', textAlign: 'center', fontFamily: "'Outfit', monospace" }}>
              {fmt(r.requerida)}
            </span>
            <span style={{ fontSize: '.84rem', color: 'var(--tx2)', textAlign: 'center', fontFamily: "'Outfit', monospace" }}>
              {fmt(r.respaldos)}
            </span>
            <span className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right' }}>
              {fmt(r.total)}
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

export { ComunidadesCalc };
export default ComunidadesCalc;
