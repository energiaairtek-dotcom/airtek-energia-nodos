import { useState } from 'react';


import { UID_AddForm } from '@/modules/admin/components/UID_AddForm';

function AddExistingUser({ toast, userProfile }) {
      const [open, setOpen] = useState(false);
      return (
        <div className="card" style={{ marginBottom: 16, borderColor: 'rgba(1, 102, 255,.25)', background: 'rgba(1, 102, 255,.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
            <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#0166ff', textTransform: 'uppercase', letterSpacing: '.1em' }}>
              Agregar Usuario Existente de Firebase
            </h3>
            <span style={{ color: '#0166ff', fontSize: 18 }}>{open ? '▲' : '▼'}</span>
          </div>
          {open && (
            <div style={{ marginTop: 14 }}>
              <div style={{ background: 'rgba(1, 102, 255,.08)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '.82rem', color: 'var(--tx3)', lineHeight: 1.6 }}>
                Para usuarios que ya tienen cuenta en otras apps del mismo proyecto Firebase.<br />
                <b style={{ color: '#0166ff' }}>Cómo obtener el UID:</b> Firebase Console → Authentication → Users → copia el User UID del usuario.
              </div>
              <UID_AddForm toast={toast} userProfile={userProfile} onDone={() => setOpen(false)} />
            </div>
          )}
        </div>
      );
    }

export { AddExistingUser };
export default AddExistingUser;
