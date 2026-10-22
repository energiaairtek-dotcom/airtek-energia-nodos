import { useState } from 'react';
import { generateReportText } from '@/utils/reportText';
import { IconCheckCircle, IconCopy } from '@/components/icons';

function ReportModal({ data, onClose }) {
      const [text, setText] = useState(() => generateReportText(data));
      const [copied, setCopied] = useState(false);

      const copy = () => {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200); });
      };

      return (
        <div className="fin">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{ width: 36, height: 36, background: 'rgba(0, 128, 0,.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              <IconCheckCircle size={20} color="#008000" />
            </div>
            <div>
              <h2 className="fd" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--tx1)' }}>Reporte Generado</h2>
              <p style={{ color: 'var(--tx3)', fontSize: '.78rem' }}>Puedes editar el texto antes de copiarlo</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14, background: 'var(--bg-deep)', borderColor: 'rgba(0, 128, 0,.2)' }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ width: '100%', background: 'transparent', border: 'none', color: '#cbd5e1', fontFamily: "'JetBrains Mono',monospace", fontSize: '.82rem', lineHeight: 1.7, resize: 'vertical', outline: 'none', minHeight: 340 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="bg" style={{ flex: 1 }} onClick={copy}>
              <IconCopy size={16} /> {copied ? 'Copiado' : 'Copiar texto'}
            </button>
            <button className="bp" style={{ flex: 1 }} onClick={onClose}>
              Finalizar
            </button>
          </div>
          <p style={{ textAlign: 'center', color: 'var(--tx4)', fontSize: '.74rem', marginTop: 10 }}>
            Puedes editar el reporte antes de copiarlo para compartirlo por WhatsApp o correo.
          </p>
        </div>
      );
    }

export { ReportModal };
export default ReportModal;
