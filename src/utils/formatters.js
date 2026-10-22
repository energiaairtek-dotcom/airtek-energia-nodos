// Funciones utilitarias de formateo y sanitización

export const NODE_NAME_PREFIX_REGEX = /^(nodo|datacenter|data center|sede|oficina)\s*/i;

export const normalizeNodeName = (s) => (s || '').toLowerCase().replace(NODE_NAME_PREFIX_REGEX, '').trim();

export const formatHHMMSS = (hoursFloat) => {
  if (hoursFloat === null || hoursFloat === undefined || isNaN(hoursFloat)) return '00:00:00';
  const isNeg = hoursFloat < 0;
  const totalSecs = Math.round(Math.abs(hoursFloat) * 3600);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad2 = (n) => String(n).padStart(2, '0');
  return (isNeg ? '-' : '') + `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};

export const parseHours = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim();
  // Formato: 2h 30m o 2h30m
  const hmMatch = s.match(/^(\d+(?:\.\d+)?)\s*h(?:oras?)?(?:\s*(\d+(?:\.\d+)?)\s*m(?:in)?)?$/i);
  if (hmMatch) {
    const h = parseFloat(hmMatch[1]) || 0;
    const m = parseFloat(hmMatch[2] || 0) || 0;
    return h + (m / 60);
  }
  // Formato HH:MM:SS o HH:MM
  if (s.includes(':')) {
    const parts = s.split(':');
    const hrs = parseFloat(parts[0]) || 0;
    const mins = parts.length > 1 ? (parseFloat(parts[1]) || 0) : 0;
    const secs = parts.length > 2 ? (parseFloat(parts[2]) || 0) : 0;
    return hrs + (mins / 60) + (secs / 3600);
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export const sanitize = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;',
  };
  const reg = /[&<>"'/]/ig;
  return str.replace(reg, (match) => (map[match]));
};

export const fmtDateTime = d => {
  if (!d) return '—';
  const dt = d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
};

export const fmtDate = d => {
  if (!d) return '—';
  const dt = d.toDate ? d.toDate() : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('es-VE', { dateStyle: 'short' });
};

export const slugify = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Helper para formatear horómetros limpios (ej. 674:12 o 674h)
export const formatCleanHoro = (val) => {
  if (val === null || val === undefined || val === '') return '—';
  const s = String(val).trim();
  if (s === '—' || s === '-' || s === '' || s.toLowerCase() === 'none') return '—';
  if (s.includes(':')) {
    const parts = s.split(':');
    return `${parts[0]}:${String(parts[1] || '00').padStart(2, '0').slice(0, 2)}`;
  }
  const hmMatch = s.match(/^(\d+)\s*h(?:(?:oras?)?\s*(\d{1,2})\s*m(?:in)?)?$/i);
  if (hmMatch) {
    const h = hmMatch[1];
    const m = hmMatch[2] ? String(hmMatch[2]).padStart(2, '0') : '00';
    return `${h}:${m}`;
  }
  const num = parseFloat(s.replace(',', '.'));
  if (isNaN(num)) return s;
  const h = Math.floor(num);
  const m = Math.round((num - h) * 60);
  if (m === 60) return `${h + 1}:00`;
  return `${h}:${String(m).padStart(2, '0')}`;
};

// Helper para parsear cualquier formato de horómetro a número flotante de horas
export const parseHorometerToHours = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (s === '—' || s === '-' || s === '' || s.toLowerCase() === 'none') return null;
  const colonMatch = s.match(/^(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (colonMatch) {
    return parseInt(colonMatch[1]) + (parseInt(colonMatch[2]) / 60);
  }
  const hmMatch = s.match(/^(\d+)\s*h(?:(?:oras?)?\s*(\d{1,2})\s*m(?:in)?)?$/i);
  if (hmMatch) {
    return parseInt(hmMatch[1]) + (parseInt(hmMatch[2] || 0) / 60);
  }
  const num = parseFloat(s.replace(',', '.'));
  return isNaN(num) ? null : num;
};
