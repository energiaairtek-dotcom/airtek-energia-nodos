import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import './styles/global.css';

// Los módulos ahora se cargan por demanda: si un despliegue nuevo cambia los
// nombres de los chunks, una pestaña vieja fallaría al pedirlos. Se recarga una
// sola vez para recuperar la versión nueva.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'airtek_chunk_reload';
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
  } catch {}
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
