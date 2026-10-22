import { useEffect } from 'react';

export function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const config = {
    success: {
      color: '#008000',
      bg: 'var(--success-bg)',
      border: 'var(--success-border)',
      title: 'Operación exitosa',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
    },
    error: {
      color: '#f55b5d',
      bg: 'var(--error-bg)',
      border: 'var(--error-border)',
      title: 'Error del sistema',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ),
    },
    warn: {
      color: '#ff7d32',
      bg: 'var(--warn-bg)',
      border: 'var(--warn-border)',
      title: 'Advertencia',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    info: {
      color: '#0166ff',
      bg: 'var(--info-bg)',
      border: 'var(--info-border)',
      title: 'Información',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
  };

  const c = config[type] || config.info;

  return (
    <div
      className="toast"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 18px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        minWidth: 320,
        maxWidth: 440,
        color: 'var(--tx1)',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: c.bg,
          color: c.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {c.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div className="title-sm" style={{ color: 'var(--tx1)', marginBottom: 2 }}>
          {c.title}
        </div>
        <div className="body-sm" style={{ color: 'var(--tx2)' }}>
          {msg}
        </div>
      </div>
      <button
        onClick={onDone}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--tx4)',
          cursor: 'pointer',
          fontSize: 16,
          padding: 4,
          lineHeight: 1,
          marginTop: -2,
        }}
        aria-label="Cerrar notificación"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default Toast;
