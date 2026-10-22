import { useState, useEffect } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { db, TS } from '@/services/firebase';
import { AddExistingUser } from '@/modules/admin/components/AddExistingUser';
import { UID_AddForm } from '@/modules/admin/components/UID_AddForm';
import { PlantasExcelSync } from '@/modules/admin/components/PlantasExcelSync';
import { AuthorizedPersonnelAdmin } from '@/modules/admin/components/AuthorizedPersonnelAdmin';
import { verifyAdminRole } from '@/context/AuthContext';
import { SEED_NODES, NODE_TYPES, EQ_TYPES, BAT_TYPES } from '@/config/constants';
import { DEFAULT_AUTHORIZED_STAFF } from '@/hooks/useAuthorizedStaff';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { sanitize, slugify, formatHHMMSS, parseHours } from '@/utils/formatters';


                // ═══════════════════════════════════════════════════
    //  GESTIÓN DE PERSONAL AUTORIZADO
    // ═══════════════════════════════════════════════════
    //  PANEL DE ADMINISTRACIÓN
    // ═══════════════════════════════════════════════════
    function AdminPanel({ userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [tab, setTab] = useState('nodos');
      const [users, setUsers] = useState([]);
      const [nodes, setNodes] = useState([]);
      const [ldU, setLdU] = useState(true);
      const [ldN, setLdN] = useState(true);
      const [newNode, setNN] = useState({ name: '', zone: '', type: 'fibra', estado: 'Zulia' });
      const [editNodeId, setEditNodeId] = useState(null);
      const [editNodeData, setEditNodeData] = useState({});
      const [seeding, setSeeding] = useState(false);
      const [selNodeId, setSelNodeId] = useState('');
      const [bulkText, setBulkText] = useState('');
      const [bulkParsed, setBulkParsed] = useState([]);
      const [bulkLoading, setBulkLoading] = useState(false);

      const [userLoadError, setUserLoadError] = useState('');

      // Función para cargar/refrescar usuarios combinando ambas colecciones
      const loadUsers = () => {
        setLdU(true);
        setUserLoadError('');
        Promise.allSettled([
          db.collection('airtek_users').get(),
          db.collection('energy_users').get()
        ]).then(([unifiedResult, legacyResult]) => {
          const map = new Map();
          let anySuccess = false;
          if (unifiedResult.status === 'fulfilled') {
            anySuccess = true;
            unifiedResult.value.docs.forEach(d => map.set(d.id, {
              id: d.id, ...d.data(),
              role: (d.data().apps && d.data().apps.nodos) || d.data().role || 'tecnico',
              name: d.data().name || d.data().nombre || ''
            }));
          } else { console.warn('airtek_users no accesible:', unifiedResult.reason?.code); }
          if (legacyResult.status === 'fulfilled') {
            anySuccess = true;
            legacyResult.value.docs.forEach(d => { if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() }); });
          } else { console.error('energy_users error:', legacyResult.reason); }
          if (!anySuccess) setUserLoadError('No se pudieron cargar los usuarios. Verifica los permisos de Firestore.');
          setUsers([...map.values()]);
          setLdU(false);
        });
      };

      useEffect(() => {
        loadUsers();
        // Listener en tiempo real para energy_users (legacy) — detecta nuevos registros
        const u1 = db.collection('energy_users').onSnapshot(snap => {
          // Refrescar cuando cambie energy_users
          loadUsers();
        }, err => console.warn('energy_users listener error:', err.code));
        const n = db.collection('energy_nodes').onSnapshot(s => { setNodes(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLdN(false); });
        return () => { u1(); n(); };
      }, []);

      const parseBulk = txt => {
        const lines = txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const parsed = lines.map((line, i) => {
          const parts = line.split('|').map(p => p.trim());
          const tag = parts[0] || '';
          const typeRaw = (parts[1] || '').toUpperCase();
          const type = Object.keys(EQ_TYPES).includes(typeRaw) ? typeRaw : 'OTR';
          const voltage = parts[2] || '220V';
          const batRaw = (parts[3] || '').toUpperCase();
          const batteryType = BAT_TYPES.find(b => b.toUpperCase() === batRaw) || 'No aplica';
          const p4 = (parts[4] || '').trim();
          const p4Num = parseInt(p4, 10);
          const hasSolar = ['SI', 'SÍ', 'YES', 'S', '1', 'TRUE'].includes(p4.toUpperCase()) || (!isNaN(p4Num) && p4Num > 0);
          const pvCount = hasSolar ? (!isNaN(p4Num) && p4Num > 0 ? p4Num : 1) : 0;
          // notes handled below with bank fields
          const batCapacity = parts[5] || '';
          const batCount = parts[6] || '';
          const batCellRaw = (parts[7] || '').trim();
          const batCellType = ['Prismática', 'Cilíndrica', 'Pouch'].find(c => c.toLowerCase() === batCellRaw.toLowerCase()) || 'No aplica';
          const notes = parts[8] || parts[5] || ''; // fallback for old 6-col format
          return { tag, type, voltage, batteryType, hasSolar, pvCount, batCapacity, batCount, batCellType, notes, valid: !!tag, _line: i + 1 };
        });
        setBulkParsed(parsed);
      };

      const importEquipment = async () => {
        if (!selNodeId) { toast('Selecciona un nodo primero.', 'error'); return; }
        const valid = bulkParsed.filter(e => e.valid);
        if (!valid.length) { toast('No hay equipos válidos para importar.', 'error'); return; }
        const isRealAdmin = await verifyAdminRole(userProfile);
        if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
        setBulkLoading(true);
        try {
          const batch = db.batch();
          valid.forEach(eq => {
            const ref = db.collection('energy_nodes').doc(selNodeId).collection('energy_equipment').doc();
            const { _line, valid: _v, ...data } = eq;
            const cleanData = {
              tag: sanitize(data.tag || ''),
              type: sanitize(data.type || ''),
              voltage: sanitize(data.voltage || ''),
              batteryType: sanitize(data.batteryType || ''),
              hasSolar: !!data.hasSolar,
              pvCount: data.hasSolar ? (data.pvCount || 1) : 0,
              batCapacity: sanitize(data.batCapacity || ''),
              batCount: sanitize(data.batCount || ''),
              batCellType: sanitize(data.batCellType || 'No aplica'),
              notes: sanitize(data.notes || '')
            };
            batch.set(ref, { ...cleanData, active: true, installedAt: new Date(), installedBy: sanitize(userProfile.name), createdAt: TS() }, { merge: true });
          });
          await batch.commit();
          toast(valid.length + ' equipos importados.', 'success');
          setBulkText(''); setBulkParsed([]); setSelNodeId('');
        } catch (e) { console.error(e); toast('Error al importar.', 'error'); }
        setBulkLoading(false);
      };

      const approve = async (uid, val, role) => {
        // Re-verificar que el usuario actual es admin antes de aprobar
        const isRealAdmin = await verifyAdminRole(userProfile);
        if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
        // Actualizar en ambas colecciones (la que exista)
        const upd = { approved: val, role };
        try {
          await Promise.allSettled([
            db.collection('energy_users').doc(uid).update(upd),
            db.collection('airtek_users').doc(uid).update({ approved: val, 'apps.nodos': role })
          ]);
          toast(val ? 'Usuario aprobado.' : 'Acceso revocado.', 'success');
          loadUsers(); // Refrescar lista
        } catch (e) { toast('Error al actualizar: ' + e.message, 'error'); }
      };

      const deleteUser = async (uid) => {
        const isRealAdmin = await verifyAdminRole(userProfile);
        if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
        try {
          await Promise.allSettled([
            db.collection('energy_users').doc(uid).delete(),
            db.collection('airtek_users').doc(uid).delete()
          ]);
          toast('Solicitud/Usuario eliminado correctamente.', 'success');
          setUsers(prev => prev.filter(u => u.id !== uid));
          loadUsers();
        } catch (e) { toast('Error al eliminar: ' + e.message, 'error'); }
      };

      const addNode = async () => {
        if (!newNode.name) { toast('Ingresa el nombre del nodo.', 'error'); return; }
        const isRealAdmin = await verifyAdminRole(userProfile);
        if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
        await db.collection('energy_nodes').add({
          name: sanitize(newNode.name),
          zone: sanitize(newNode.zone),
          estado: sanitize(newNode.estado || 'Zulia'),
          type: sanitize(newNode.type),
          active: true,
          createdAt: TS()
        });
        setNN({ name: '', zone: '', type: 'fibra', estado: 'Zulia' });
        toast('Nodo agregado.', 'success');
      };

      const saveNodeEdit = async (id) => {
        try {
          const isRealAdmin = await verifyAdminRole(userProfile);
          if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
          await db.collection('energy_nodes').doc(id).update({
            name: sanitize(editNodeData.name),
            zone: sanitize(editNodeData.zone),
            estado: sanitize(editNodeData.estado || 'Zulia'),
            type: sanitize(editNodeData.type)
          });
          setEditNodeId(null);
          toast('Nodo actualizado exitosamente.', 'success');
        } catch (e) {
          toast('Error al actualizar el nodo: ' + e.message, 'error');
        }
      };

      const toggleNode = async (n) => {
        const isRealAdmin = await verifyAdminRole(userProfile);
        if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
        await db.collection('energy_nodes').doc(n.id).update({ active: !n.active });
        toast(n.active ? 'Nodo desactivado.' : 'Nodo activado.', 'success');
      };

      const deleteNode = async (n) => {
        setConfirmModal({
          title: `¿Eliminar "${n.name}"?`,
          msg: `Esta acción eliminará la instalación/nodo "${n.name}" permanentemente del sistema.`,
          type: 'danger',
          confirmText: 'Sí, Eliminar',
          onConfirm: async () => {
            try {
              const isRealAdmin = await verifyAdminRole(userProfile);
              if (!isRealAdmin) { toast('No tienes permisos de administrador.', 'error'); return; }
              await db.collection('energy_nodes').doc(n.id).delete();
              setNodes(prev => prev.filter(x => x.id !== n.id));
              setEditNodeId(null);
              toast(`Nodo "${n.name}" eliminado con éxito.`, 'success');
            } catch (e) {
              toast('Error al eliminar el nodo: ' + e.message, 'error');
            }
          }
        });
      };

      const seedNodes = async () => {
        setConfirmModal({
          title: '¿Cargar los 23 nodos iniciales de Airtek Zulia?',
          msg: 'Esta acción es idempotente y se puede repetir sin duplicar.',
          type: 'confirm',
          confirmText: 'Sí, cargar nodos',
          onConfirm: async () => {
            const isRealAdmin = await verifyAdminRole(userProfile);
            const hasPermission = isRealAdmin || ['admin', 'supervisor', 'directivo', 'tecnico'].includes(userProfile?.role);
            if (!hasPermission) {
              toast('No tienes permisos de administrador.', 'error');
              return;
            }
            setSeeding(true);
            try {
              const batch = db.batch();
              SEED_NODES.forEach(n => {
                const ref = db.collection('energy_nodes').doc(slugify(n.name));
                batch.set(ref, {
                  name: sanitize(n.name),
                  zone: sanitize(n.zone),
                  type: sanitize(n.type),
                  active: true,
                  createdAt: TS()
                }, { merge: true });
              });
              await batch.commit();
              setConfirmModal({
                title: 'Nodos cargados con éxito',
                msg: 'Se procesaron correctamente los 23 nodos iniciales de Zulia.',
                type: 'success',
                confirmText: 'Aceptar',
                cancelText: false
              });
            } catch (e) {
              toast('Error al cargar nodos: ' + e.message, 'error');
            }
            setSeeding(false);
          }
        });
      };

      const pending = users.filter(u => !u.approved);

      return (
        <div className="fin">
          <h2 className="fd" style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 22 }}>Gestión de Datacenters / Nodos / Sedes</h2>
          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 20, display: 'flex' }}>
            {[['nodos', 'Datacenters / Nodos / Sedes'], ['usuarios', 'Usuarios'], ['personal', 'Personal Autorizado'], ['equipos', 'Carga Equipos'], ['plantas_excel', 'Mantto. Plantas Excel']].map(([k, lbl]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{lbl}{k === 'usuarios' && pending.length > 0 && <span style={{ marginLeft: 6, background: '#f55b5d', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem', fontWeight: 700 }}>{pending.length}</span>}</button>)}
          </div>

          {/* EQUIPOS - CARGA MASIVA */}
          {tab === 'equipos' && (
            <div>
              <div className="card" style={{ marginBottom: 16, background: 'rgba(0, 128, 0,.04)', borderColor: 'rgba(0, 128, 0,.2)' }}>
                <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#008000', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Formato de Entrada</h3>
                <div style={{ background: 'var(--bg-deep)', borderRadius: 8, padding: '10px 14px', fontFamily: "'JetBrains Mono',monospace", fontSize: '.72rem', color: '#64748b', lineHeight: 1.9, overflowX: 'auto' }}>
                  <div style={{ color: '#475569', marginBottom: 4 }}># Una línea por equipo — columnas separadas por |</div>
                  <div style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#0166ff' }}>TAG</span>{' | '}
                    <span style={{ color: '#008000' }}>TIPO</span>{' | '}
                    <span style={{ color: '#0166ff' }}>TENSIÓN</span>{' | '}
                    <span style={{ color: '#21c0fa' }}>BATERÍA</span>{' | '}
                    <span style={{ color: '#0166ff' }}>SOLAR</span>{' | '}
                    <span style={{ color: '#21c0fa' }}>Ah</span>{' | '}
                    <span style={{ color: '#21c0fa' }}>N°BAT</span>{' | '}
                    <span style={{ color: '#64748b' }}>CELDA</span>{' | '}
                    <span style={{ color: '#475569' }}>NOTAS</span>
                  </div>
                  <div style={{ marginTop: 6, color: '#334155', whiteSpace: 'nowrap' }}>INV00-PV-LFP00 | INV | 220V | LFP | si | | | | Inversor principal</div>
                  <div style={{ color: '#334155', whiteSpace: 'nowrap' }}>ETP00-AC-LFP01 | ETP | | LFP | no | | | | PSU Huawei</div>
                  <div style={{ color: '#334155', whiteSpace: 'nowrap' }}>ATS-DATOS | ATS | | No aplica | no | | | |</div>
                  <div style={{ color: '#334155', whiteSpace: 'nowrap' }}>BAT-LFP00 | BAT | | LFP | no | 200 | 4 | Prismática | Banco principal</div>
                  <div style={{ color: '#334155', whiteSpace: 'nowrap' }}>BAT-NMC02 | BAT | | NMC | no | 40 | 8 | Prismática | Nissan Leaf</div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '.72rem', color: '#475569' }}>
                  <span><b style={{ color: '#008000' }}>TIPO:</b> INV, ETP, ATS, BAT, OTR</span>
                  <span><b style={{ color: '#21c0fa' }}>BATERÍA:</b> LFP, GEL, AGM, VRLA, NMC</span>
                  <span><b style={{ color: '#0166ff' }}>SOLAR:</b> si/no</span>
                  <span><b style={{ color: '#64748b' }}>CELDA:</b> Prismática, Cilíndrica, Pouch</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                <div>
                  <label className="lbl">Nodo Destino</label>
                  <select className="fi" value={selNodeId} onChange={e => setSelNodeId(e.target.value)}>
                    <option value="">-- Selecciona el nodo --</option>
                    {nodes.filter(n => n.active !== false).sort((a, b) => a.name.localeCompare(b.name)).map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Lista de Equipos</label>
                  <textarea className="fi fm" rows={10}
                    style={{ resize: 'vertical', fontSize: '.82rem', lineHeight: 1.7 }}
                    value={bulkText}
                    placeholder={"INV00-PV-LFP00 | INV | 220V | LFP | si | Inversor principal\nETP00-AC-LFP01 | ETP | | LFP | no |\nATS-DATOS | ATS | | No aplica | no |"}
                    onChange={e => { setBulkText(e.target.value); parseBulk(e.target.value); }}
                  />
                </div>
              </div>

              {bulkParsed.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
                    Vista previa — {bulkParsed.filter(e => e.valid).length} equipos válidos
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                    {bulkParsed.map((eq, i) => {
                      const ti = EQ_TYPES[eq.type] || EQ_TYPES.OTR;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: eq.valid ? 'transparent' : 'rgba(245, 91, 93,.05)', flexWrap: 'wrap' }}>
                          {!eq.valid && <span style={{ color: '#f55b5d', fontSize: .7 + 'rem' }}>Línea {eq._line}</span>}
                          <span className="badge" style={{ background: ti.bg, color: ti.color, flexShrink: 0 }}>{eq.type}</span>
                          <span className="fm" style={{ fontSize: '.85rem', color: 'var(--tx1)', fontWeight: 600 }}>{eq.tag || '(sin tag)'}</span>
                          {eq.voltage && eq.type === 'INV' && <span style={{ color: 'var(--tx3)', fontSize: '.73rem' }}>{eq.voltage}</span>}
                          {eq.hasSolar && <span style={{ color: '#0166ff', fontSize: '.73rem' }}>{eq.pvCount > 1 ? `PV (${eq.pvCount})` : 'PV'}</span>}
                          {eq.batteryType && eq.batteryType !== 'No aplica' && <span style={{ color: '#21c0fa', fontSize: '.73rem' }}>{eq.batteryType}</span>}
                          {eq.notes && <span style={{ color: 'var(--tx4)', fontSize: '.73rem', marginLeft: 'auto' }}>{eq.notes}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <button className="bg" style={{ marginTop: 14, width: '100%' }} onClick={importEquipment} disabled={bulkLoading || !selNodeId}>
                    {bulkLoading ? 'Importando...' : 'Importar ' + bulkParsed.filter(e => e.valid).length + ' Equipos'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* NODOS */}
          {tab === 'nodos' && (
            <div>

              {/* Add form */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Agregar Datacenter / Nodo / Sede</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
                  <div>
                    <label className="lbl">Nombre</label>
                    <input className="fi" value={newNode.name} onChange={e => setNN({ ...newNode, name: e.target.value })} placeholder="Nodo Ejemplo" />
                  </div>
                  <div>
                    <label className="lbl">Zona / Municipio</label>
                    <input className="fi" value={newNode.zone} onChange={e => setNN({ ...newNode, zone: e.target.value })} placeholder="Maracaibo" />
                  </div>
                  <div>
                    <label className="lbl">Ubicación / Estado</label>
                    <select className="fi" value={newNode.estado} onChange={e => setNN({ ...newNode, estado: e.target.value })}>
                      <optgroup label="Venezuela">
                        <option value="Zulia">Zulia</option>
                        <option value="Falcón">Falcón</option>
                        <option value="Lara">Lara</option>
                      </optgroup>
                      <optgroup label="Colombia">
                        <option value="Colombia">Colombia</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Tipo</label>
                    <select className="fi" value={newNode.type} onChange={e => setNN({ ...newNode, type: e.target.value })}>
                      {Object.entries(NODE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                </div>
                <button className="bp" style={{ marginTop: 12, fontSize: '.85rem' }} onClick={addNode}>+ Agregar Nodo</button>
              </div>
              {/* List */}
              {ldN ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 40 }}>Cargando...</div>
                : nodes.map(n => {
                  const tc = NODE_TYPES[n.type] || { label: '—', color: '#64748b' };
                  const isEditing = editNodeId === n.id;
                  return (
                    <div key={n.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, opacity: n.active ? 1 : .5 }}>
                      {isEditing ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', flexWrap: 'wrap', width: '100%' }}>
                          <div>
                            <label className="lbl">Nombre</label>
                            <input className="fi" value={editNodeData.name} onChange={e => setEditNodeData({ ...editNodeData, name: e.target.value })} />
                          </div>
                          <div>
                            <label className="lbl">Zona</label>
                            <input className="fi" value={editNodeData.zone} onChange={e => setEditNodeData({ ...editNodeData, zone: e.target.value })} />
                          </div>
                          <div>
                            <label className="lbl">Ubicación / Estado</label>
                            <select className="fi" value={editNodeData.estado} onChange={e => setEditNodeData({ ...editNodeData, estado: e.target.value })}>
                              <optgroup label="Venezuela">
                                <option value="Zulia">Zulia</option>
                                <option value="Falcón">Falcón</option>
                                <option value="Lara">Lara</option>
                              </optgroup>
                              <optgroup label="Colombia">
                                <option value="Colombia">Colombia</option>
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <label className="lbl">Tipo</label>
                            <select className="fi" value={editNodeData.type} onChange={e => setEditNodeData({ ...editNodeData, type: e.target.value })}>
                              {Object.entries(NODE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 8 }}>
                            <button className="bg" style={{ padding: '6px 14px', fontSize: '.78rem' }} onClick={() => saveNodeEdit(n.id)}>Guardar</button>
                            <button className="bs" style={{ padding: '6px 14px', fontSize: '.78rem' }} onClick={() => setEditNodeId(null)}>Cancelar</button>
                            <button className="bd" style={{ padding: '6px 14px', fontSize: '.78rem', background: '#f55b5d', color: '#fff', border: 'none', marginLeft: 'auto' }} onClick={() => deleteNode(n)}>Eliminar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="badge" style={{ background: tc.color + '22', color: tc.color, marginRight: 8 }}>{tc.label}</span>
                            <span className="fd" style={{ fontWeight: 600, color: 'var(--tx1)' }}>{n.name}</span>
                            <span style={{ color: 'var(--tx3)', fontSize: '.8rem', marginLeft: 8 }}>{n.zone} {n.estado && n.estado !== 'Zulia' ? `(${n.estado})` : ''}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setEditNodeId(n.id); setEditNodeData({ name: n.name, zone: n.zone || '', estado: n.estado || 'Zulia', type: n.type }); }} className="bs" style={{ padding: '6px 14px', fontSize: '.78rem' }}>Editar</button>
                            <button onClick={() => toggleNode(n)} className={n.active ? 'bd' : 'bg'} style={{ padding: '6px 14px', fontSize: '.78rem' }}>
                              {n.active ? 'Desactivar' : 'Activar'}
                            </button>
                            <button onClick={() => deleteNode(n)} className="bd" style={{ padding: '6px 14px', fontSize: '.78rem', background: 'rgba(245, 91, 93, 0.12)', color: '#f55b5d', border: '1px solid rgba(245, 91, 93, 0.3)' }}>
                              Eliminar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {tab === 'plantas_excel' && (
            <PlantasExcelSync nodes={nodes} toast={toast} userProfile={userProfile} />
          )}

          {/* USUARIOS */}
          {tab === 'usuarios' && (
            <div>
              {userLoadError && (
                <div style={{ background: 'rgba(245,91,93,.08)', border: '1px solid rgba(245,91,93,.25)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f55b5d', fontSize: '.85rem' }}>
                  {userLoadError}
                  <button className="bs" style={{ marginLeft: 12, padding: '4px 12px', fontSize: '.75rem' }} onClick={loadUsers}>Reintentar</button>
                </div>
              )}

              {ldU ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>Cargando usuarios...</div>
              ) : (
                <>
                  {/* Pendientes */}
                  {pending.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
                        Solicitudes Pendientes ({pending.length})
                      </h3>
                      {pending.map(u => (
                        <div key={u.id} className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
                          <div>
                            <div className="fd" style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--tx1)' }}>{u.name || u.email || '(Usuario sin nombre)'}</div>
                            <div style={{ fontSize: '.78rem', color: 'var(--tx3)' }}>{u.email ? `${u.email} · ` : `UID: ${u.id.slice(0, 8)}... · `}Solicita: {u.role || 'tecnico'}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select className="fi" style={{ width: 'auto', padding: '5px 10px', fontSize: '.78rem' }} defaultValue={u.role || 'tecnico'} id={'role-' + u.id}>
                              <option value="tecnico">Tecnico</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="directivo">Directivo</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button className="bg" style={{ padding: '6px 16px', fontSize: '.78rem' }} onClick={() => approve(u.id, true, document.getElementById('role-' + u.id).value)}>Aprobar</button>
                            <button className="bd" style={{ padding: '6px 16px', fontSize: '.78rem' }} onClick={() => {
                              setConfirmModal({
                                title: 'Rechazar y eliminar solicitud',
                                msg: `¿Deseas eliminar permanentemente la solicitud de ${u.name || u.email || 'este usuario'}? Al eliminarla se podrá registrar nuevamente desde cero.`,
                                type: 'danger',
                                confirmText: 'Eliminar solicitud',
                                cancelText: 'Cancelar',
                                onConfirm: () => deleteUser(u.id)
                              });
                            }}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Usuarios Activos */}
                  <h3 className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
                    Usuarios Registrados ({users.filter(u => u.approved).length})
                  </h3>
                  {users.filter(u => u.approved).sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')).map(u => (
                    <div key={u.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div className="fd" style={{ fontWeight: 600, fontSize: '.88rem', color: 'var(--tx1)' }}>{u.name || '(sin nombre)'}</div>
                        <div style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>{u.email}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select className="fi" style={{ width: 'auto', padding: '5px 10px', fontSize: '.78rem' }} value={u.role || 'tecnico'} onChange={e => approve(u.id, true, e.target.value)}>
                          <option value="tecnico">Tecnico</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="directivo">Directivo</option>
                          <option value="admin">Admin</option>
                        </select>
                        <span className="badge" style={{
                          background: u.role === 'admin' ? 'rgba(1,102,255,.12)' : u.role === 'supervisor' ? 'rgba(234,179,8,.12)' : u.role === 'directivo' ? 'rgba(168,85,247,.12)' : 'rgba(0,128,0,.12)',
                          color: u.role === 'admin' ? '#0166ff' : u.role === 'supervisor' ? '#d97706' : u.role === 'directivo' ? '#a855f7' : '#008000',
                          fontSize: '.72rem'
                        }}>
                          {u.role === 'admin' ? 'Administrador' : u.role === 'supervisor' ? 'Supervisor' : u.role === 'directivo' ? 'Directivo' : 'Tecnico'}
                        </span>
                        <button className="bd" style={{ padding: '5px 12px', fontSize: '.75rem' }} onClick={() => {
                          setConfirmModal({
                            title: 'Revocar acceso',
                            msg: 'Se revocara el acceso a ' + (u.name || u.email) + '. El usuario no podra acceder hasta ser aprobado de nuevo.',
                            type: 'confirm',
                            confirmText: 'Revocar',
                            cancelText: 'Cancelar',
                            onConfirm: () => approve(u.id, false, u.role || 'tecnico')
                          });
                        }}>Revocar</button>
                        <button className="bd" style={{ padding: '5px 10px', fontSize: '.75rem', borderColor: 'rgba(245,91,93,0.3)', color: '#f55b5d' }} title="Eliminar de la base de datos" onClick={() => {
                          setConfirmModal({
                            title: 'Eliminar usuario permanentemente',
                            msg: `¿Estás seguro de eliminar el perfil de ${u.name || u.email || 'este usuario'}? Podrá registrarse nuevamente desde cero.`,
                            type: 'danger',
                            confirmText: 'Eliminar',
                            cancelText: 'Cancelar',
                            onConfirm: () => deleteUser(u.id)
                          });
                        }}>Eliminar</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {tab === 'personal' && (
            <AuthorizedPersonnelAdmin users={users} toast={toast} />
          )}
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

    // ═══════════════════════════════════════════════════
    // TOPBAR
    // ═══════════════════════════════════════════════════

export default AdminPanel;
export { AdminPanel, PlantasExcelSync, AuthorizedPersonnelAdmin, AddExistingUser, UID_AddForm };
