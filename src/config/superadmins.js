// Cuentas con acceso total de emergencia.
// Deben coincidir exactamente con los UID de firestore.rules (isSuperAdminAuth).
// Solo afectan a la interfaz: los permisos reales los aplica Firestore.
export const SUPERADMIN_UIDS = [
  'XbE3jS3GvXX4eFNEKC0JhSzyDPj1', // diego.campos@airtek.com.ve
  'r11AHCeJigOS00iaJA750zlVp3w1', // robert.ruidiaz@airtek.com.ve
];

export const isSuperAdminUid = (uid) => !!uid && SUPERADMIN_UIDS.includes(uid);
