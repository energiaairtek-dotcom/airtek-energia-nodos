function MF({ label, unit, vals, k, onChange }) {
      return (
        <div>
          <label style={{ display: 'block', fontSize: '.68rem', color: '#475569', marginBottom: 3, fontFamily: "'Outfit', 'Montserrat', sans-serif", textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {label} <span style={{ color: '#0166ff' }}>{unit}</span>
          </label>
          <input className="mi" type="number" step="any" value={vals[k] ?? ''} onChange={e => onChange(k, e.target.value)} placeholder="—" />
        </div>
      );
    }

export { MF };
export default MF;
