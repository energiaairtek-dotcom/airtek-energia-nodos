import { useState, useEffect } from 'react';
import { db, TS } from '@/services/firebase';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { sanitize } from '@/utils/formatters';

    function NodeDocs({ nodeId, userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [docs, setDocs] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const [form, setForm] = useState({ title: '', url: '', type: 'diagrama', notes: '' });
      const [saving, setSaving] = useState(false);
      const canManage = ['admin', 'supervisor', 'directivo', 'tecnico'].includes(userProfile?.role) || !!userProfile;

      useEffect(() => {
        const u = db.collection('energy_nodes').doc(nodeId).collection('node_docs')
          .orderBy('createdAt', 'desc')
          .onSnapshot(s => { setDocs(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        return u;
      }, [nodeId]);

      const save = async () => {
        if (!form.title.trim() || !form.url.trim()) { toast('Completa título y enlace.', 'error'); return; }
        let url = form.url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url.replace(/^[^\w]+/, '');
        }
        if (/^\s*javascript:/i.test(url)) {
          toast('Enlace no válido por motivos de seguridad.', 'error');
          return;
        }
        setSaving(true);
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('node_docs').add({
            title: sanitize(form.title.trim()),
            url: sanitize(url),
            type: sanitize(form.type),
            notes: sanitize(form.notes.trim()),
            author: sanitize(userProfile.name),
            createdAt: TS(),
          });
          toast('Documento guardado.', 'success');
          setForm({ title: '', url: '', type: 'diagrama', notes: '' });
          setShowForm(false);
        } catch { toast('Error al guardar.', 'error'); }
        setSaving(false);
      };

      const del = async id => {
        setConfirmModal({
          title: '¿Realmente deseas eliminar este documento?',
          type: 'danger',
          confirmText: 'Sí, estoy seguro',
          onConfirm: async () => {
            await db.collection('energy_nodes').doc(nodeId).collection('node_docs').doc(id).delete();
            setConfirmModal({
              title: 'Documento eliminado con éxito',
              type: 'success',
              confirmText: 'Aceptar',
              cancelText: false
            });
          }
        });
      };

      const DOC_TYPES = {
        diagrama: { label: 'Diagrama de conexión', color: '#0166ff', icon: '' },
        manual: { label: 'Manual técnico', color: '#008000', icon: '' },
        plano: { label: 'Plano eléctrico', color: '#0166ff', icon: '' },
        otro: { label: 'Otro documento', color: '#64748b', icon: '' },
      };

      // Agrupar por tipo
      const grupos = {};
      docs.forEach(d => { (grupos[d.type] = grupos[d.type] || []).push(d); });

      return (
        <div className="fin">
          {/* Encabezado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
            <div>
              <div className="fd" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tx1)' }}>Documentos del Nodo</div>
              <div style={{ color: 'var(--tx3)', fontSize: '.78rem', marginTop: 2 }}>
                Diagramas, manuales y planos — visible solo para usuarios registrados
              </div>
            </div>
            {canManage && (
              <button className="bp" style={{ fontSize: '.8rem', flexShrink: 0 }} onClick={() => setShowForm(v => !v)}>
                {showForm ? 'Cancelar' : '+ Agregar'}
              </button>
            )}
          </div>

          {/* Formulario */}
          {showForm && (
            <div className="card fin" style={{ marginBottom: 14, borderColor: 'rgba(1, 102, 255,.35)' }}>
              <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#0166ff', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>
                Nuevo Documento
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Título</label>
                  <input className="fi" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ej: Diagrama conexión inversor LFP00" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Enlace (Google Drive, OneDrive, URL directa…)</label>
                  <input className="fi" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                    placeholder="https://drive.google.com/file/d/..." />
                </div>
                <div>
                  <label className="lbl">Tipo</label>
                  <select className="fi" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    {Object.entries(DOC_TYPES).map(([k, v]) =>
                      <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Notas (opcional)</label>
                  <input className="fi" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Versión, fecha, referencia…" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <button className="bp" style={{ minWidth: 150 }} onClick={save} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {loading && <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 40 }}>Cargando…</div>}

          {!loading && docs.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', padding: 50 }}>
              
              <p style={{ color: 'var(--tx3)', marginBottom: 4 }}>No hay documentos registrados en este nodo.</p>
              {canManage && <p style={{ color: 'var(--tx4)', fontSize: '.8rem' }}>Admin y supervisores pueden agregar links de Drive, manuales y planos.</p>}
            </div>
          )}

          {/* Listado agrupado por tipo */}
          {Object.entries(grupos).map(([tipo, items]) => {
            const dt = DOC_TYPES[tipo] || DOC_TYPES.otro;
            return (
              <div key={tipo} style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: '.68rem', color: dt.color, textTransform: 'uppercase', letterSpacing: '.08em',
                  fontFamily: "'Outfit', 'Montserrat', sans-serif", marginBottom: 8
                }}>
                  {dt.icon} {dt.label}s ({items.length})
                </div>
                {items.map(doc => (
                  <div key={doc.id} className="card" style={{ marginBottom: 8, borderLeft: '3px solid ' + dt.color }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer"
                          style={{
                            color: dt.color, fontWeight: 700, fontSize: '.92rem', textDecoration: 'none',
                            fontFamily: "'Outfit', 'Montserrat', sans-serif", display: 'block', marginBottom: 3
                          }}>
                          {dt.icon} {doc.title} ↗
                        </a>
                        <div style={{
                          fontSize: '.72rem', color: 'var(--tx4)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {doc.url}
                        </div>
                        {doc.notes && <div style={{ fontSize: '.78rem', color: 'var(--tx3)', marginTop: 4 }}>{doc.notes}</div>}
                        <div style={{ fontSize: '.68rem', color: 'var(--tx4)', marginTop: 4 }}>
                          Agregado por {doc.author}
                        </div>
                      </div>
                      {canManage && (
                        <button onClick={() => del(doc.id)} className="bd"
                          style={{ padding: '4px 9px', fontSize: '.72rem', flexShrink: 0 }}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {confirmModal && (
            <ConfirmModal
              title={confirmModal.title}
              msg={confirmModal.msg}
              type={confirmModal.type}
              confirmText={confirmModal.confirmText}
              cancelText={confirmModal.cancelText}
              onConfirm={async () => {
                const fn = confirmModal.onConfirm;
                setConfirmModal(null);
                if (fn) await fn();
              }}
              onCancel={() => {
                const fn = confirmModal.onCancel;
                setConfirmModal(null);
                if (fn) fn();
              }}
            />
          )}
        </div>
      );
    }
export { NodeDocs };
export default NodeDocs;
