import { createContext, useContext } from 'react';

// --- CONFIRM DIALOG COMPOUND COMPONENT & EXPLICIT VARIANTS (vercel-composition-patterns) ---
export const ConfirmDialogContext = createContext(null);

export function useConfirmDialog() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error('ConfirmDialog components must be within ConfirmDialog.Root');
  return ctx;
}

export const ConfirmDialog = {
  Root: function ConfirmDialogRoot({ children, onClose, variant = 'confirm' }) {
    const isDanger = variant === 'danger' || variant === 'delete';
    const isSuccess = variant === 'success';
    const badgeBg = isDanger ? 'rgba(245, 91, 93, 0.15)' : isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(1, 102, 255, 0.15)';
    const badgeColor = isDanger ? '#f55b5d' : isSuccess ? '#22c55e' : '#0166ff';
    const btnBg = isDanger ? '#f55b5d' : isSuccess ? '#22c55e' : '#0166ff';

    return (
      <ConfirmDialogContext.Provider value={{ variant, isDanger, isSuccess, badgeBg, badgeColor, btnBg, onClose }}>
        <div className="overlay" style={{ zIndex: 10000, animation: 'fin 0.2s ease' }} onClick={onClose}>
          <div
            className="card fin"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90%',
              maxWidth: 380,
              padding: '28px 24px 22px',
              borderRadius: 20,
              position: 'relative',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
              textAlign: 'center',
            }}
          >
            {children}
          </div>
        </div>
      </ConfirmDialogContext.Provider>
    );
  },
  CloseButton: function ConfirmDialogCloseButton() {
    const { onClose } = useConfirmDialog();
    return (
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: 'var(--tx3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
        }}
        aria-label="Cerrar modal"
      >
        ✕
      </button>
    );
  },
  Icon: function ConfirmDialogIcon() {
    const { isDanger, isSuccess, badgeBg, badgeColor } = useConfirmDialog();
    return (
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: badgeBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        {isDanger ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={badgeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        ) : isSuccess ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={badgeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={badgeColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        )}
      </div>
    );
  },
  Title: function ConfirmDialogTitle({ children }) {
    return (
      <h3 className="fd" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--tx1)', marginBottom: 8, lineHeight: 1.35 }}>
        {children}
      </h3>
    );
  },
  Description: function ConfirmDialogDescription({ children }) {
    if (!children) return null;
    return (
      <p style={{ color: 'var(--tx3)', fontSize: '.86rem', marginBottom: 22, lineHeight: 1.5, padding: '0 4px' }}>
        {children}
      </p>
    );
  },
  Actions: function ConfirmDialogActions({ onConfirm, onCancel, confirmText, cancelText }) {
    const { btnBg, badgeColor, isDanger } = useConfirmDialog();
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={onConfirm}
          style={{
            width: '100%',
            padding: '11px 20px',
            borderRadius: 24,
            border: 'none',
            background: btnBg,
            color: '#ffffff',
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 700,
            fontSize: '.9rem',
            cursor: 'pointer',
            boxShadow: `0 4px 14px ${badgeColor}33`,
          }}
        >
          {confirmText || (isDanger ? 'Sí, estoy seguro' : 'Confirmar')}
        </button>
        {onCancel && cancelText !== false && (
          <button
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '8px 20px',
              borderRadius: 24,
              border: 'none',
              background: 'transparent',
              color: 'var(--tx3)',
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 600,
              fontSize: '.82rem',
              cursor: 'pointer',
            }}
          >
            {cancelText || 'Cancelar'}
          </button>
        )}
      </div>
    );
  },
  Danger: function ConfirmDangerDialog({ title, msg, confirmText, cancelText, onConfirm, onCancel }) {
    return (
      <ConfirmDialog.Root variant="danger" onClose={onCancel}>
        <ConfirmDialog.CloseButton />
        <ConfirmDialog.Icon />
        <ConfirmDialog.Title>{title}</ConfirmDialog.Title>
        <ConfirmDialog.Description>{msg}</ConfirmDialog.Description>
        <ConfirmDialog.Actions onConfirm={onConfirm} onCancel={onCancel} confirmText={confirmText} cancelText={cancelText} />
      </ConfirmDialog.Root>
    );
  },
  Success: function ConfirmSuccessDialog({ title, msg, confirmText, cancelText, onConfirm, onCancel }) {
    return (
      <ConfirmDialog.Root variant="success" onClose={onCancel}>
        <ConfirmDialog.CloseButton />
        <ConfirmDialog.Icon />
        <ConfirmDialog.Title>{title}</ConfirmDialog.Title>
        <ConfirmDialog.Description>{msg}</ConfirmDialog.Description>
        <ConfirmDialog.Actions onConfirm={onConfirm} onCancel={onCancel} confirmText={confirmText} cancelText={cancelText} />
      </ConfirmDialog.Root>
    );
  },
  Confirm: function ConfirmDefaultDialog({ title, msg, confirmText, cancelText, onConfirm, onCancel }) {
    return (
      <ConfirmDialog.Root variant="confirm" onClose={onCancel}>
        <ConfirmDialog.CloseButton />
        <ConfirmDialog.Icon />
        <ConfirmDialog.Title>{title}</ConfirmDialog.Title>
        <ConfirmDialog.Description>{msg}</ConfirmDialog.Description>
        <ConfirmDialog.Actions onConfirm={onConfirm} onCancel={onCancel} confirmText={confirmText} cancelText={cancelText} />
      </ConfirmDialog.Root>
    );
  },
};

// Backward-compatible adapter for existing usages
export function ConfirmModal({ title, msg, type = 'confirm', confirmText, cancelText, onConfirm, onCancel }) {
  if (type === 'danger' || type === 'delete') {
    return <ConfirmDialog.Danger title={title} msg={msg} confirmText={confirmText} cancelText={cancelText} onConfirm={onConfirm} onCancel={onCancel} />;
  }
  if (type === 'success') {
    return <ConfirmDialog.Success title={title} msg={msg} confirmText={confirmText} cancelText={cancelText} onConfirm={onConfirm} onCancel={onCancel} />;
  }
  return <ConfirmDialog.Confirm title={title} msg={msg} confirmText={confirmText} cancelText={cancelText} onConfirm={onConfirm} onCancel={onCancel} />;
}

export default ConfirmModal;
