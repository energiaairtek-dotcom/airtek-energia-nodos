import { useState } from 'react';
import { auth, db, TS } from '@/services/firebase';
import { IconUser, IconKey, IconCheckCircle } from '@/components/icons';

import { sanitize } from '@/utils/formatters';

    function RegisterPage({ onBack }) {
      const [f, setF] = useState({ name: '', email: '', pass: '', pass2: '', role: 'tecnico' });
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');
      const [done, setDone] = useState(false);

      const go = async () => {
        setErr('');
        if (!f.name.trim() || !f.email.trim() || !f.pass) {
          setErr('Completa todos los campos obligatorios.');
          return;
        }
        if (f.pass !== f.pass2) {
          setErr('Las contraseñas no coinciden.');
          return;
        }
        if (f.pass.length < 6) {
          setErr('La contraseña debe tener al menos 6 caracteres.');
          return;
        }
        setLoading(true);
        try {
          const allowedRoles = ['tecnico', 'supervisor', 'directivo'];
          const selectedRole = allowedRoles.includes(f.role) ? f.role : 'tecnico';
          let regEmail = f.email.trim();
          if (!regEmail.includes('@')) regEmail = `${regEmail}@airtek.com.ve`;

          const cred = await auth.createUserWithEmailAndPassword(regEmail, f.pass);
          const profile = {
            name: sanitize(f.name.trim()),
            email: sanitize(regEmail.toLowerCase()),
            role: selectedRole,
            approved: false,
            createdAt: TS()
          };
          await db.collection('airtek_users').doc(cred.user.uid).set({
            ...profile,
            apps: { nodos: selectedRole, pm: null, almacen: null }
          });
          await db.collection('energy_users').doc(cred.user.uid).set(profile);
          await auth.signOut();
          setDone(true);
        } catch (e) {
          console.warn('Register error:', e?.code);
          if (e.code === 'auth/email-already-in-use') setErr('Este correo o usuario ya está registrado.');
          else if (e.code === 'auth/invalid-email') setErr('Formato de correo inválido.');
          else if (e.code === 'auth/weak-password') setErr('La contraseña es demasiado débil.');
          else setErr('Error al registrar. Intenta de nuevo.');
        }
        setLoading(false);
      };

      if (done) return (
        <div className="figma-login-container fin">
          <div className="figma-login-left">
            <div className="figma-login-left-brand">
              <img src="/img/airtek-blanco.png" alt="AIRTEK" />
              <div className="figma-login-left-title">Gerencia Operativa De Energia</div>
            </div>
          </div>
          <div className="figma-login-right">
            <div className="figma-login-form-box" style={{ textAlign: 'center' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#15803d' }}>
                <IconCheckCircle size={32} />
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111111', marginBottom: 8, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>Solicitud Enviada</h2>
              <p style={{ color: '#555555', fontSize: '.88rem', marginBottom: 24, lineHeight: 1.5 }}>
                Tu cuenta ha sido creada exitosamente. Un administrador aprobará tu acceso pronto.
              </p>
              <button className="figma-login-btn" onClick={onBack}>Volver al inicio de sesión</button>
            </div>
          </div>
        </div>
      );

      return (
        <div className="figma-login-container fin">
          <div className="figma-login-left">
            <div className="figma-login-left-brand">
              <img src="/img/airtek-blanco.png" alt="AIRTEK" />
              <div className="figma-login-left-title">Gerencia Operativa De Energia</div>
            </div>
          </div>
          <div className="figma-login-right">
            <div className="figma-login-form-box">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center' }}>←</button>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#111111', fontFamily: "'Outfit', 'Montserrat', sans-serif", margin: 0 }}>Crear Cuenta</h2>
              </div>

              {err && (
                <div style={{ background: 'rgba(245, 91, 93, 0.1)', border: '1px solid rgba(245, 91, 93, 0.3)', color: '#dc2626', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: '.84rem', textAlign: 'center' }}>
                  {err}
                </div>
              )}

              <div className="figma-input-wrapper">
                <span className="figma-input-icon-left"><IconUser size={18} color="#333333" /></span>
                <input className="figma-input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nombre y Apellido" />
              </div>

              <div className="figma-input-wrapper">
                <span className="figma-input-icon-left"><IconUser size={18} color="#333333" /></span>
                <input className="figma-input" type="text" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="Correo o usuario" />
              </div>

              <div className="figma-input-wrapper">
                <span className="figma-input-icon-left"><IconKey size={18} color="#333333" /></span>
                <input className="figma-input" type="password" value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} placeholder="Contraseña" />
              </div>

              <div className="figma-input-wrapper">
                <span className="figma-input-icon-left"><IconKey size={18} color="#333333" /></span>
                <input className="figma-input" type="password" value={f.pass2} onChange={e => setF({ ...f, pass2: e.target.value })} placeholder="Confirmar contraseña" />
              </div>

              <div style={{ marginBottom: 20 }}>
                <select className="figma-input" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={{ padding: '12px 18px' }}>
                  <option value="tecnico">Técnico (Inspecciones y Equipos)</option>
                  <option value="supervisor">Supervisor (Control y Aprobaciones)</option>
                  <option value="directivo">Directivo (Reportes y Lectura)</option>
                </select>
              </div>

              <button className="figma-login-btn" onClick={go} disabled={loading}>
                {loading ? 'Registrando...' : 'Solicitar Acceso'}
              </button>
            </div>
          </div>
        </div>
      );
    }

export default RegisterPage;
export { RegisterPage };
