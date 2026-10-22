import { IconAlertTriangle, IconCheckCircle } from '@/components/icons';

// Catálogo de prioridades para las alertas/comentarios de un nodo.
export const ALERT_PRIORITIES = {
  critica: {
    label: 'Crítica',
    color: '#f55b5d',
    bg: 'rgba(245, 91, 93,.12)',
    icon: <IconAlertTriangle size={15} color="#f55b5d" />,
  },
  alta: {
    label: 'Alta',
    color: '#0166ff',
    bg: 'rgba(1, 102, 255,.12)',
    icon: <IconAlertTriangle size={15} color="#0166ff" />,
  },
  media: {
    label: 'Media',
    color: '#0166ff',
    bg: 'rgba(1, 102, 255,.12)',
    icon: <IconAlertTriangle size={15} color="#0166ff" />,
  },
  info: {
    label: 'Info',
    color: '#008000',
    bg: 'rgba(0, 128, 0,.12)',
    icon: <IconCheckCircle size={15} color="#008000" />,
  },
};

export default ALERT_PRIORITIES;
