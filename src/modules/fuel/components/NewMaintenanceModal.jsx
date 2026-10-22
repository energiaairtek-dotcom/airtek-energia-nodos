import { useState } from 'react';

function NewMaintenanceModal({ tanks, userProfile, onSave, onClose }) {
      const [planta, setPlanta] = useState(tanks[0]?.lugar || '');
      const [fecha, setFecha] = useState(() => new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
      const [horometroMtto, setHorometroMtto] = useState('');
      const [litrosAceite, setLitrosAceite] = useState('15 L');
      const [filtroAceite, setFiltroAceite] = useState('');
      const [filtroTrampa, setFiltroTrampa] = useState('');
      const [filtroComb, setFiltroComb] = useState('');
      const [filtroAire, setFiltroAire] = useState('No cambiado');
      const [intervalo, setIntervalo] = useState(250);
      const [obs, setObs] = useState('');

      const selTank = tanks.find(t => t.lugar === planta) || tanks[0];

      const handleSave = () => {
        if (!horometroMtto) {
          alert('Ingresa el horómetro al momento del mantenimiento.');
          return;
        }
        const hMtto = parseFloat(horometroMtto) || 0;
        const prox = hMtto + (parseFloat(intervalo) || 250);

        onSave({
          id: 'm_' + Date.now(),
          planta,
          tag: selTank?.equipo || 'PLT-GEN',
          kva: selTank?.kva || 100,
          fecha,
          horometro_mtto: hMtto,
          horometro_actual: hMtto,
          horas_trabajadas: 0,
          intervalo: parseFloat(intervalo) || 250,
          horas_restantes: parseFloat(intervalo) || 250,
          litros_aceite: litrosAceite,
          filtro_aceite: filtroAceite || 'Cambiado',
          filtro_trampa: filtroTrampa || 'N/A',
          filtro_comb: filtroComb || 'Cambiado',
          filtro_aire: filtroAire || 'No cambiado',
          prox_cambio: prox + ' h',
          obs,
          status: 'optimo'
        });
      };

      return (
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease' }} onClick={onClose}>
          <div className="card fin" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 540, padding: 24, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="fd" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Asentar Mantenimiento Preventivo
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Planta / Generador</label>
                <select className="fi" value={planta} onChange={e => setPlanta(e.target.value)}>
                  {tanks.map(t => <option key={t.id} value={t.lugar}>{t.lugar} ({t.equipo})</option>)}
                </select>
              </div>

              <div>
                <label className="lbl">Fecha de Mantenimiento</label>
                <input className="fi" type="text" value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Horómetro al Momento del Cambio</label>
                <input className="fi fm" type="number" step="any" placeholder="Ej: 1450" value={horometroMtto} onChange={e => setHorometroMtto(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Litros de Aceite Colocados</label>
                <input className="fi" type="text" placeholder="Ej: 15 L" value={litrosAceite} onChange={e => setLitrosAceite(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Intervalo de Mantenimiento (Horas)</label>
                <input className="fi fm" type="number" value={intervalo} onChange={e => setIntervalo(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Aceite (Código/Marca)</label>
                <input className="fi" type="text" placeholder="Ej: Qualid QL-51649" value={filtroAceite} onChange={e => setFiltroAceite(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro Trampa de Agua</label>
                <input className="fi" type="text" placeholder="Ej: Fleetguard FS1280" value={filtroTrampa} onChange={e => setFiltroTrampa(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Combustible</label>
                <input className="fi" type="text" placeholder="Ej: Fliplus 33405" value={filtroComb} onChange={e => setFiltroComb(e.target.value)} />
              </div>

              <div>
                <label className="lbl">Filtro de Aire</label>
                <input className="fi" type="text" placeholder="Ej: Original / No cambiado" value={filtroAire} onChange={e => setFiltroAire(e.target.value)} />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Observaciones del Mantenimiento</label>
                <textarea className="fi" rows={2} placeholder="Detalles de la intervención..." value={obs} onChange={e => setObs(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" style={{ flex: 1 }} onClick={handleSave}>
                Guardar Mantenimiento
              </button>
              <button className="bs" style={{ flex: 1 }} onClick={onClose}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      );
    }

export { NewMaintenanceModal };
export default NewMaintenanceModal;
