import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../config/constants';

export const sendNotificationAlert = async (params) => {
  if (!EMAILJS_CONFIG.SERVICE_ID || EMAILJS_CONFIG.SERVICE_ID === 'TU_SERVICE_ID') {
    console.warn('[EmailJS] Servicio no configurado.');
    return;
  }
  try {
    console.log('[EmailJS] Enviando alerta por EmailJS:', params);
    await emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      {
        nodo_nombre: params.nodo || '',
        tecnico_nombre: params.tecnico || 'Técnico',
        fecha: params.fecha || new Date().toLocaleString('es-VE'),
        tipo_alarma: params.alarmas || 'Alerta técnica de energía',
        observaciones: params.observaciones || 'Sin observaciones adicionales.',
        link_nodo: typeof window !== 'undefined' ? window.location.href : '',
      },
      EMAILJS_CONFIG.PUBLIC_KEY
    );
    console.log('[EmailJS] Alerta de correo enviada exitosamente.');
  } catch (e) {
    console.warn('[EmailJS Error]:', e);
  }
};
