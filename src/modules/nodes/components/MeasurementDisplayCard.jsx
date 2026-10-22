import { getFieldLabel, getFieldUnit } from '@/modules/nodes/fieldLabels';
import { EQ_TYPES } from '@/config/constants';
import { getEqTypeFromTag, calcLoad } from '@/utils/energyCalculations';

function MeasurementDisplayCard({ tag, highlight, vals = {}, equipment = [] }) {
      const type = getEqTypeFromTag(tag, equipment);
      const ti = EQ_TYPES[type] || EQ_TYPES.OTR;
      const ld = calcLoad(type, vals);
      const load = ld.ac + ld.dc;
      return (
        <div style={{ background: highlight ? 'rgba(33, 192, 250,.06)' : 'var(--bg-surface)', borderRadius: 10, padding: '10px 12px', marginBottom: 6, border: `1px solid ${highlight ? 'rgba(33, 192, 250,.2)' : 'var(--border)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className="badge" style={{ background: ti.bg, color: ti.color, fontSize: '.62rem' }}>{type}</span>
              <span className="fm" style={{ fontSize: '.88rem', color: 'var(--tx1)', fontWeight: 600 }}>{tag}</span>
              {(() => {
                const eq = (equipment || []).find(e => e.tag === tag);
                if (eq?.type === 'ETP' && eq.solarRegPercentage) {
                  return <span style={{ color: '#0166ff', fontSize: '.73rem', fontWeight: 600 }}>{eq.solarRegPercentage}%</span>;
                }
                return null;
              })()}
            </div>
            {load > 0 && <span className="fm" style={{ fontSize: '.8rem', color: '#008000', fontWeight: 700 }}>{load.toFixed(2)} kW</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 6 }}>
            {Object.entries(vals).filter(([, v]) => v !== '' && v !== null).map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-deep)', borderRadius: 5, padding: '6px 8px' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 1, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>{getFieldLabel(k)} <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{getFieldUnit(k)}</span></div>
                <div className="fm" style={{ fontSize: '.95rem', color: '#008000', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

export { MeasurementDisplayCard };
export default MeasurementDisplayCard;
