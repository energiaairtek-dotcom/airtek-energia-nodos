import { useState, useMemo, useEffect } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { calcularMaterialesProyecto, calcularMaterialesComunidades, calcularMaterialesTablas, MATERIALES_TABLAS_RESPALDO, MATERIALES_ACTIVACION } from '@/modules/calculators/materiales/calc';
import { DEFAULT_PROYECTO_FORM } from '@/modules/calculators/materiales/constants';
import { MaterialesCalc } from '@/modules/calculators/materiales/components/MaterialesCalc';
import { ComunidadesCalc } from '@/modules/calculators/materiales/components/ComunidadesCalc';
import { TablasRespaldoCalc } from '@/modules/calculators/materiales/components/TablasRespaldoCalc';
import { ListaUnificadaCalc } from '@/modules/calculators/materiales/components/ListaUnificadaCalc';
import { IconExcel } from '@/components/icons';

    function MaterialesWrapper() {
      const [tab, setTab] = useState(() => localStorage.getItem('airtek_materiales_calc_tab') || 'proyecto');
      const handleTab = (t) => {
        setTab(t);
        try { localStorage.setItem('airtek_materiales_calc_tab', t); } catch {}
      };

      return (
        <div className="fin">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
              <button className={`segmented-btn ${tab === 'proyecto' ? 'active' : ''}`} onClick={() => handleTab('proyecto')}>Materiales Proyecto</button>
              <button className={`segmented-btn ${tab === 'comunidades' ? 'active' : ''}`} onClick={() => handleTab('comunidades')}>Activación Comunidades</button>
              <button className={`segmented-btn ${tab === 'tablas_respaldo' ? 'active' : ''}`} onClick={() => handleTab('tablas_respaldo')}>Armado de Tablas de Respaldo</button>
              <button className={`segmented-btn ${tab === 'unificada' ? 'active' : ''}`} onClick={() => handleTab('unificada')} style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Unir Listas (Consolidado)
              </button>
            </div>
          </div>
          {tab === 'proyecto' && <MaterialesCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'comunidades' && <ComunidadesCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'tablas_respaldo' && <TablasRespaldoCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'unificada' && <ListaUnificadaCalc onNavigateTab={handleTab} />}
        </div>
      );
    }

    ;

            // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    // LISTA UNIFICADA Y CONSOLIDADA DE MATERIALES
    // --- CONFIRM DIALOG COMPOUND COMPONENT & EXPLICIT VARIANTS (vercel-composition-patterns) ---

export default MaterialesWrapper;
export { MaterialesWrapper, MaterialesCalc, ComunidadesCalc, TablasRespaldoCalc, ListaUnificadaCalc };
