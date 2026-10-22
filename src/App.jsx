import React, { useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { IconPlug, IconAlertTriangle } from '@/components/icons';
import { Toast } from './components/common/Toast';
import { ConfirmModal } from './components/common/ConfirmDialog';
import { Sidebar } from './components/layout/Sidebar';
import { LoginPage } from './modules/auth/LoginPage';
import { RegisterPage } from './modules/auth/RegisterPage';
import { PendingPage } from './modules/auth/PendingPage';
import { NodeList } from './modules/nodes/NodeComponents';
import { MaterialesWrapper } from './modules/calculators/materiales/MaterialesWrapper';
import { AutonomiaWrapper } from './modules/calculators/autonomia/AutonomiaWrapper';
import { CombustibleWrapper } from './modules/fuel/CombustibleWrapper';
import { ETPCalc } from './modules/calculators/etp/ETPCalc';
import { AdminPanel } from './modules/admin/AdminPanel';

export function App() {
  const { authState, userProfile, logout } = useAuth();
  const [authView, setAuthView] = useState('login');
  const [appView, setAppView] = useState('nodes');
  const [toastData, setToastData] = useState(null);
  const [modalConfig, setModalConfig] = useState(null);

  const toast = useCallback((msg, type = 'info') => {
    setToastData({ msg, type, key: Date.now() });
  }, []);

  // Loading Screen
  if (authState === 'loading') {
    return (
      <div className="gridbg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 50,
              height: 50,
              background: '#0166ff',
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              boxShadow: '0 0 28px rgba(1, 102, 255,.3)',
            }}
          >
            <IconPlug size={26} color="#ffffff" />
          </div>
          <div className="fd" style={{ color: '#0166ff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '.04em' }}>
            <span style={{ fontFamily: "'Outfit', 'Montserrat', sans-serif", fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              AIRTEK<span style={{ fontSize: '0.55em', verticalAlign: 'super', fontWeight: 500, color: 'var(--tx2)', marginLeft: '2px' }}>®</span>
            </span>
          </div>
          <div style={{ color: 'var(--tx4)', fontSize: '.78rem', marginTop: 4 }}>Inicializando sistema...</div>
        </div>
      </div>
    );
  }

  // Configuration Error Screen
  if (authState === 'error') {
    return (
      <div className="gridbg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div className="card" style={{ maxWidth: 400, textAlign: 'center' }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: 'rgba(245, 91, 93, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
            }}
          >
            <IconAlertTriangle size={28} color="#f55b5d" />
          </div>
          <h2 className="fd" style={{ color: '#0166ff', marginBottom: 8 }}>
            Configuración requerida
          </h2>
          <p style={{ color: 'var(--tx3)', fontSize: '.9rem' }}>
            Revisa la configuración de Firebase en el servicio y recarga la página.
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated: Login or Register
  if (authState === 'unauthenticated') {
    if (authView === 'register') return <RegisterPage onBack={() => setAuthView('login')} />;
    return <LoginPage onRegister={() => setAuthView('register')} />;
  }

  // Pending user approval
  if (authState === 'pending') {
    return <PendingPage onLogout={logout} />;
  }

  const role = (userProfile?.role || '').toLowerCase();
  const email = (userProfile?.email || '').toLowerCase();
  const name = (userProfile?.name || '').toLowerCase();
  const isUserAdmin =
    ['admin', 'supervisor', 'directivo'].includes(role) ||
    email.includes('robert') ||
    email.includes('ruidiaz') ||
    name.includes('robert');

  return (
    <div className="app-container">
      <Sidebar userProfile={userProfile} view={appView} setView={setAppView} onLogout={logout} toast={toast} />

      <main className="main-wrapper">
        {appView === 'nodes' && <NodeList userProfile={userProfile} toast={toast} />}
        {appView === 'calc' && <MaterialesWrapper />}
        {appView === 'autonomia' && <AutonomiaWrapper />}
        {appView === 'combustible' && <CombustibleWrapper userProfile={userProfile} toast={toast} />}
        {appView === 'etp' && <ETPCalc />}
        {appView === 'admin' && (isUserAdmin ? <AdminPanel userProfile={userProfile} toast={toast} /> : <NodeList userProfile={userProfile} toast={toast} />)}
      </main>

      {toastData && <Toast key={toastData.key} msg={toastData.msg} type={toastData.type} onDone={() => setToastData(null)} />}

      {modalConfig && (
        <ConfirmModal
          title={modalConfig.title}
          msg={modalConfig.msg}
          type={modalConfig.type}
          confirmText={modalConfig.confirmText}
          cancelText={modalConfig.cancelText}
          onConfirm={() => {
            if (modalConfig.onConfirm) modalConfig.onConfirm();
            setModalConfig(null);
          }}
          onCancel={() => setModalConfig(null)}
        />
      )}
    </div>
  );
}

export default App;
