import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const getEnv = (key, defaultVal) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
    return defaultVal;
  } catch {
    return defaultVal;
  }
};

export const FIREBASE_CONFIG = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyDwaK4Z26RfqDwNvwdMqri08oEjwG9qymc"),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "almacen-airtek.firebaseapp.com"),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "almacen-airtek"),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "almacen-airtek.firebasestorage.app"),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "934058211778"),
  appId: getEnv('VITE_FIREBASE_APP_ID', "1:934058211778:web:6cc9d820c41fa90aa5fe5b")
};

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

export const db = firebase.firestore();
try {
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition' || err.code === 'unimplemented') {
      console.warn('Firestore persistence not enabled:', err.code);
    }
  });
} catch {
  // Persistence already enabled or unsupported
}

export const auth = firebase.auth();
export const TS = () => firebase.firestore.FieldValue.serverTimestamp();
export const FieldValue = firebase.firestore.FieldValue;

if (typeof window !== 'undefined') {
  window.firebase = firebase;
}

export { firebase };
export default firebase;
