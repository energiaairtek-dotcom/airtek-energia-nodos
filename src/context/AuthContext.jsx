import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, TS } from '../services/firebase';

const AuthContext = createContext(null);

// Perfil guardado en el último inicio de sesión. Permite pintar la app al instante
// mientras Firebase confirma la sesión en segundo plano (solo afecta a la UI,
// los permisos reales siguen validándose en las reglas de Firestore).
const readCachedProfile = () => {
  try {
    const raw = localStorage.getItem('energia_user_profile');
    if (!raw) return null;
    const profile = JSON.parse(raw);
    return profile && profile.uid ? profile : null;
  } catch {
    return null;
  }
};

export const verifyAdminRole = async (profile) => {
  const isDesignated = (p) => {
    if (!p) return false;
    const r = (p.role || '').toLowerCase();
    const em = (p.email || '').toLowerCase();
    const nm = (p.name || p.nombre || '').toLowerCase();
    return (
      ['admin', 'supervisor', 'directivo'].includes(r) ||
      em.includes('robert') ||
      em.includes('ruidiaz') ||
      em.includes('diego.campos') ||
      nm.includes('robert') ||
      nm.includes('ruidiaz')
    );
  };

  if (isDesignated(profile)) return true;

  try {
    const stored = JSON.parse(localStorage.getItem('energia_user_profile') || '{}');
    if (isDesignated(stored)) return true;
  } catch {}

  if (typeof auth !== 'undefined' && auth?.currentUser) {
    try {
      const em = (auth.currentUser.email || '').toLowerCase();
      if (em.includes('robert') || em.includes('ruidiaz') || em.includes('diego.campos')) return true;
      let snap = await db.collection('airtek_users').doc(auth.currentUser.uid).get();
      if (!snap.exists) snap = await db.collection('energy_users').doc(auth.currentUser.uid).get();
      if (snap.exists) {
        const data = snap.data();
        const r = ((data.apps && data.apps.nodos) || data.role || 'tecnico').toLowerCase();
        return ['admin', 'supervisor', 'directivo'].includes(r) || isDesignated(data);
      }
    } catch {}
  }
  return false;
};

export function AuthProvider({ children }) {
  const bootStart = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const [authState, setAuthState] = useState('loading');
  const [userProfile, setUserProfile] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);

  // Si Firebase no responde, no dejar la pantalla de carga para siempre.
  useEffect(() => {
    if (authState !== 'loading') return;
    const timer = setTimeout(() => {
      setAuthState((prev) => (prev === 'loading' ? 'timeout' : prev));
    }, 12000);
    return () => clearTimeout(timer);
  }, [authState]);

  useEffect(() => {
    if (!auth) {
      setAuthState('error');
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setAuthState('unauthenticated');
        setUserProfile(null);
        try {
          localStorage.removeItem('energia_user_profile');
        } catch {}
        return;
      }

      // Pintar la app de inmediato con el perfil del último inicio de sesión del
      // MISMO usuario, sin esperar la lectura de Firestore (se revalida enseguida).
      const cached = readCachedProfile();
      if (cached && cached.uid === user.uid) {
        setUserProfile(cached);
        setAuthState(cached.approved ? 'authenticated' : 'pending');
        if (import.meta.env && import.meta.env.DEV) {
          console.debug(`[auth] pintado desde caché en ${Math.round(performance.now() - bootStart.current)} ms`);
        }
      }

      try {
        let snap = await db.collection('airtek_users').doc(user.uid).get();
        if (!snap.exists) snap = await db.collection('energy_users').doc(user.uid).get();

        if (!snap.exists) {
          const emailLower = (user.email || '').toLowerCase();
          const isSuper =
            emailLower.includes('robert') || emailLower.includes('ruidiaz') || emailLower.includes('diego.campos');
          const defaultProfile = {
            name: user.displayName || user.email.split('@')[0],
            email: user.email.toLowerCase(),
            role: isSuper ? 'admin' : 'tecnico',
            approved: isSuper ? true : false,
            createdAt: TS(),
          };
          await db.collection('airtek_users').doc(user.uid).set({
            ...defaultProfile,
            apps: { nodos: isSuper ? 'admin' : 'tecnico', pm: null, almacen: null },
          });
          await db.collection('energy_users').doc(user.uid).set(defaultProfile);
          setUserProfile({ uid: user.uid, ...defaultProfile });
          try {
            localStorage.setItem('energia_user_profile', JSON.stringify({ uid: user.uid, ...defaultProfile }));
          } catch {}
          setAuthState(isSuper ? 'authenticated' : 'pending');
          return;
        }

        const data = snap.data();
        const emailLower = (user.email || '').toLowerCase();
        const nameFromDoc = data.name || data.nombre || user.displayName || '';
        const isRobertOrSuperAdmin =
          emailLower.includes('robert') ||
          emailLower.includes('ruidiaz') ||
          emailLower.includes('diego.campos') ||
          nameFromDoc.toLowerCase().includes('robert') ||
          nameFromDoc.toLowerCase().includes('ruidiaz');

        let role = isRobertOrSuperAdmin ? 'admin' : (data.apps && data.apps.nodos) || data.role || 'tecnico';
        let name =
          isRobertOrSuperAdmin && emailLower.includes('robert') && (!nameFromDoc || nameFromDoc.includes('@'))
            ? 'Robert Ruidiaz'
            : nameFromDoc || user.email.split('@')[0];
        const approved = isRobertOrSuperAdmin ? true : data.approved !== false;

        if (
          isRobertOrSuperAdmin &&
          (data.role !== 'admin' || !data.apps || data.apps.nodos !== 'admin' || data.approved === false)
        ) {
          try {
            await db
              .collection('airtek_users')
              .doc(user.uid)
              .set(
                {
                  name: name,
                  email: user.email.toLowerCase(),
                  role: 'admin',
                  approved: true,
                  apps: { ...(data.apps || {}), nodos: 'admin' },
                },
                { merge: true }
              );
            await db
              .collection('energy_users')
              .doc(user.uid)
              .set(
                {
                  name: name,
                  email: user.email.toLowerCase(),
                  role: 'admin',
                  approved: true,
                },
                { merge: true }
              );
          } catch (syncErr) {
            console.warn('Auto-grant admin sync:', syncErr);
          }
        }

        const p = { uid: user.uid, name, email: user.email, role, approved };
        setUserProfile(p);
        try {
          localStorage.setItem('energia_user_profile', JSON.stringify(p));
        } catch {}
        setAuthState(approved ? 'authenticated' : 'pending');
        if (import.meta.env && import.meta.env.DEV) {
          console.debug(`[auth] sesión confirmada en ${Math.round(performance.now() - bootStart.current)} ms`);
        }
      } catch (e) {
        console.warn('Auth state load fallback:', e);
        const p = { uid: user.uid, name: user.email.split('@')[0], email: user.email, role: 'tecnico', approved: true };
        setUserProfile(p);
        try {
          localStorage.setItem('energia_user_profile', JSON.stringify(p));
        } catch (err) {}
        setAuthState('authenticated');
      }
    });

    return () => unsubscribe();
  }, []);

  const login = (email, password) => {
    return auth.signInWithEmailAndPassword(email, password);
  };

  const logout = () => {
    try {
      localStorage.removeItem('energia_user_profile');
    } catch {}
    return auth.signOut();
  };

  const register = async (email, password, name, phone) => {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const user = cred.user;
    const emailLower = email.toLowerCase();
    const isSuper =
      emailLower.includes('robert') || emailLower.includes('ruidiaz') || emailLower.includes('diego.campos');
    const profile = {
      name: name.trim() || user.email.split('@')[0],
      email: emailLower,
      phone: phone ? phone.trim() : '',
      role: isSuper ? 'admin' : 'tecnico',
      approved: isSuper ? true : false,
      createdAt: TS(),
    };
    await db.collection('airtek_users').doc(user.uid).set({
      ...profile,
      apps: { nodos: isSuper ? 'admin' : 'tecnico', pm: null, almacen: null },
    });
    await db.collection('energy_users').doc(user.uid).set(profile);
    setUserProfile({ uid: user.uid, ...profile });
    setAuthState(isSuper ? 'authenticated' : 'pending');
    return user;
  };

  const role = (userProfile?.role || 'tecnico').toLowerCase();
  const isAdmin = role === 'admin';
  const isSupervisor = role === 'supervisor' || isAdmin;
  const isDirectivo = role === 'directivo';
  const canEdit = userProfile?.approved && (isAdmin || isSupervisor || role === 'tecnico');
  const canAdmin = isAdmin;

  return (
    <AuthContext.Provider
      value={{
        authState,
        userProfile,
        firebaseUser,
        role,
        isAdmin,
        isSupervisor,
        isDirectivo,
        canEdit,
        canAdmin,
        login,
        logout,
        register,
        setUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
