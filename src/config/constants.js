// Catálogos, tipos de equipos y constantes globales de Airtek Energía

export const EQ_TYPES = {
  INV: { label: 'Inversor', color: '#0166ff', bg: 'rgba(1, 102, 255,.12)' },
  ETP: { label: 'ETP / PSU Huawei', color: '#008000', bg: 'rgba(0, 128, 0,.12)' },
  ATS: { label: 'Transferencia Automática', color: '#0166ff', bg: 'rgba(1, 102, 255,.12)' },
  BKR: { label: 'Breaker Principal', color: '#6366f1', bg: 'rgba(99, 102, 241,.12)' },
  BAT: { label: 'Banco de Baterías', color: '#21c0fa', bg: 'rgba(33, 192, 250,.12)' },
  GEN: { label: 'Planta Eléctrica', color: '#eab308', bg: 'rgba(234,179,8,.12)' },
  OTR: { label: 'Otro', color: '#64748b', bg: 'rgba(100,116,139,.12)' },
};

// Orden canónico de tipos para mostrar equipos
export const EQ_ORDER = { INV: 0, ETP: 1, ATS: 2, BKR: 3, BAT: 4, GEN: 5, OTR: 6 };

// Voltaje nominal por tipo de batería (V)
export const BAT_VN = { LFP: 48, GEL: 48, AGM: 48, VRLA: 48, NMC: 52.5 };

// Valores por defecto para autonomía según tipo
export const BAT_DEFAULTS = {
  LFP: { DoD: 0.95, SoH: 1.0, ebanco: 0.98, eTemp: 1.0, ereg: 0.85, eIny: 0.85 },
  NMC: { DoD: 0.8, SoH: 0.45, ebanco: 0.95, eTemp: 1.0, ereg: 0.85, eIny: 0.85 },
  GEL: { DoD: 0.6, SoH: 0.25, ebanco: 0.95, eTemp: 1.0, ereg: 0.85, eIny: 0.85 },
  AGM: { DoD: 0.6, SoH: 0.25, ebanco: 0.95, eTemp: 1.0, ereg: 0.85, eIny: 0.85 },
  VRLA: { DoD: 0.6, SoH: 0.25, ebanco: 0.95, eTemp: 1.0, ereg: 0.85, eIny: 0.85 },
};

export const REC_TYPES = {
  inspeccion: { label: 'Inspección', color: '#008000', icon: '' },
  actualizacion_carga: { label: 'Actualización de Carga', color: '#21c0fa', icon: '' },
  surtido: { label: 'Surtido de Combustible', color: '#38bdf8', icon: '' },
  ajuste_combustible: { label: 'Ajuste / Calibración de Niveles', color: '#8b5cf6', icon: '' },
  inspeccion_gen: { label: 'Chequeo de Grupo Electrógeno', color: '#eab308', icon: '' },
  instalacion: { label: 'Instalación', color: '#0166ff', icon: '' },
  reemplazo: { label: 'Reemplazo / Retiro', color: '#0166ff', icon: '' },
  correctivo: { label: 'Mant. Correctivo', color: '#f55b5d', icon: '' },
};

export const NODE_TYPES = {
  fibra: { label: 'Nodo', color: '#008000' },
  datacenter: { label: 'Datacenter', color: '#0166ff' },
  headend: { label: 'Headend', color: '#21c0fa' },
  otro: { label: 'Otro', color: '#64748b' },
};

export const BAT_TYPES = ['LFP', 'GEL', 'AGM', 'VRLA', 'NMC', 'No aplica'];
export const BAT_CELL_TYPES = ['Prismática', 'Cilíndrica', 'Pouch', 'No aplica'];

// Nodos iniciales Airtek Zulia
export const SEED_NODES = [
  { name: 'Datacenter 18 de Octubre', zone: 'Maracaibo', type: 'datacenter' },
  { name: 'Datacenter El Callao', zone: 'El Callao', type: 'datacenter' },
  { name: 'Nodo Bella Vista', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo Lago Caribe', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo Las Tunas', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo Marite', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo Pomona', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo San Rafael', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo La Concepción', zone: 'La Concepción', type: 'fibra' },
  { name: 'Los Puertos De Altagracia', zone: 'Miranda', type: 'fibra' },
  { name: 'Nodo Cabimas', zone: 'Cabimas', type: 'fibra' },
  { name: 'Nodo Ciudad Ojeda', zone: 'Lagunillas', type: 'fibra' },
  { name: 'Nodo Bachaquero', zone: 'Valmore Rodríguez', type: 'fibra' },
  { name: 'Nodo Mene Grande', zone: 'Baralt', type: 'fibra' },
  { name: 'Nodo La Villa del Rosario – Celular Point', zone: 'Rosario de Perijá', type: 'fibra' },
  { name: 'Nodo Machiques', zone: 'Machiques', type: 'fibra' },
  { name: 'Headend Machiques', zone: 'Machiques', type: 'headend' },
  { name: 'Nodo San José', zone: 'San José', type: 'fibra' },
  { name: 'Nodo Barranquitas', zone: 'Maracaibo', type: 'fibra' },
  { name: 'Nodo La Cañada de Urdaneta', zone: 'Cañada de Urdaneta', type: 'fibra' },
  { name: 'Nodo San Rafael de El Mojan', zone: 'Mara', type: 'fibra' },
  { name: 'Nodo Santa Cruz de Mara', zone: 'Santa Cruz de Mara', type: 'fibra' },
  { name: 'Nodo Paraguaipoa', zone: 'Guajira', type: 'fibra' },
];

// Tabla de ampacidad por calibre AWG (A máx en cobre, 75°C)
export const AWG_AMPACITY = {
  '14 AWG': 15, '12 AWG': 20, '10 AWG': 30, '8 AWG': 50,
  '6 AWG': 65, '4 AWG': 85, '3 AWG': 100, '2 AWG': 115,
  '1 AWG': 130, '1/0 AWG': 150, '2/0 AWG': 175, '3/0 AWG': 200,
  '4/0 AWG': 230, '250 kcmil': 255, '300 kcmil': 285, '350 kcmil': 310,
  '400 kcmil': 335, '500 kcmil': 380, '600 kcmil': 420, '750 kcmil': 475,
};

export const AWG_OPTIONS = Object.keys(AWG_AMPACITY);

// EmailJS Credentials
export const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_5h5jm6b',
  TEMPLATE_ID: 'template_44sb0ou',
  PUBLIC_KEY: '8l66LkMpqKzhPJ4cq',
  ALERT_EMAIL: '',
};
