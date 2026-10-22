import { useState, useEffect } from 'react';
import { db, TS } from '@/services/firebase';
import { sendNotificationAlert } from '@/services/email';
import { sortEquipment } from '@/utils/energyCalculations';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
    function NodeEvents({ nodeId, nodeName, userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [events, setEvents] = useState([]);
      const [loading, setLoading] = useState(true);
      const [showForm, setShowForm] = useState(false);
      const [equipment, setEquipment] = useState([]);
      const [form, setForm] = useState(() => ({ date: new Date().toISOString().slice(0, 16), equipo: '', description: '', assistants: '', recordedBy: userProfile?.name || '', notify: false }));
      const [saving, setSaving] = useState(false);
      const canWrite = ['admin', 'supervisor', 'directivo', 'tecnico'].includes(userProfile?.role) || !!userProfile;

      useEffect(() => {
        const u1 = db.collection('energy_nodes').doc(nodeId).collection('node_events')
          .orderBy('date', 'desc').limit(25).onSnapshot(s => { setEvents(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        const u2 = db.collection('energy_nodes').doc(nodeId).collection('energy_equipment')
          .where('active', '==', true).onSnapshot(s => setEquipment(s.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { u1(); u2(); };
      }, [nodeId]);

      const save = async () => {
        if (!form.recordedBy.trim()) { toast('Escribe quién está anotando el evento.', 'error'); return; }
        if (!form.description.trim()) { toast('Escribe la descripción del evento.', 'error'); return; }
        setSaving(true);
        try {
          await db.collection('energy_nodes').doc(nodeId).collection('node_events').add({
            date: new Date(form.date),
            equipo: form.equipo || null,
            description: form.description.trim(),
            assistants: form.assistants.trim() || null,
            author: form.recordedBy.trim(),
            authorId: userProfile.uid,
            createdAt: TS(),
          });
          if (form.notify) {
            sendNotificationAlert({
              nodo: nodeName,
              tecnico: form.recordedBy.trim(),
              fecha: new Date(form.date).toLocaleDateString('es-VE'),
              alarmas: `EVENTO: ${form.equipo ? '[' + form.equipo + '] ' : ''}${form.description}\nPersonal Asistente: ${form.assistants || 'Solo autor'}`,
              observaciones: `Evento anotado manualmente por (${userProfile.name}).`,
            });
          }
          toast('Evento registrado.', 'success');
          setForm({ date: new Date().toISOString().slice(0, 16), equipo: '', description: '', assistants: '', recordedBy: '', notify: false });
          setShowForm(false);
        } catch (e) { console.error(e); toast('Error al guardar.', 'error'); }
        setSaving(false);
      };

      return (
        <div>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div className="fd" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--tx1)' }}>Historial de Eventos</div>
              <div style={{ color: 'var(--tx3)', fontSize: '.78rem' }}>Eventualidades registradas por el personal de monitoreo</div>
            </div>
            {canWrite && <button className="bp" style={{ fontSize: '.82rem' }} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancelar' : '+ Nuevo Evento'}
            </button>}
          </div>

          {/* Formulario */}
          {showForm && (
            <div className="card fin" style={{ marginBottom: 14, borderColor: 'rgba(1, 102, 255,.3)' }}>
              <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#0166ff', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>Registrar Evento</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Fecha y Hora del Evento</label>
                  <input className="fi" type="datetime-local" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Nombre de quien Anotó (Obligatorio)</label>
                  <input className="fi" value={form.recordedBy} onChange={e => setForm({ ...form, recordedBy: e.target.value })}
                    placeholder="Escribe el nombre del personal de monitoreo que anota..." />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Equipo Afectado <span style={{ color: 'var(--tx4)', fontWeight: 400, textTransform: 'none' }}>(opcional)</span></label>
                  <select className="fi" value={form.equipo} onChange={e => setForm({ ...form, equipo: e.target.value })}>
                    <option value="">— Sin equipo específico —</option>
                    {sortEquipment(equipment).map(eq => (
                      <option key={eq.id} value={eq.tag}>{eq.tag} ({eq.type})</option>
                    ))}
                    <option value="PLANTA">Planta Eléctrica</option>
                    <option value="ATS">ATS</option>
                    <option value="RED_PUBLICA">Red Pública</option>
                    <option value="GENERAL">General / Nodo Completo</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Descripción del Evento</label>
                  <textarea className="fi" rows={3} value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe qué ocurrió, a qué hora, condiciones observadas, acciones tomadas..."
                    style={{ resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Personal que asistió (Opcional)</label>
                  <input className="fi" value={form.assistants} onChange={e => setForm({ ...form, assistants: e.target.value })}
                    placeholder="Nombres del personal que atendió el evento..." />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="evnotif" checked={form.notify} onChange={e => setForm({ ...form, notify: e.target.checked })} />
                  <label htmlFor="evnotif" style={{ color: 'var(--tx2)', fontSize: '.85rem', cursor: 'pointer' }}>Notificar por correo</label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                <button className="bp" style={{ minWidth: 170 }} onClick={save} disabled={saving}>
                  {saving ? 'Guardando...' : 'Registrar Evento'}
                </button>
              </div>
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: 30, color: 'var(--tx3)' }}>Cargando eventos...</div>}
          {!loading && events.length === 0 && !showForm && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--tx3)' }}>No hay eventos registrados en este nodo.</p>
            </div>
          )}

          {events.map(ev => {
            const d = ev.date?.toDate ? ev.date.toDate() : new Date(ev.date);
            return (
              <div key={ev.id} className="card" style={{ marginBottom: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="fm" style={{ fontSize: '.8rem', color: '#0166ff', fontWeight: 700 }}>
                      {d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })} {d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {ev.equipo && <span className="badge" style={{ background: 'rgba(1, 102, 255,.12)', color: '#0166ff' }}>{ev.equipo}</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--tx1)', fontSize: '.76rem', fontWeight: 600 }}>Anotó: <b>{ev.author}</b></div>
                    {ev.assistants && <div style={{ color: 'var(--tx2)', fontSize: '.72rem', fontWeight: 500 }}>Asistió: {ev.assistants}</div>}
                  </div>
                </div>
                <p style={{ color: 'var(--tx1)', fontSize: '.88rem', lineHeight: 1.6, fontWeight: 500 }}>{ev.description}</p>
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

export { NodeEvents };
export default NodeEvents;
