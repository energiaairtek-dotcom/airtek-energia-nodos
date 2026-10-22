import React from 'react';
import { AuthLogo, IconPlug } from '@/components/icons';

function PendingPage({ onLogout }) {
      return (
        <div className="gridbg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card fin" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--warn-bg)", border: "1px solid var(--warn-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "var(--amber)" }}><IconPlug size={24} /></div>
            <h2 className="fd" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0166ff', marginBottom: 8 }}>Cuenta pendiente</h2>
            <p style={{ color: 'var(--tx3)', fontSize: '.9rem', marginBottom: 20 }}>Tu cuenta está en espera de aprobación por un administrador.</p>
            <button className="bd" onClick={onLogout}>Cerrar sesión</button>
          </div>
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // QR MODAL
    // ═══════════════════════════════════════════════════

export default PendingPage;
export { PendingPage };
