

function AutonomiaInput({ label, val, onChange, unit, small }) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 0, fontFamily: "'Outfit', 'Montserrat', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={label}>
            <span>{label}{unit && <span style={{ color: 'var(--amber)', marginLeft: 3 }}>({unit})</span>}</span>
          </label>
          <input className="mi" type="text" inputMode="decimal" value={val}
            onChange={e => onChange(e.target.value)}
            style={{ fontSize: small ? '.8rem' : '.88rem' }} placeholder="0" />
        </div>
      );
    }

export { AutonomiaInput };
export default AutonomiaInput;
