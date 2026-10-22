import React, { useState, useEffect } from 'react';
import { auth } from '@/services/firebase';
import { AuthLogo, IconUser, IconKey, IconEye, IconEyeOff } from '@/components/icons';
import { Toast } from '@/components/common/Toast';

    function LoginPage({ onRegister }) {
      const [email, setEmail] = useState('');
      const [pass, setPass] = useState('');
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');
      const [showPass, setShowPass] = useState(false);
      const [forgotMode, setForgotMode] = useState(false);
      const [forgotEmail, setForgotEmail] = useState('');
      const [forgotMsg, setForgotMsg] = useState('');
      const [forgotLoading, setForgotLoading] = useState(false);

      const go = async () => {
        if (!email.trim() || !pass) {
          setErr('Ingresa tu usuario/correo y contraseña.');
          return;
        }
        setErr(''); 
        setLoading(true);
        try {
          // Si el usuario ingresa solo el username sin @, autocompletar con @airtek.com.ve o el dominio
          let loginEmail = email.trim();
          if (!loginEmail.includes('@')) {
            loginEmail = `${loginEmail}@airtek.com.ve`;
          }
          await auth.signInWithEmailAndPassword(loginEmail, pass);
        } catch (e) {
          // Si falló con @airtek.com.ve, intentar tal cual o con @airtek.com
          if (!email.includes('@')) {
            try {
              await auth.signInWithEmailAndPassword(`${email.trim()}@airtek.com`, pass);
              setLoading(false);
              return;
            } catch (e2) {}
          }
          console.warn('Login error:', e?.code);
          let msg = 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.';
          if (e.code === 'auth/user-not-found') msg = 'No existe una cuenta registrada con este usuario.';
          else if (e.code === 'auth/wrong-password') msg = 'Contraseña incorrecta. Intenta de nuevo.';
          else if (e.code === 'auth/invalid-email') msg = 'Formato de correo electrónico inválido.';
          else if (e.code === 'auth/user-disabled') msg = 'Esta cuenta ha sido inhabilitada por un administrador.';
          else if (e.code === 'auth/too-many-requests') msg = 'Demasiados intentos fallidos. Intenta más tarde.';
          setErr(msg);
        }
        setLoading(false);
      };

      const handleResetPassword = async () => {
        if (!forgotEmail.trim()) {
          setErr('Escribe tu correo electrónico para enviar el enlace.');
          return;
        }
        setErr('');
        setForgotMsg('');
        setForgotLoading(true);
        try {
          let resetEmail = forgotEmail.trim();
          if (!resetEmail.includes('@')) resetEmail = `${resetEmail}@airtek.com.ve`;
          await auth.sendPasswordResetEmail(resetEmail);
          setForgotMsg('Se ha enviado un enlace a tu correo para restablecer tu contraseña.');
        } catch (e) {
          console.warn('Reset error:', e?.code);
          let msg = 'Error al enviar el correo. Verifica que esté registrado.';
          if (e.code === 'auth/user-not-found') msg = 'No existe ninguna cuenta con este correo.';
          else if (e.code === 'auth/invalid-email') msg = 'Formato de correo electrónico inválido.';
          setErr(msg);
        }
        setForgotLoading(false);
      };

      return (
        <div className="figma-login-container fin">
          <div className="figma-login-left">
            <div className="figma-login-left-brand">
              <img src="./img/airtek-blanco.png" alt="AIRTEK" />
              <div className="figma-login-left-title">Gerencia Operativa De Energia</div>
            </div>
          </div>
          <div className="figma-login-right">
            <div className="figma-login-form-box">
              <h2 style={{
                textAlign: 'center',
                fontSize: '1.45rem',
                fontWeight: 700,
                color: '#111111',
                marginBottom: 28,
                fontFamily: "'Outfit', 'Montserrat', sans-serif"
              }}>
                {forgotMode ? 'Recuperar contraseña' : 'Iniciar sesión'}
              </h2>

              {err && (
                <div style={{
                  background: 'rgba(245, 91, 93, 0.1)',
                  border: '1px solid rgba(245, 91, 93, 0.3)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 20,
                  color: '#dc2626',
                  fontSize: '.85rem',
                  textAlign: 'center'
                }}>
                  {err}
                </div>
              )}

              {forgotMsg && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 20,
                  color: '#15803d',
                  fontSize: '.85rem',
                  textAlign: 'center'
                }}>
                  {forgotMsg}
                </div>
              )}

              {forgotMode ? (
                <>
                  <div className="figma-input-wrapper" style={{ marginBottom: 20 }}>
                    <span className="figma-input-icon-left">
                      <IconUser size={18} color="#333333" />
                    </span>
                    <input 
                      className="figma-input"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="Correo electrónico o usuario"
                      onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                      autoFocus
                    />
                  </div>

                  <button 
                    className="figma-login-btn"
                    onClick={handleResetPassword}
                    disabled={forgotLoading}
                  >
                    {forgotLoading ? 'Enviando enlace...' : 'Enviar enlace'}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 22 }}>
                    <button
                      onClick={() => { setForgotMode(false); setErr(''); setForgotMsg(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0166ff',
                        cursor: 'pointer',
                        fontSize: '.86rem',
                        fontWeight: 600
                      }}
                    >
                      ← Volver al inicio de sesión
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="figma-input-wrapper">
                    <span className="figma-input-icon-left">
                      <IconUser size={18} color="#333333" />
                    </span>
                    <input 
                      className="figma-input"
                      type="text"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Usuario"
                      onKeyDown={e => e.key === 'Enter' && go()}
                    />
                  </div>

                  <div className="figma-input-wrapper" style={{ marginBottom: 12 }}>
                    <span className="figma-input-icon-left">
                      <IconKey size={18} color="#333333" />
                    </span>
                    <input 
                      className="figma-input"
                      type={showPass ? "text" : "password"}
                      value={pass}
                      onChange={e => setPass(e.target.value)}
                      placeholder="Contraseña"
                      onKeyDown={e => e.key === 'Enter' && go()}
                    />
                    <button 
                      type="button"
                      className="figma-input-icon-right"
                      onClick={() => setShowPass(!showPass)}
                      title={showPass ? "Ocultar contraseña" : "Ver contraseña"}
                    >
                      {showPass ? <IconEye size={18} color="#555" /> : <IconEyeOff size={18} color="#555" />}
                    </button>
                  </div>

                  <div style={{ textAlign: 'right', marginBottom: 20 }}>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setForgotEmail(email); setErr(''); setForgotMsg(''); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0166ff',
                        cursor: 'pointer',
                        fontSize: '.78rem',
                        fontWeight: 600
                      }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  <button 
                    className="figma-login-btn"
                    onClick={go}
                    disabled={loading}
                  >
                    {loading ? 'Ingresando...' : 'Ingresar'}
                  </button>

                  <div style={{ textAlign: 'center', marginTop: 22 }}>
                    <span style={{ color: '#666666', fontSize: '.85rem' }}>¿No tienes cuenta? </span>
                    <button
                      type="button"
                      onClick={onRegister}
                      style={{
                        color: '#0166ff',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '.85rem',
                        fontWeight: 700
                      }}
                    >
                      Registrarse
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }


export default LoginPage;
export { LoginPage };
