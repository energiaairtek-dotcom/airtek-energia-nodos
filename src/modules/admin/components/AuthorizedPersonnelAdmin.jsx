import { useState, useEffect } from 'react';
import { db, TS } from '@/services/firebase';

import { DEFAULT_AUTHORIZED_STAFF } from '@/hooks/useAuthorizedStaff';

function AuthorizedPersonnelAdmin({ users = [], toast }) {
      const [staffList, setStaffList] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_authorized_staff_v2');
          if (saved) return JSON.parse(saved);
          const old = localStorage.getItem('airtek_authorized_staff');
          if (old && !old.includes('Ángel Briceño') && !old.includes('Franklin Rincón')) {
            return JSON.parse(old);
          }
        } catch {}
        return DEFAULT_AUTHORIZED_STAFF;
      });
      const [newName, setNewName] = useState('');
      const [saving, setSaving] = useState(false);

      useEffect(() => {
        if (!db) return;
        const unsub = db.collection('energy_config').doc('personal').onSnapshot(snap => {
          if (snap.exists) {
            const list = snap.data().list;
            if (Array.isArray(list) && list.length > 0 && !list.includes('Ángel Briceño') && !list.includes('Franklin Rincón')) {
              setStaffList(list);
              try { localStorage.setItem('airtek_authorized_staff_v2', JSON.stringify(list)); } catch {}
            } else if (Array.isArray(list) && (list.includes('Ángel Briceño') || list.includes('Franklin Rincón'))) {
              db.collection('energy_config').doc('personal').set({
                list: DEFAULT_AUTHORIZED_STAFF,
                updatedAt: TS()
              }, { merge: true }).catch(console.error);
            }
          } else {
            db.collection('energy_config').doc('personal').set({
              list: DEFAULT_AUTHORIZED_STAFF,
              updatedAt: TS()
            }, { merge: true }).catch(console.error);
          }
        }, err => console.warn('Staff config listener:', err));
        return () => unsub();
      }, []);

      const saveStaff = async (updatedList) => {
        setSaving(true);
        setStaffList(updatedList);
        try {
          localStorage.setItem('airtek_authorized_staff_v2', JSON.stringify(updatedList));
          if (db) {
            await db.collection('energy_config').doc('personal').set({
              list: updatedList,
              updatedAt: TS()
            }, { merge: true });
          }
          if (toast) toast('Lista de personal autorizada actualizada.', 'success');
        } catch(e) {
          console.error(e);
          if (toast) toast('Guardado en caché local.', 'info');
        }
        setSaving(false);
      };

      const handleAdd = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (staffList.includes(trimmed)) {
          if (toast) toast('Este nombre ya está en la lista.', 'info');
          return;
        }
        const updated = [...staffList, trimmed];
        saveStaff(updated);
        setNewName('');
      };

      const handleRemove = (nameToRemove) => {
        const updated = staffList.filter(n => n !== nameToRemove);
        saveStaff(updated);
      };

      const handleImportUsers = () => {
        const userNames = users
          .filter(u => u.approved !== false && (u.name || u.nombre))
          .map(u => (u.name || u.nombre).trim())
          .filter(Boolean);
        const combined = Array.from(new Set([...staffList, ...userNames]));
        saveStaff(combined);
        if (toast) toast(`${combined.length} personas sincronizadas.`, 'success');
      };

      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 className="fd" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx1)', margin: 0 }}>
                Personal Técnico Autorizado ({staffList.length})
              </h3>
              <p style={{ color: 'var(--tx3)', fontSize: '.78rem', margin: '3px 0 0' }}>
                Nombres utilizados en los desplegables de Inspección y Surtido de Combustible.
              </p>
            </div>
            <button
              type="button"
              className="bs"
              onClick={handleImportUsers}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', padding: '6px 14px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Sincronizar con Usuarios Registrados
            </button>
          </div>

          <div className="card" style={{ marginBottom: 16, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="fi"
              style={{ flex: 1, minWidth: 240 }}
              placeholder="Nombre y Apellido del técnico..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            />
            <button className="bp" onClick={handleAdd} disabled={saving || !newName.trim()} style={{ padding: '8px 18px', fontSize: '.84rem' }}>
              + Añadir al Personal
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {staffList.map((name, i) => (
              <div
                key={name}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '.75rem', color: 'var(--tx4)', width: 22, textAlign: 'right', fontWeight: 700 }}>
                    {i + 1}.
                  </span>
                  <div style={{ fontWeight: 600, fontSize: '.86rem', color: 'var(--tx1)' }}>
                    {name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--tx4)',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: '.8rem',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--tx4)'; e.currentTarget.style.background = 'none'; }}
                  title="Eliminar de la lista"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

export { AuthorizedPersonnelAdmin };
export default AuthorizedPersonnelAdmin;
