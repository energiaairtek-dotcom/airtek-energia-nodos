import React from 'react';

    const UserMenuDropdownContext = React.createContext(null);

    function useUserMenuDropdown() {
      const ctx = React.useContext(UserMenuDropdownContext);
      if (!ctx) throw new Error('UserMenuDropdown subcomponents must be inside UserMenuDropdown.Root');
      return ctx;
    }

    const UserMenuDropdown = {
      Root: function UserMenuDropdownRoot({ children, className, style, userProfile, onLogout, onClose }) {
        return (
          <UserMenuDropdownContext.Provider value={{ userProfile, onLogout, onClose }}>
            <div className={className} style={style}>
              {children}
            </div>
          </UserMenuDropdownContext.Provider>
        );
      },
      ProfileInfo: function UserMenuDropdownProfileInfo() {
        const { userProfile } = useUserMenuDropdown();
        return (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>
            <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)', marginBottom: 2 }}>
              {userProfile?.name}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--tx2)', fontWeight: 500, marginBottom: 4 }}>
              {userProfile?.jobTitle || userProfile?.cargo || (
                userProfile?.role === 'admin' ? 'Administrador de Sistema' : 
                userProfile?.role === 'supervisor' ? 'Supervisor de Monitoreo de Energía' : 
                userProfile?.role === 'tecnico' ? 'Técnico de Operación y Mantenimiento' : 
                'Usuario Consultor'
              )}
            </div>
            <div style={{ fontSize: '.70rem', display: 'inline-block', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <span style={{ 
                color: ['admin', 'supervisor'].includes(userProfile?.role) ? '#38bdf8' : userProfile?.role === 'tecnico' ? '#4ade80' : '#f87171',
                fontWeight: 700
              }}>
                {['admin', 'supervisor'].includes(userProfile?.role) ? 'Acceso Total (Admin)' : userProfile?.role === 'tecnico' ? 'Visualizar y Registrar' : 'Solo Lectura'}
              </span>
            </div>
          </div>
        );
      },
      LogoutButton: function UserMenuDropdownLogoutButton() {
        const { onLogout, onClose } = useUserMenuDropdown();
        return (
          <button 
            onClick={() => { onLogout(); if (onClose) onClose(); }}
            style={{ width: '100%', background: 'none', border: 'none', color: 'var(--red)', padding: '8px', textAlign: 'left', cursor: 'pointer', borderRadius: 6, fontSize: '.82rem', fontWeight: 600 }}
          >
            Cerrar sesión
          </button>
        );
      },
      Desktop: function UserMenuDesktopDropdown({ isExpanded, userProfile, onLogout, onClose }) {
        return (
          <UserMenuDropdown.Root
            className="sidebar-user-dropdown"
            style={{
              position: 'absolute',
              left: isExpanded ? '0' : '70px',
              bottom: '100%',
              marginBottom: '8px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 10,
              minWidth: 180,
              zIndex: 1000,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
            userProfile={userProfile}
            onLogout={onLogout}
            onClose={onClose}
          >
            <UserMenuDropdown.ProfileInfo />
            <UserMenuDropdown.LogoutButton />
          </UserMenuDropdown.Root>
        );
      },
      Mobile: function UserMenuMobileDropdown({ userProfile, onLogout, onClose }) {
        return (
          <UserMenuDropdown.Root
            className="mobile-user-dropdown"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 10,
              minWidth: 200,
              zIndex: 1000,
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
            }}
            userProfile={userProfile}
            onLogout={onLogout}
            onClose={onClose}
          >
            <UserMenuDropdown.ProfileInfo />
            <UserMenuDropdown.LogoutButton />
          </UserMenuDropdown.Root>
        );
      }
    };


export default UserMenuDropdown;
export { UserMenuDropdown };
