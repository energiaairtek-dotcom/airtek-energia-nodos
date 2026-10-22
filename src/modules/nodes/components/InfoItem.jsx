const InfoItem = ({ label, value, mono }) => (
      <div>
        <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>{label}</div>
        <div className={mono ? 'fm' : ''} style={{ fontSize: '.9rem', color: 'var(--tx1)', fontWeight: 500 }}>{value || '—'}</div>
      </div>
    );

export { InfoItem };
export default InfoItem;
