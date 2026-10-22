import { useState, useEffect } from 'react';
import { db, TS } from '@/services/firebase';
import { sendNotificationAlert } from '@/services/email';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { ALERT_PRIORITIES } from '@/modules/nodes/components/alertPriorities';

    function NodeAlerts({ nodeId, nodeName, userProfile, toast }) {
      const [alerts, setAlerts] = useState([]);

      const formatAlertDate = (dt) => {
        if (!dt) return new Date().toLocaleDateString('es-VE');
        try {
          if (dt.toDate && typeof dt.toDate === 'function') {
            return dt.toDate().toLocaleDateString('es-VE');
          }
          if (dt instanceof Date) {
            return dt.toLocaleDateString('es-VE');
          }
          if (typeof dt === 'number' || typeof dt === 'string') {
            const d = new Date(dt);
            if (!isNaN(d.getTime())) return d.toLocaleDateString('es-VE');
          }
        } catch (e) {}
        return new Date().toLocaleDateString('es-VE');
      };
      const [confirmModal, setConfirmModal] = useState(null);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const [form, setForm] = useState({ title: '', body: '', priority: 'alta', notify: true });
      const [saving, setSaving] = useState(false);
      const canWrite = ['tecnico', 'admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) ||
        (userProfile?.email || '').toLowerCase().includes('robert') ||
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') ||
        (userProfile?.name || '').toLowerCase().includes('robert');

      useEffect(() => {
        const u = db.collection('energy_nodes').doc(nodeId).collection('node_alerts')
          .orderBy('createdAt', 'desc').limit(30)
          .onSnapshot(s => {
            setAlerts(s.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
          });
        return u;
      }, [nodeId]);

      const sendEmail = async (alertData) => {
        try {
          await sendNotificationAlert({
            nodo: nodeName,
            tecnico: userProfile?.name || 'Técnico Inspector',
            fecha: new Date().toLocaleString('es-VE'),
            alarmas: alertData.title,
            observaciones: alertData.body,
          });
        } catch (err) {
          console.error('[sendEmail NodeAlerts Error]', err);
        }
      };

      const save = async () => {
        if (!form.title.trim() || !form.body.trim()) { toast('Completa título y descripción.', 'error'); return; }
        
        const tempId = 'temp_' + Date.now();
        const alertData = {
          id: tempId,
          title: form.title.trim(),
          body: form.body.trim(),
          priority: form.priority,
          status: 'activa',
          author: userProfile?.name || 'Técnico Inspector',
          authorId: userProfile?.uid || '',
          createdAt: { toDate: () => new Date() },
        };

        // 1. Registro optimista e instantáneo en la UI (0ms delay)
        setAlerts(prev => [alertData, ...prev]);
        toast('Alerta registrada' + (form.notify ? ' y notificada por correo.' : '.'), 'success');
        
        const formToNotify = { ...form };
        setForm({ title: '', body: '', priority: 'alta', notify: true });
        setShowForm(false);

        // 2. Guardado en Firestore y envío de correo en segundo plano
        try {
          const docRef = await db.collection('energy_nodes').doc(nodeId).collection('node_alerts').add({
            title: alertData.title,
            body: alertData.body,
            priority: alertData.priority,
            status: 'activa',
            author: alertData.author,
            authorId: alertData.authorId,
            createdAt: TS(),
          });
          setAlerts(prev => prev.map(x => x.id === tempId ? { ...x, id: docRef.id } : x));
        } catch (e) { console.error('[Save Alert Error]', e); }

        if (formToNotify.notify) {
          sendEmail(formToNotify).catch(e => console.error('[Email Alert Error]', e));
        }
      };

      const resolve = async (id) => {
        // Actualización optimista instantánea (0ms delay)
        setAlerts(prev => prev.map(x => x.id === id ? {
          ...x,
          status: 'resuelta',
          resolvedBy: userProfile?.name || 'Airtek Energía',
          resolvedAt: { toDate: () => new Date() }
        } : x));
        toast('Alerta marcada como resuelta.', 'success');
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('node_alerts').doc(id)
            .update({ status: 'resuelta', resolvedAt: TS(), resolvedBy: userProfile.name });
        } catch (e) { console.error('[resolve error]', e); }
      };

      const deleteAlert = async (alertId, title, isResolved = false) => {
        // Eliminación optimista instantánea de la UI (0ms delay sin recargar pestaña)
        setAlerts(prev => prev.filter(x => x.id !== alertId));
        toast(isResolved ? 'Alerta resuelta eliminada.' : 'Alerta eliminada.', 'success');
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('node_alerts').doc(alertId).delete();
        } catch (e) { console.error('[delete alert error]', e); }
      };

      const hasAdminAccess = ['admin', 'supervisor', 'directivo'].includes((userProfile?.role || '').toLowerCase()) ||
        (userProfile?.email || '').toLowerCase().includes('robert') ||
        (userProfile?.email || '').toLowerCase().includes('ruidiaz') ||
        (userProfile?.name || '').toLowerCase().includes('robert') ||
        (userProfile?.name || '').toLowerCase().includes('ruidiaz');
      const activas = alerts.filter(a => a.status !== 'resuelta');
      const resueltas = alerts.filter(a => a.status === 'resuelta');

      return (
        <div className="fin">
          <>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="fd" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tx1)' }}>
                  Alertas del Nodo
                  {activas.length > 0 && <span style={{ marginLeft: 8, background: '#f55b5d', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700 }}>{activas.length}</span>}
                </div>
                <div style={{ color: 'var(--tx3)', fontSize: '.78rem' }}>Comentarios importantes y condiciones a vigilar</div>
              </div>
              {canWrite && <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Cancelar' : '+ Nueva Alerta'}
              </button>}
            </div>

            {/* Formulario nueva alerta */}
            {showForm && (
              <div className="card fin" style={{ marginBottom: 16, borderColor: 'rgba(1, 102, 255,.3)' }}>
                <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Nueva Alerta</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="lbl">Título</label>
                    <input className="fi" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder="Ej: Banco LFP02 con temperatura elevada" />
                  </div>
                  <div>
                    <label className="lbl">Prioridad</label>
                    <select className="fi" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                      {Object.entries(ALERT_PRIORITIES).map(([k, v]) => (
                        <option key={k} value={k}>{v.icon} {v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                    <input type="checkbox" id="notif" checked={form.notify} onChange={e => setForm({ ...form, notify: e.target.checked })} />
                    <label htmlFor="notif" style={{ color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>
                      Notificar por correo
                    </label>
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="lbl">Descripción</label>
                    <textarea className="fi" rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })}
                      placeholder="Describe la situación, qué se observó y qué se recomienda..." style={{ resize: 'vertical' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <button className="bp" style={{ minWidth: 170 }} onClick={save} disabled={saving}>
                    {saving ? 'Guardando...' : 'Registrar Alerta'}
                  </button>
                </div>
              </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>Cargando alertas...</div>}

            {/* Alertas activas */}
            {!loading && activas.length === 0 && !showForm && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                
                <p style={{ color: 'var(--tx3)' }}>No hay alertas activas en este nodo.</p>
              </div>
            )}

            {activas.map(a => {
              const p = ALERT_PRIORITIES[a.priority] || ALERT_PRIORITIES.info;
              return (
                <div key={a.id} className="card" style={{ marginBottom: 10, border: '1px solid var(--border)', background: p.bg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      
                      <span className="fd" style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--tx1)' }}>{a.title}</span>
                      <span className="badge" style={{ background: p.bg, color: p.color, border: `1px solid ${p.color}44` }}>{p.label}</span>
                    </div>
                    {canWrite && <button className="bg" style={{ padding: '4px 12px', fontSize: '.74rem', flexShrink: 0 }} onClick={() => resolve(a.id)}>
                      Resolver
                    </button>}
                    {hasAdminAccess && (
                      <button onClick={() => {
                        setConfirmModal({
                          title: `¿Eliminar alerta "${a.title}"?`,
                          msg: 'Esta acción eliminará la alerta permanentemente del sistema.',
                          type: 'danger',
                          confirmText: 'Sí, Eliminar',
                          onConfirm: () => deleteAlert(a.id, a.title, false)
                        });
                      }} className="bd" style={{ padding: '4px 10px', fontSize: '.74rem', marginLeft: 6, flexShrink: 0, outline: 'none', border: '1px solid rgba(245,91,93,0.3)' }}>Eliminar</button>
                    )}
                  </div>
                  <p style={{ color: 'var(--tx2)', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 8, fontWeight: 500 }}>{a.body}</p>
                  <div style={{ fontSize: '.76rem', color: 'var(--tx2)', opacity: 0.85, fontWeight: 500 }}>
                    Por {a.author || 'Técnico Inspector'} · {formatAlertDate(a.createdAt)}
                  </div>
                </div>
              );
            })}

            {/* Alertas resueltas */}
            {resueltas.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: '.7rem', color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: "'Outfit', 'Montserrat', sans-serif", marginBottom: 8 }}>
                  Resueltas ({resueltas.length})
                </div>
                {resueltas.map(a => {
                  const p = ALERT_PRIORITIES[a.priority] || ALERT_PRIORITIES.info;
                  return (
                    <div key={a.id} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, opacity: .75, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: 'var(--tx2)', fontSize: '.88rem', fontWeight: 600, textDecoration: 'line-through' }}>{a.title}</span>
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--tx4)', marginTop: 3 }}>
                          Resuelto por {a.resolvedBy || '—'} · {a.resolvedAt?.toDate ? a.resolvedAt.toDate().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        </div>
                      </div>
                      {hasAdminAccess && (
                        <button 
                          onClick={() => {
                            setConfirmModal({
                              title: `¿Eliminar alerta "${a.title}"?`,
                              msg: 'Esta acción eliminará la alerta resuelta permanentemente del sistema.',
                              type: 'danger',
                              confirmText: 'Sí, Eliminar',
                              onConfirm: () => deleteAlert(a.id, a.title, true)
                            });
                          }} 
                          className="bd" 
                          style={{ padding: '4px 10px', fontSize: '.74rem', flexShrink: 0, outline: 'none', border: '1px solid rgba(245,91,93,0.3)' }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>

          {confirmModal && (
            <ConfirmModal
              title={confirmModal.title}
              msg={confirmModal.msg}
              type={confirmModal.type || 'danger'}
              confirmText={confirmModal.confirmText}
              cancelText={confirmModal.cancelText !== undefined ? confirmModal.cancelText : 'Cancelar'}
              onConfirm={async () => {
                if (confirmModal.onConfirm) await confirmModal.onConfirm();
                setConfirmModal(null);
              }}
              onCancel={() => setConfirmModal(null)}
            />
          )}
        </div>
      );
    }
export { NodeAlerts };
export default NodeAlerts;
