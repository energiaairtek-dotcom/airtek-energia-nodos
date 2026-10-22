import { useState, useMemo } from 'react';

    function PersonnelMultiSelect({ value = '', onChange, staff = [], label = 'Personal que realizó la inspección' }) {
      const selectedList = useMemo(() => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return String(value).split(',').map(s => s.trim()).filter(Boolean);
      }, [value]);

      const [customInput, setCustomInput] = useState('');
      const [showCustom, setShowCustom] = useState(false);

      const addPerson = (name) => {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        if (selectedList.includes(trimmed)) return;
        const next = [...selectedList, trimmed];
        onChange(next.join(', '));
      };

      const removePerson = (name) => {
        const next = selectedList.filter(n => n !== name);
        onChange(next.join(', '));
      };

      const availableStaff = staff.filter(s => !selectedList.includes(s));

      return (
        <div style={{ marginBottom: 4 }}>
          <label className="lbl">{label}</label>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 32, alignItems: 'center' }}>
            {selectedList.length === 0 ? (
              <span style={{ fontSize: '.78rem', color: 'var(--tx3)', fontStyle: 'italic' }}>
                Ninguna persona seleccionada aún
              </span>
            ) : (
              selectedList.map(name => (
                <span
                  key={name}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 20,
                    background: 'rgba(1, 102, 255, 0.12)',
                    color: 'var(--blue)',
                    border: '1px solid rgba(1, 102, 255, 0.25)',
                    fontSize: '.78rem',
                    fontWeight: 600
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {name}
                  <button
                    type="button"
                    onClick={() => removePerson(name)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      marginLeft: 2,
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: 13,
                      fontWeight: 700
                    }}
                    title="Quitar"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="fi"
              style={{ flex: 1 }}
              value=""
              onChange={e => {
                const val = e.target.value;
                if (val === '__custom__') {
                  setShowCustom(true);
                } else if (val) {
                  addPerson(val);
                }
              }}
            >
              <option value="">+ Seleccionar persona autorizada...</option>
              {availableStaff.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="__custom__">+ Otro (escribir nombre manual)...</option>
            </select>
          </div>

          {showCustom && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                className="fi"
                type="text"
                placeholder="Escribe nombre y apellido..."
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPerson(customInput);
                    setCustomInput('');
                    setShowCustom(false);
                  }
                }}
                style={{ fontSize: '.82rem' }}
              />
              <button
                type="button"
                className="bp"
                style={{ padding: '6px 14px', fontSize: '.78rem' }}
                onClick={() => {
                  addPerson(customInput);
                  setCustomInput('');
                  setShowCustom(false);
                }}
              >
                Agregar
              </button>
              <button
                type="button"
                className="bs"
                style={{ padding: '6px 10px', fontSize: '.78rem' }}
                onClick={() => {
                  setCustomInput('');
                  setShowCustom(false);
                }}
              >
                Cancelar
              </button>
            </div>
          )}
          <div style={{ fontSize: '.7rem', color: 'var(--tx4)', marginTop: 4 }}>
            Selecciona del desplegable los técnicos que participaron en la actividad.
          </div>
        </div>
      );
    }
export { PersonnelMultiSelect };
export default PersonnelMultiSelect;
