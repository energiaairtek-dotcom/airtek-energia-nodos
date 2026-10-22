import { useState, useEffect, useMemo } from 'react';
import { db, TS } from '../services/firebase';

export const DEFAULT_AUTHORIZED_STAFF = [
  'Cuadrilla Grupos Electrógenos',
  'Diego Campos',
  'Alvaro Telles',
  'Alvaro Barrios',
  'Julio Rios',
  'Johan Frascarella',
  'Robert Ruidiaz',
  'Victor Bernal',
  'Raul Hidalgo',
  'Kelvis Osorio',
  'Mario Martinez',
  'Gustavo Rincon',
  'Osman Leal',
  'Alexis Viera',
  'Jean Chirinos',
  'Jean Sanchez',
  'Roberto Rodriguez',
  'Janeth Romero',
];

export function useAuthorizedStaff(userProfile) {
  const [staff, setStaff] = useState(() => {
    try {
      const saved = localStorage.getItem('airtek_authorized_staff_v2');
      if (saved) return JSON.parse(saved);
      const old = localStorage.getItem('airtek_authorized_staff');
      if (old && !old.includes('Ángel Briceño') && !old.includes('Franklin Rincón')) {
        return JSON.parse(old);
      }
    } catch (e) {}
    return DEFAULT_AUTHORIZED_STAFF;
  });

  useEffect(() => {
    if (!db) return;
    const unsub = db
      .collection('energy_config')
      .doc('personal')
      .onSnapshot(
        (snap) => {
          if (snap.exists) {
            const list = snap.data().list;
            if (
              Array.isArray(list) &&
              list.length > 0 &&
              !list.includes('Ángel Briceño') &&
              !list.includes('Franklin Rincón')
            ) {
              setStaff(list);
              try {
                localStorage.setItem('airtek_authorized_staff_v2', JSON.stringify(list));
              } catch (e) {}
            } else if (Array.isArray(list) && (list.includes('Ángel Briceño') || list.includes('Franklin Rincón'))) {
              db.collection('energy_config')
                .doc('personal')
                .set(
                  {
                    list: DEFAULT_AUTHORIZED_STAFF,
                    updatedAt: TS(),
                  },
                  { merge: true }
                )
                .catch(console.error);
            }
          }
        },
        (err) => console.warn('Staff config listener:', err)
      );
    return () => unsub();
  }, []);

  return useMemo(() => {
    const list = [...staff];
    if (userProfile?.name && !list.includes(userProfile.name)) {
      list.push(userProfile.name);
    }
    return list;
  }, [staff, userProfile?.name]);
}

export default useAuthorizedStaff;
