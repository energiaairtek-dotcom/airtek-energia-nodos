import { useState } from 'react';
import firebase, { auth } from '@/services/firebase';

    function ChangePasswordModal({ onClose, toast }) {
      const [cur, setCur] = useState('');
      const [p1, setP1] = useState('');
      const [p2, setP2] = useState('');
      const [loading, setLoading] = useState(false);

      const save = async () => {
        if (!cur || !p1 || !p2) { toast('Completa todos los campos.', 'error'); return; }
        if (p1 !== p2) { toast('Las contraseñas nuevas no coinciden.', 'error'); return; }
        if (p1.length < 6) { toast('La contraseña debe tener al menos 6 caracteres.', 'error'); return; }
        setLoading(true);
        try {
          const user = auth.currentUser;
          const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
          await user.reauthenticateWithCredential(cred);
          await user.updatePassword(p1);
          toast('Contraseña actualizada exitosamente.', 'success');
          onClose();
        } catch (e) {
          if (e.code === 'auth/wrong-password') toast('Contraseña actual incorrecta.', 'error');
          else toast('Error: ' + e.message, 'error');
        }
        setLoading(false);
      };

      return (
        <div className="overlay" onClick={onClose}>
          <div className="card fin" style={{ maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <h3 className="fd" style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--tx1)' }}>Cambiar Contraseña</h3>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="lbl">Contraseña actual</label>
              <input className="fi" type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="••••••••" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="lbl">Nueva contraseña</label>
              <input className="fi" type="password" value={p1} onChange={e => setP1(e.target.value)} placeholder="••••••••" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="lbl">Confirmar nueva contraseña</label>
              <input className="fi" type="password" value={p2} onChange={e => setP2(e.target.value)} placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && save()} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="bp" style={{ flex: 1 }} onClick={save} disabled={loading}>{loading ? 'Guardando...' : 'Actualizar'}</button>
              <button className="bs" onClick={onClose} disabled={loading}>Cancelar</button>
            </div>
            <p style={{ marginTop: 12, fontSize: '.75rem', color: 'var(--tx4)', textAlign: 'center' }}>
              La contraseña se actualizará para el inicio de sesión con este correo.
            </p>
          </div>
        </div>
      );
    }

export default ChangePasswordModal;
export { ChangePasswordModal };
