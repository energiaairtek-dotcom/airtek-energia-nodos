import { useState } from 'react';
import { db, TS } from '@/services/firebase';

function UID_AddForm({ toast, userProfile, onDone }) {
      const [uid, setUid] = useState('');
      const [name, setName] = useState('');
      const [email, setEmail] = useState('');
      const [role, setRole] = useState('tecnico');
      const [loading, setLoading] = useState(false);

      const save = async () => {
        if (!uid.trim() || !name.trim()) { toast('UID y nombre son requeridos.', 'error'); return; }
        setLoading(true);
        try {
          const legacyRef = db.collection('energy_users').doc(uid.trim());
          const unifiedRef = db.collection('airtek_users').doc(uid.trim());
          const [existingLegacy, existingUnified] = await Promise.all([legacyRef.get(), unifiedRef.get()]);
          if (existingLegacy.exists && existingUnified.exists) { toast('Este UID ya tiene perfil en el sistema.', 'warn'); setLoading(false); return; }
          const profileData = { name: name.trim(), email: email.trim().toLowerCase(), role, approved: true, createdAt: TS() };
          // Escribir en ambas colecciones para compatibilidad cruzada
          if (!existingUnified.exists) await unifiedRef.set({ ...profileData, apps: { nodos: role, pm: null, almacen: null } });
          if (!existingLegacy.exists) await legacyRef.set(profileData);
          toast('Usuario agregado exitosamente. Ya puede ingresar en cualquier app con su contraseña.', 'success');
          setUid(''); setName(''); setEmail(''); setRole('tecnico');
          onDone();
        } catch (e) { console.error(e); toast('Error: ' + e.message, 'error'); }
        setLoading(false);
      };

      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label className="lbl">UID de Firebase Auth</label>
            <input className="fi fm" value={uid} onChange={e => setUid(e.target.value)} placeholder="Ej: HxhK9DQ8EcYpQu4q4itjDo7vlxI2" />
          </div>
          <div>
            <label className="lbl">Nombre completo</label>
            <input className="fi" value={name} onChange={e => setName(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="lbl">Correo (referencia)</label>
            <input className="fi" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@airtek.com" />
          </div>
          <div>
            <label className="lbl">Rol</label>
            <select className="fi" value={role} onChange={e => setRole(e.target.value)}>
              <option value="tecnico">Técnico</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <button className="bi" style={{ width: '100%', padding: '10px' }} onClick={save} disabled={loading}>
              {loading ? 'Guardando...' : 'Agregar Usuario'}
            </button>
          </div>
        </div>
      );
    }

export { UID_AddForm };
export default UID_AddForm;
