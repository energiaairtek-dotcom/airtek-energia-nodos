import { useState } from 'react';
import { AutonomiaRedView } from '@/modules/calculators/autonomia/components/AutonomiaRedView';
import { AutonomiaCalc } from '@/modules/calculators/autonomia/components/AutonomiaCalc';
import { SimpleAutonomiaCalc } from '@/modules/calculators/autonomia/components/SimpleAutonomiaCalc';
import { loadXLSX } from '@/utils/exportLibs';
import { db } from '@/services/firebase';
import { BAT_VN, BAT_DEFAULTS } from '@/config/constants';
import { IconExcel, IconCopy, IconAlertTriangle, IconCheckCircle } from '@/components/icons';
import { getBankId, calcLoad, getEqTypeFromTag, calcAutonomy, fmtHours } from '@/utils/energyCalculations';

            // ═══════════════════════════════════════════════════
    //  VISTA STANDALONE DE AUTONOMÍA
    // ═══════════════════════════════════════════════════
    // REPORTE GLOBAL DE AUTONOMÍA DE LA RED POR BANCOS
    // ═══════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════
    // REPORTE GLOBAL DE AUTONOMÍA DE LA RED POR BANCOS
    function AutonomiaWrapper() {
      const [tab, setTab] = useState('red'); // red | simulacion
      return (
        <div className="fin">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <div className="segmented-control">
              <button className={`segmented-btn ${tab === 'red' ? 'active' : ''}`} onClick={() => setTab('red')}>
                Autonomía de la Red
              </button>
              <button className={`segmented-btn ${tab === 'simulacion' ? 'active' : ''}`} onClick={() => setTab('simulacion')}>
                Calculadora de Simulación
              </button>
            </div>
          </div>

          {tab === 'red' ? (
            <AutonomiaRedView />
          ) : (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>Calculadoras de Autonomía</h1>
                <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>Herramientas para proyectar requerimientos y estimar el rendimiento de la red.</p>
              </div>
              <SimpleAutonomiaCalc />
              <AutonomiaCalc />
            </div>
          )}
        </div>
      );
    }


    // ═══════════════════════════════════════════════════════════════════════
    // MÓDULO DE GESTIÓN DE COMBUSTIBLE, SURTIDOS Y MANTENIMIENTO DE PLANTAS
    // ═══════════════════════════════════════════════════════════════════════


export default AutonomiaWrapper;
export { AutonomiaWrapper, AutonomiaRedView, AutonomiaCalc, SimpleAutonomiaCalc };
