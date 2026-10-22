import React, { useState, useEffect } from 'react';
import { IconHome, IconCalc, IconAdmin, IconSun, IconMoon } from '@/components/icons';
import { UserMenuDropdown } from './UserMenuDropdown';
import { ChangePasswordModal } from './ChangePasswordModal';
import { useTheme } from '@/context/ThemeContext';

    function Sidebar({ userProfile, view, setView, onLogout, toast }) {
      const [isExpanded, setIsExpanded] = useState(false);
      const [pwModal, setPwModal] = useState(false);
      const [userMenu, setUserMenu] = useState(false);
      const [theme, setTheme] = useState(() => localStorage.getItem('airtek_theme') || 'light');

      const toggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        setTheme(next);
        localStorage.setItem('airtek_theme', next);
        document.documentElement.setAttribute('data-theme', next);
      };

      useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
      }, [theme]);

      const navItems = [
        { key: 'nodes', label: 'Inicio', icon: IconHome },
        { key: 'calc', label: 'Materiales', icon: IconCalc },
        { key: 'autonomia', label: 'Autonomía', icon: () => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <line x1="6" y1="11" x2="6" y2="17"/>
            <line x1="10" y1="14" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
            <line x1="18" y1="13" x2="18" y2="17"/>
          </svg>
        )},
        { key: 'combustible', label: 'Combustible', icon: () => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/>
            <path d="M15 10h2a2 2 0 0 1 2 2v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-9l-3-3"/>
            <line x1="3" y1="22" x2="15" y2="22"/>
            <rect x="6" y="7" width="6" height="5" rx="1"/>
          </svg>
        )},
        { key: 'etp', label: 'Regulación ETP23006', icon: () => (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        )}
      ];

      const isUserAdmin = ['supervisor', 'directivo', 'admin'].includes((userProfile?.role || '').toLowerCase()) ||
        (userProfile?.email || '').toLowerCase().includes('robert') ||
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') ||
        (userProfile?.name || '').toLowerCase().includes('robert');

      if (isUserAdmin) {
        navItems.push({ key: 'admin', label: 'Administración', icon: IconAdmin });
      }



      return (
        <React.Fragment>
          {pwModal && <ChangePasswordModal onClose={() => setPwModal(false)} toast={toast} />}

          {/* DESKTOP SIDEBAR */}
          <div 
            className={`sidebar desktop-sidebar ${isExpanded ? 'expanded' : ''}`}
            onMouseEnter={() => { if (window.innerWidth > 768) setIsExpanded(true); }}
            onMouseLeave={() => { setIsExpanded(false); setUserMenu(false); }}
          >
            {/* TOP HEADER */}
            <div className="sidebar-top-row">
              <div className="sidebar-brand" onClick={() => setView('nodes')} title="Inicio - Airtek">
                <div className="nav-item-icon">
                  <img 
                    src={theme === 'dark' ? './img/user-logo-white.png' : './img/user-logo-black.png'}
                    alt="AIRTEK"
                  />
                </div>
              </div>

              {isExpanded && (
                <div 
                  className="theme-switch-track" 
                  onClick={toggleTheme} 
                  title={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
                >
                  <div className={`theme-switch-knob ${theme === 'dark' ? 'dark-mode' : 'light-mode'}`}>
                    {theme === 'dark' ? <IconMoon size={13} color="#ffffff" /> : <IconSun size={13} color="#ffffff" />}
                  </div>
                  <div className="theme-switch-icon-slot">
                    <IconMoon size={13} color={theme === 'dark' ? 'transparent' : '#71717a'} />
                  </div>
                  <div className="theme-switch-icon-slot">
                    <IconSun size={13} color={theme === 'light' ? 'transparent' : '#71717a'} />
                  </div>
                </div>
              )}
            </div>

            {/* MENU LIST */}
            <div className="sidebar-menu-list">
              {navItems.map(item => {
                const IconComp = item.icon;
                const isActive = view === item.key;
                return (
                  <button
                    key={item.key}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setView(item.key)}
                  >
                    <div className="nav-item-icon">
                      <IconComp size={20} />
                    </div>
                    {isExpanded && <span className="nav-item-label">{item.label}</span>}
                    {!isExpanded && <span className="sidebar-tooltip">{item.label}</span>}
                  </button>
                );
              })}
            </div>

            {/* BOTTOM SECTION */}
            <div className="sidebar-bottom-section">
              <div style={{ position: 'relative' }}>
                <button 
                  className="sidebar-nav-item" 
                  onClick={() => setUserMenu(!userMenu)}
                  title={userProfile?.name}
                >
                  <div className="nav-item-icon" style={{ borderRadius: '50%', background: 'rgba(1,102,255,.15)', color: 'var(--primary)', fontWeight: 700 }}>
                    {userProfile?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  {isExpanded && <span className="nav-item-label">{userProfile?.name}</span>}
                  {!isExpanded && <span className="sidebar-tooltip">{userProfile?.name}</span>}
                </button>

                {userMenu && <UserMenuDropdown.Desktop isExpanded={isExpanded} userProfile={userProfile} onLogout={onLogout} onClose={() => setUserMenu(false)} />}
              </div>
            </div>
          </div>

          {/* MOBILE TOP BAR */}
          <header className="mobile-top-bar">
            <div className="mobile-brand" onClick={() => setView('nodes')}>
              <img src={theme === 'dark' ? './img/user-logo-white.png' : './img/user-logo-black.png'} alt="AIRTEK" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="mobile-action-btn" onClick={toggleTheme} title={theme === 'light' ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}>
                {theme === 'dark' ? <IconSun size={18} color="var(--amber)" /> : <IconMoon size={18} color="var(--primary)" />}
              </button>
              <div style={{ position: 'relative' }}>
                <button className="mobile-action-btn" onClick={() => setUserMenu(!userMenu)} title={userProfile?.name}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.78rem' }}>
                    {userProfile?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                </button>
                {userMenu && <UserMenuDropdown.Mobile userProfile={userProfile} onLogout={onLogout} onClose={() => setUserMenu(false)} />}
              </div>
            </div>
          </header>

          {/* MOBILE BOTTOM BAR */}
          <nav className="mobile-bottom-bar">
            {navItems.map(item => {
              const IconComp = item.icon;
              const isActive = view === item.key;
              return (
                <button 
                  key={item.key} 
                  className={`mobile-tab-item ${isActive ? 'active' : ''}`}
                  onClick={() => { setView(item.key); setUserMenu(false); }}
                >
                  <IconComp size={20} />
                  <span className="mobile-tab-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </React.Fragment>
      );
    }


export default Sidebar;
export { Sidebar };
