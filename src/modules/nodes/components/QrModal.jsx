import { useEffect, useRef } from 'react';
import { NODE_TYPES } from '@/config/constants';
import { loadQRCode } from '@/utils/exportLibs';

// Modal con el QR del nodo. La librería se carga solo al abrir el modal.
export function QRModal({ node, onClose }) {
  const ref = useRef(null);
  const url = `${window.location.href.split('?')[0]}?node=${node.id}`;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    let cancelled = false;
    (async () => {
      try {
        const qrModule = await loadQRCode();
        const QRCodeLib = qrModule.default || qrModule;
        if (cancelled || !ref.current) return;
        const canvas = document.createElement('canvas');
        ref.current.appendChild(canvas);
        QRCodeLib.toCanvas(canvas, url, { width: 200, margin: 2 }).catch(() => {});
      } catch (e) {
        console.warn('No se pudo generar el QR:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const print = () => {
    const w = window.open('', '_blank');
    const canvas = ref.current?.querySelector('canvas');
    const img = canvas ? canvas.toDataURL() : '';
    w.document.write(
      `<html><head><title>QR ${node.name}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h2{font-size:15px;margin:8px 0}p{font-size:11px;color:#666;margin:3px 0}</style></head><body><h2 style="color:#0166ff">AIRTEK ENERGÍA</h2><img src="${img}" style="width:200px;height:200px;border:2px solid #eee;border-radius:6px"><h2>${node.name}</h2><p>${node.zone || ''} — ${
        (NODE_TYPES[node.type] || {}).label || node.type
      }</p><p style="font-size:9px;color:#aaa;margin-top:12px;word-break:break-all">${url}</p><script>window.print();window.close();<\/script></body></html>`
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card fin" style={{ maxWidth: 300, width: '100%', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="fd" style={{ fontWeight: 700, color: '#0166ff', marginBottom: 3, fontSize: '1rem' }}>
          {node.name}
        </h3>
        <p style={{ color: '#475569', fontSize: '.75rem', marginBottom: 16 }}>{node.zone}</p>
        <div
          ref={ref}
          style={{ display: 'flex', justifyContent: 'center', background: 'white', padding: 14, borderRadius: 8, marginBottom: 14 }}
        />
        <p style={{ color: '#334155', fontSize: '.62rem', marginBottom: 16, wordBreak: 'break-all' }}>{url}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="bs" style={{ flex: 1, padding: '8px' }} onClick={print}>
            Imprimir
          </button>
          <button className="bs" style={{ flex: 1, padding: '8px' }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default QRModal;
