import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { db } from '@/services/firebase';
import { NodeDetail } from '@/modules/nodes/components/NodeDetail';
import { NODE_TYPES } from '@/config/constants';
import { IconChecklist, IconSearch, IconSliders, IconMapPin } from '@/components/icons';

function NodeList({ userProfile, toast }) {
      const [confirmModal, setConfirmModal] = useState(null);
      const [nodes, setNodes] = useState([]);
      const [loading, setLoading] = useState(true);
      const [sel, setSel] = useState(null);
      const [search, setSearch] = useState('');
      const [fType, setFType] = useState('all');
      const [showFilters, setShowFilters] = useState(false);
      const [fState, setFState] = useState('all');
      const [activeInspection, setActiveInspection] = useState(() => {
        try {
          const s = localStorage.getItem('airtek_active_inspection');
          return s ? JSON.parse(s) : null;
        } catch { return null; }
      });

      // Refrescar estado de borrador al volver a la pestaña
      useEffect(() => {
        const updateActive = () => {
          try {
            const s = localStorage.getItem('airtek_active_inspection');
            setActiveInspection(s ? JSON.parse(s) : null);
          } catch {}
        };
        window.addEventListener('focus', updateActive);
        document.addEventListener('visibilitychange', updateActive);
        return () => {
          window.removeEventListener('focus', updateActive);
          document.removeEventListener('visibilitychange', updateActive);
        };
      }, []);

      const resumeInspection = () => {
        if (!activeInspection) return;
        const node = nodes.find(n => n.id === activeInspection.nodeId);
        if (node) {
          setSel(node);
        } else {
          toast('No se encontró el nodo del borrador', 'warn');
        }
      };

      const discardActiveInspection = () => {
        try {
          if (activeInspection?.key) localStorage.removeItem(activeInspection.key);
          localStorage.removeItem('airtek_active_inspection');
          setActiveInspection(null);
          toast('Borrador descartado', 'info');
        } catch (e) {}
      };

      const isFiltered = search !== '' || fState !== 'all' || fType !== 'all';

      const resetFilters = () => {
        setSearch('');
        setFState('all');
        setFType('all');
      };

      useEffect(() => {
        const u = db.collection('energy_nodes').where('active', '==', true).onSnapshot(s => {
          setNodes(s.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
        return u;
      }, []);

      // Deep link via ?node=id
      useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        const nid = p.get('node');
        if (nid && nodes.length > 0) { const n = nodes.find(n => n.id === nid); if (n) setSel(n); }
      }, [nodes]);

      // Vercel Best Practice: rerender-use-deferred-value & rerender-memo - Keeps typing responsive and caches results
      const deferredSearch = useDeferredValue(search);

      const normalizeLoc = useCallback((loc) => {
        const l = (loc || '').trim().toLowerCase();
        if (l === 'falcon' || l === 'falcón') return 'Falcón';
        if (l === 'lara') return 'Lara';
        if (l === 'colombia') return 'Colombia';
        return 'Zulia';
      }, []);

      const filtered = useMemo(() => {
        const q = (deferredSearch || '').toLowerCase().trim();
        const fStateLow = fState.toLowerCase();
        return nodes.filter(n => {
          if (q) {
            const nameMatch = (n.name || '').toLowerCase().includes(q);
            const zoneMatch = (n.zone || '').toLowerCase().includes(q);
            if (!nameMatch && !zoneMatch) return false;
          }
          if (fType !== 'all' && n.type !== fType) return false;
          if (fState === 'all') return true;

          const loc = normalizeLoc(n.estado);
          if (fState === 'Venezuela') return loc !== 'Colombia';
          if (fState === 'Colombia') return loc === 'Colombia';
          return loc.toLowerCase() === fStateLow || (fStateLow.startsWith('falco') && loc === 'Falcón');
        });
      }, [nodes, deferredSearch, fType, fState, normalizeLoc]);

      if (sel) return <NodeDetail node={sel} userProfile={userProfile} onBack={() => setSel(null)} toast={toast} />;

      return (
        <div className="fin">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 className="fd" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--tx1)' }}>Sistema de Gestión de Energía</h1>
              <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>{nodes.length} ubicaciones activas registradas en la red</p>
            </div>
          </div>
          {/* Banner de Borrador Activo */}
          {activeInspection && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 14,
              padding: '14px 18px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: 'var(--card-shadow)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconChecklist size={22} color="#f59e0b" />
                <div>
                  <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '.92rem' }}>
                    Inspección en progreso: {activeInspection.nodeName}
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--tx2)' }}>
                    {activeInspection.formType === 'plant' ? `Planta ${activeInspection.plantTag}` : 'Inspección general de equipos'} · Guardado local {activeInspection.savedAt ? new Date(activeInspection.savedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bp" style={{ padding: '8px 16px', fontSize: '.82rem' }} onClick={resumeInspection}>
                  Continuar Inspección →
                </button>
                <button className="bs" style={{ padding: '8px 12px', fontSize: '.82rem', borderColor: 'rgba(239,68,68,.4)', color: '#ef4444' }} onClick={discardActiveInspection}>
                  Descartar
                </button>
              </div>
            </div>
          )}

          {/* Search Bar & Filter Button (Only Filter Button Visible Initially) */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--tx3)', display: 'flex', alignItems: 'center', pointerEvents: 'none'
              }}>
                <IconSearch size={17} />
              </span>
              <input 
                className="fi" 
                style={{ paddingLeft: 40, paddingRight: search ? 36 : 14, borderRadius: 24, height: 42 }} 
                placeholder="Buscar Datacenter, nodo o sede..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 15,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              title="Filtros de búsqueda"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: (showFilters || isFiltered) ? 'rgba(1, 102, 255, 0.12)' : 'var(--bg-surface)',
                border: '1px solid',
                borderColor: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--border)',
                color: (showFilters || isFiltered) ? 'var(--primary)' : 'var(--tx2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <IconSliders size={19} />
            </button>
          </div>

          {/* Expandable Filter Drawer */}
          {(showFilters || isFiltered) && (
            <div 
              className="fin"
              style={{ 
                marginBottom: 20, 
                padding: '14px 16px', 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border)', 
                borderRadius: '16px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 14, 
                flexWrap: 'wrap' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Ubicación:</span>
                <select 
                  className="fi" 
                  style={{ width: 180, borderRadius: 20, height: 38, padding: '0 12px' }} 
                  value={fState} 
                  onChange={e => setFState(e.target.value)}
                >
                  <option value="all">Todas las ubicaciones</option>
                  <optgroup label="Venezuela">
                    <option value="Venezuela">Toda Venezuela</option>
                    <option value="Zulia">Zulia</option>
                    <option value="Falcón">Falcón</option>
                    <option value="Lara">Lara</option>
                  </optgroup>
                  <optgroup label="Colombia">
                    <option value="Colombia">Colombia</option>
                  </optgroup>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.8rem', color: 'var(--tx3)', fontWeight: 600 }}>Tipo:</span>
                <div className="segmented-control">
                  {['all', ...Object.keys(NODE_TYPES)].map(t => {
                    const nt = NODE_TYPES[t];
                    const on = fType === t;
                    return (
                      <button 
                        key={t} 
                        onClick={() => setFType(t)}
                        className={`segmented-btn ${on ? 'active' : ''}`}
                      >
                        {t === 'all' ? 'Todos los nodos' : nt.label.toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isFiltered && (
                <button
                  onClick={resetFilters}
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(245, 91, 93, 0.1)',
                    border: '1px solid rgba(245, 91, 93, 0.3)',
                    color: '#f55b5d',
                    fontSize: '.78rem',
                    fontWeight: 600,
                    padding: '6px 14px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  Limpiar filtro
                </button>
              )}
            </div>
          )}
          {loading ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>Cargando nodos...</div>
            : filtered.length === 0 ? <div style={{ color: 'var(--tx3)', textAlign: 'center', padding: 70 }}>No se encontraron nodos.</div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
                  {filtered.map(n => {
                    const tc = NODE_TYPES[n.type] || { label: '—', color: '#64748b' };
                    return (
                      <div key={n.id} className="card ncard" style={{ cursor: 'pointer', border: '1px solid var(--border)' }}
                        onClick={() => setSel(n)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <span className="badge" style={{ background: tc.color + '22', color: tc.color }}>{tc.label}</span>
                          <span style={{ color: 'var(--border-bright)', fontSize: 20 }}>›</span>
                        </div>
                        <div className="fd" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx1)', marginBottom: 4, lineHeight: 1.3 }}>{n.name}</div>
                        <div style={{ color: 'var(--tx4)', fontSize: '.8rem' }}><IconMapPin size={14} />{n.zone}</div>
                      </div>
                    );
                  })}
                </div>
              )}
        </div>
      );
    }

export { NodeList };
export default NodeList;
