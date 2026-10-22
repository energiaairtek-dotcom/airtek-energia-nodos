import { useState, useEffect } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { calcularMaterialesProyecto } from '@/modules/calculators/materiales/calc';
import { DEFAULT_PROYECTO_FORM } from '@/modules/calculators/materiales/constants';

function MaterialesCalc({ onGoUnificada }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [proyecto, setProyecto] = useState(() => localStorage.getItem('airtek_calc_proyecto_nombre') || '');
  const [f, setF] = useState(() => {
    try {
      const saved = localStorage.getItem('airtek_calc_proyecto_form');
      if (saved) return { ...DEFAULT_PROYECTO_FORM, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_PROYECTO_FORM;
  });
  const [resultados, setResultados] = useState(() => {
    try {
      const saved = localStorage.getItem('airtek_calc_proyecto_form');
      if (saved) {
        const res = calcularMaterialesProyecto(JSON.parse(saved));
        if (res && res.length > 0) return res;
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem('airtek_calc_proyecto_form', JSON.stringify(f));
      localStorage.setItem('airtek_calc_proyecto_nombre', proyecto);
    } catch {}
  }, [f, proyecto]);

  const getValNum = (key) => parseFloat(f[key]) || 0;
  const getValText = (key) => f[key] || '';

  const calcularFuentes = () => {
    const fuentesCantidad = getValNum("fuentesCantidad");
    const alimentacionFuente = getValNum("alimentacionFuente");
    const rectificadores = getValNum("rectificadores");
    const inversores = getValNum("inversores");
    const moduloSolarG1 = getValNum("moduloSolarG1");
    const moduloSolarG6 = getValNum("moduloSolarG6");
    let items = [];
    if (fuentesCantidad === 0) return items;
    
    items.push({ nombre: "CABLE ROJO AUTOMOTRIZ #2 AWG", cantidad: 1.5 * fuentesCantidad, unidad: "mts", seccion: "fuentes", orden: 1 });
    items.push({ nombre: "CABLE NEGRO AUTOMOTRIZ #2 AWG", cantidad: 1.5 * fuentesCantidad, unidad: "mts", seccion: "fuentes", orden: 2 });
    items.push({ nombre: "TERMINAL DE UN OJO #2", cantidad: 4 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 3 });
    if (alimentacionFuente > 0) {
      items.push({ nombre: `TERMINAL DE OJO #${alimentacionFuente}`, cantidad: 1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 4 });
    }
    items.push({ nombre: "TERMINAL AUTOMOTRIZ AISLADO DE ANILLO DE CALIBRE #10-12 AWG (AMARILLO) DE DIÁMETRO ¼” O 6 MM (M6)", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 5 });
    items.push({ nombre: "TORNILLO CABEZA HEXAGONAL 5/16\"X1\"", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 6 });
    items.push({ nombre: "ARANDELAS 5*16", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 7 });
    items.push({ nombre: "TUERCA 5/16\"", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 8 });
    items.push({ nombre: "CHASIS DE FUENTE DE PODER (PSU) HUAWEI ETP23006-C3A1", cantidad: 1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 9 });
    items.push({ nombre: "MODULO INVERSOR HUAWEI I23003G1 3KVA / 230VAC", cantidad: inversores * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 10 });
    items.push({ nombre: "MODULO RECTIFICADOR HUAWEI R4875G5 48VDC / 75ADC", cantidad: rectificadores * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 11 });
    if (moduloSolarG1 > 0) {
      items.push({ nombre: "MODULO SOLAR SCC (CONTROLADOR DE CARGA SOLAR) SSU (SOLAR SUPPLY UNIT) MPPT HUAWEI S4875G1 4KWPK / 150VOC / 60ASC / 48VDC / 75ADC", cantidad: moduloSolarG1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 12 });
      items.push({ nombre: "CONECTOR PV HUAWEI EPC PARA MODULO SOLAR S4875G1", cantidad: 2 * moduloSolarG1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 13 });
    }
    if (moduloSolarG6 > 0) {
      items.push({ nombre: "MODULO SOLAR SCC (CONTROLADOR DE CARGA SOLAR) SSU (SOLAR SUPPLY UNIT) MPPT HUAWEI S4875G6 4KWPK / 150VOC / 60ASC / 48VDC / 75ADC", cantidad: moduloSolarG6 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 14 });
      items.push({ nombre: "CABLE PARA MODULO SOLAR S4875G6", cantidad: 1 * moduloSolarG6 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 15 });
    }
    return items;
  };

  const calcularRack = () => {
    const racksCantidad = getValNum("racksCantidad");
    const bateriasCantidad = getValNum("bateriasCantidad");
    const jumpersLargos = getValNum("jumpersLargos");
    let items = [];
    if (racksCantidad === 0 && bateriasCantidad === 0 && jumpersLargos === 0) return items;
    
    if (racksCantidad > 0) {
      items.push({ nombre: "RACK PISO STRIG 42U CERRADO", cantidad: racksCantidad, unidad: "und", seccion: "rack", orden: 100 });
      items.push({ nombre: "AISLADOR PARA BARRA DE COBRE SM-35", cantidad: 4 * racksCantidad, unidad: "und", seccion: "rack", orden: 102 });
      items.push({ nombre: "TORNILLO 8mm", cantidad: 8 * racksCantidad, unidad: "und", seccion: "rack", orden: 103 });
    }
    if (bateriasCantidad > 0) {
      items.push({ nombre: "BATERIA PYLONTECH US5000 / IONES DE LITIO TIPO LFP / 48V / 100 AH", cantidad: bateriasCantidad, unidad: "und", seccion: "rack", orden: 104 });
      items.push({ nombre: "TORNILLO CABEZA HEXAGONAL 5/16\"X1\"", cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 105 });
      items.push({ nombre: "ARANDELAS 5*16", cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 106 });
      items.push({ nombre: "TUERCA 5/16\"", cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 107 });
      items.push({ nombre: "CABLE DE TIERRA DE BATERIA", cantidad: 1 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 109 });
      const moduloCables = bateriasCantidad - 1;
      if (moduloCables > 0) {
        items.push({ nombre: "KIT DE CABLES DE MODULO (BATERIA-BATERIA) PARA BATERIAS PYLONTECH US", cantidad: moduloCables, unidad: "und", seccion: "rack", orden: 110 });
      }
    }
    if (jumpersLargos > 0) {
      items.push({ nombre: "KIT DE CABLES EXTERNOS (BATERIA-INVERSOR) PARA BATERIAS PYLONTECH US / UP", cantidad: jumpersLargos, unidad: "und", seccion: "rack", orden: 108 });
    }
    return items;
  };

  const calcularEntradaAC = () => {
    const metrosEntradaAC = getValNum("metrosEntradaAC");
    const racksEntradaAC = getValNum("racksEntradaAC");
    const fuentesEntradaAC = getValNum("fuentesEntradaAC");
    const calibreEntradaAC = getValNum("calibreEntradaAC");
    const aislamientoEntradaAC = getValText("aislamientoEntradaAC");
    if (metrosEntradaAC === 0 || racksEntradaAC === 0 || fuentesEntradaAC === 0 || calibreEntradaAC === 0 || !aislamientoEntradaAC) return [];
    const total = (metrosEntradaAC + 4) * racksEntradaAC * fuentesEntradaAC;
    return [
      { nombre: `CABLE ${aislamientoEntradaAC} #${calibreEntradaAC} (Fase 1)`, cantidad: total, unidad: "mts", seccion: "entrada_ac", orden: 200 },
      { nombre: `CABLE ${aislamientoEntradaAC} #${calibreEntradaAC} (Fase 2)`, cantidad: total, unidad: "mts", seccion: "entrada_ac", orden: 201 }
    ];
  };

  const calcularSalidaAC = () => {
    const metrosSalidaAC = getValNum("metrosSalidaAC");
    const racksSalidaAC = getValNum("racksSalidaAC");
    const calibreSalidaAC = getValNum("calibreSalidaAC");
    const aislamientoSalidaAC = getValText("aislamientoSalidaAC");
    const pduAC = getValNum("pduAC");
    let items = [];
    if (metrosSalidaAC > 0 && racksSalidaAC > 0 && calibreSalidaAC > 0 && aislamientoSalidaAC) {
      const total = ((metrosSalidaAC + 4) * racksSalidaAC) * 2;
      items.push({ nombre: `CABLE ${aislamientoSalidaAC} #${calibreSalidaAC} (Fase 1)`, cantidad: total, unidad: "mts", seccion: "salida_ac", orden: 300 });
      items.push({ nombre: `CABLE ${aislamientoSalidaAC} #${calibreSalidaAC} (Fase 2)`, cantidad: total, unidad: "mts", seccion: "salida_ac", orden: 301 });
    }
    if (pduAC > 0) {
      items.push({ nombre: "PDU DC INPUT 2 CHANNELS 63A/1P, OUTPUT 8(2X4) CHANNELS 32A/1P", cantidad: pduAC, unidad: "und", seccion: "salida_ac", orden: 302 });
      items.push({ nombre: "[ENE-BRE-MAG-002] BREAKER MAGNETOTÉRMICO DE 2X20 AMP", cantidad: 4 * pduAC, unidad: "und", seccion: "salida_ac", orden: 303 });
      items.push({ nombre: "BARRA DE DISTRIBUCION PARA BREAKER TERMOMAGNETICO DE 2 POLOS 63AMP, 240/410 VOLTS", cantidad: 8 * pduAC, unidad: "und", seccion: "salida_ac", orden: 304 });
    }
    if (racksSalidaAC > 0) {
      items.push({ nombre: "TOMACORRIENTE DOBLE AC 120VOTS", cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 305 });
      items.push({ nombre: "CAJERA METALICA DE 4X2\"", cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 306 });
      items.push({ nombre: "TAPA PLASTICA PARA TOMACORRIENTE DOBLE 4X2\"", cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 307 });
    }
    return items;
  };

  const calcularSalidaDC = () => {
    const metrosSalidaDC = getValNum("metrosSalidaDC");
    const racksSalidaDC = getValNum("racksSalidaDC");
    const calibreSalidaDC = getValNum("calibreSalidaDC");
    const aislamientoSalidaDC = getValText("aislamientoSalidaDC");
    const equipos10 = getValNum("equipos10");
    const equipos14 = getValNum("equipos14");
    let items = [];
    if (metrosSalidaDC > 0 && racksSalidaDC > 0 && calibreSalidaDC > 0 && aislamientoSalidaDC) {
      const total = ((metrosSalidaDC + 4) * racksSalidaDC) * 2;
      items.push({ nombre: `CABLE ${aislamientoSalidaDC} #${calibreSalidaDC} (ROJO)`, cantidad: total, unidad: "mts", seccion: "salida_dc", orden: 400 });
      items.push({ nombre: `CABLE ${aislamientoSalidaDC} #${calibreSalidaDC} (NEGRO)`, cantidad: total, unidad: "mts", seccion: "salida_dc", orden: 401 });
    }
    if (racksSalidaDC > 0) {
      items.push({ nombre: "PDU DC INPUT 2 CHANNELS 63A/1P, OUTPUT 8(2X4) CHANNELS 32A/1P", cantidad: racksSalidaDC, unidad: "und", seccion: "salida_dc", orden: 402 });
      items.push({ nombre: "CONECTOR PARA PEINE ELÉCTRICO, 63A", cantidad: 2 * racksSalidaDC, unidad: "und", seccion: "salida_dc", orden: 403 });
    }
    if (equipos10 > 0) {
      items.push({ nombre: "CABLE AUTOMOTRIZ #10 (POS+)", cantidad: 5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 404 });
      items.push({ nombre: "CABLE AUTOMOTRIZ #10 (NEG-)", cantidad: 5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 405 });
      items.push({ nombre: "CABLE AUTOMOTRIZ #10 VERDE (GND)", cantidad: 2.5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 405.5 });
      items.push({ nombre: "TERMINAL AUTOMOTRIZ AISLADO DE ANILLO DE CALIBRE #10-12 AWG (AMARILLO) DE DIÁMETRO ¼” O 6 MM (M6)", cantidad: (4 * equipos10) + 1, unidad: "und", seccion: "salida_dc", orden: 406 });
    }
    if (equipos14 > 0) {
      items.push({ nombre: "CABLE AUTOMOTRIZ #14 (POS+)", cantidad: 5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 407 });
      items.push({ nombre: "CABLE AUTOMOTRIZ #14 (NEG-)", cantidad: 5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 408 });
      items.push({ nombre: "CABLE AUTOMOTRIZ #14 VERDE (GND)", cantidad: 2.5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 408.5 });
      items.push({ nombre: "CONECTOR TERMINAL HORQUILLA TIPO Y PARA 1/8\" (AZUL)", cantidad: (4 * equipos14) + 1, unidad: "und", seccion: "salida_dc", orden: 409 });
    }
    return items;
  };

  const calcularEscalerillas = () => {
    const soportesCantidad = getValNum("soportesCantidad");
    if (soportesCantidad === 0) return [];
    return [
      { nombre: "ACOPLADOR GALVANIZADO PARA BANDEJA METALICA", cantidad: soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 500 },
      { nombre: "SOPORTE PARA COLGAR BANDEJA METALICA DE ALTA RESISTENCIA (RIEL UNISTRURT DE 30CM)", cantidad: soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 501 },
      { nombre: "SOPORTE PARA ANCLAJE DE BANDEJA METALICA EN TECHO", cantidad: 2 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 502 },
      { nombre: "TUERCA PARA BARRA ROSCADA DE 1/2\"", cantidad: 8 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 503 },
      { nombre: "ARANDELA PARA BARRA ROSCADA DE 1/2\"", cantidad: 8 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 504 },
      { nombre: "TORNILLOS PARA RAMPLUNG NARANJA", cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 505 },
      { nombre: "RAMPLUG NARANJA 3/8\"", cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 506 },
      { nombre: "ARANDELAS 5*16", cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 507 }
    ];
  };

  const consolidarResultados = () => {
    return calcularMaterialesProyecto(f);
  };

  const calcular = () => {
    const res = calcularMaterialesProyecto(f);
    setResultados(res);
  };

  const copy = () => {
    if (!resultados || !resultados.length) return;
    let txt = 'AIRTEK - MATERIALES TOTALES\n';
    if (proyecto) txt += 'Proyecto: ' + proyecto + '\n';
    txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
    txt += '----------------------------------------\n\n';
    resultados.forEach(r => {
      const c = Number.isInteger(r.cantidad) ? r.cantidad : r.cantidad.toFixed(2);
      txt += r.nombre + ': ' + c + ' ' + r.unidad + '\n';
    });
    navigator.clipboard.writeText(txt).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    });
  };

  const exportXlsx = async () => {

    const XLSX = await loadXLSX();
    if (!resultados || !resultados.length) return;
    const rows = resultados.map(r => ({
      'Material': r.nombre,
      'Cantidad': Number.isInteger(r.cantidad) ? r.cantidad : parseFloat(r.cantidad.toFixed(2)),
      'Unidad': r.unidad,
      'Sección': r.seccion,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 55 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    XLSX.writeFile(wb, 'materiales_airtek_' + Date.now() + '.xlsx');
  };

  const removeResultadoItem = (id) => {
    setResultados(prev => prev.filter(item => item.id !== id));
  };

  const FI2 = ({ label, k, placeholder, type = 'number' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="lbl" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }} title={label}>
        {label}
      </label>
      <input className="fi" type={type} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} placeholder={placeholder || '0'} />
    </div>
  );

  return (
    <div className="fin">
      <div style={{ marginBottom: 18 }}>
        <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>Calculadora de Materiales</h1>
        <p style={{ color: 'var(--tx3)', fontSize: '.85rem' }}>Todos los materiales en una sola lista consolidada</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <label className="lbl">Nombre del Proyecto (opcional)</label>
        <input className="fi" type="text" value={proyecto} onChange={e => setProyecto(e.target.value)}
          placeholder="Ej: Nodo Bella Vista — Instalación ETP" />
      </div>

      {/* Fuentes */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>FUENTES ETP HUAWEI 23006</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Cantidad de fuentes" k="fuentesCantidad" />
          <FI2 label="Alimentación de fuente (AWG)" k="alimentacionFuente" />
          <FI2 label="Cantidad de rectificadores" k="rectificadores" />
          <FI2 label="Cantidad de inversores" k="inversores" />
          <FI2 label="Módulo solar G1" k="moduloSolarG1" />
          <FI2 label="Módulo solar G6" k="moduloSolarG6" />
        </div>
      </div>

      {/* Rack */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>RACK + BATERÍAS PYLONTECH</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Cantidad de racks" k="racksCantidad" />
          <FI2 label="Cantidad de baterías" k="bateriasCantidad" />
          <FI2 label="Jumpers largos" k="jumpersLargos" />
        </div>
      </div>

      {/* Entrada AC */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>ENTRADA AC</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Tipo de aislamiento" k="aislamientoEntradaAC" type="text" placeholder="THW" />
          <FI2 label="Calibre de conductor (AWG)" k="calibreEntradaAC" />
          <FI2 label="Metros lineales" k="metrosEntradaAC" />
          <FI2 label="Racks a conectar" k="racksEntradaAC" />
          <FI2 label="Fuentes a conectar" k="fuentesEntradaAC" />
        </div>
      </div>

      {/* Salida AC */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>SALIDA AC</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Tipo de aislamiento" k="aislamientoSalidaAC" type="text" placeholder="AUTO" />
          <FI2 label="Calibre de conductor (AWG)" k="calibreSalidaAC" />
          <FI2 label="Metros lineales" k="metrosSalidaAC" />
          <FI2 label="Racks a alimentar" k="racksSalidaAC" />
          <FI2 label="PDU AC" k="pduAC" />
        </div>
      </div>

      {/* Salida DC */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>SALIDA DC</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Tipo de aislamiento" k="aislamientoSalidaDC" type="text" placeholder="AUTOMOTRIZ" />
          <FI2 label="Calibre de conductor (AWG)" k="calibreSalidaDC" />
          <FI2 label="Metros lineales" k="metrosSalidaDC" />
          <FI2 label="Racks a alimentar" k="racksSalidaDC" />
          <FI2 label="Equipos #10" k="equipos10" />
          <FI2 label="Equipos #14" k="equipos14" />
        </div>
      </div>

      {/* Escalerillas */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="fd" style={{ fontSize: '.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 14 }}>ESCALERILLAS Y SOPORTES</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px 16px' }}>
          <FI2 label="Soportes de techo" k="soportesCantidad" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <button className="bp" style={{ fontSize: '.88rem', padding: '10px 28px', minWidth: 220 }} onClick={calcular}>
          Calcular Materiales Totales
        </button>
      </div>

      {resultados === null && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--tx3)' }}>
          Complete los valores y presione Calcular
        </div>
      )}

      {resultados !== null && resultados.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--tx3)' }}>
          No hay materiales con cantidad positiva. Ingrese al menos un valor.
        </div>
      )}

      {resultados !== null && resultados.length > 0 && (
        <div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', background: 'var(--bg-elevated)', padding: '8px 12px', fontSize: '.7rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: "'Outfit', 'Montserrat', sans-serif" }}>
              <span>Material</span><span style={{ textAlign: 'center', minWidth: 60 }}>Cantidad</span><span style={{ textAlign: 'center', minWidth: 45 }}>Unidad</span><span style={{ width: 20 }}></span>
            </div>
            {resultados.map((r, i) => {
              const secColors = {
                fuentes: 'var(--amber, #f59e0b)',
                rack: 'var(--purple, #8b5cf6)',
                entrada_ac: 'var(--blue, #0166ff)',
                salida_ac: 'var(--red, #ef4444)',
                salida_dc: 'var(--green, #10b981)',
                escalerillas: '#64748b'
              };
              const c = Number.isInteger(r.cantidad) ? r.cantidad : r.cantidad.toFixed(2);
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto auto', padding: '9px 12px',
                  background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                  borderTop: '1px solid var(--border)', alignItems: 'center', gap: 8
                }}>
                  <div>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: secColors[r.seccion] || '#64748b', marginRight: 8, flexShrink: 0, verticalAlign: 'middle' }}></span>
                    <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{r.nombre}</span>
                  </div>
                  <span className="fm" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green)', textAlign: 'center', minWidth: 60 }}>{c}</span>
                  <span style={{ fontSize: '.78rem', color: 'var(--tx3)', textAlign: 'center', minWidth: 45 }}>{r.unidad}</span>
                  <button onClick={() => removeResultadoItem(r.id)} style={{
                    background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: '4px 6px', fontSize: '.75rem', fontWeight: 'bold'
                  }}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button className="bg" style={{ fontSize: '.84rem', padding: '8px 18px', minWidth: 130 }} onClick={copy}>Copiar lista</button>
            <button className="bs" style={{ fontSize: '.84rem', padding: '8px 18px', minWidth: 130 }} onClick={exportXlsx}>Exportar Excel</button>
          </div>
          <div style={{ marginTop: 8, fontSize: '.72rem', color: 'var(--tx4)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><span style={{ color: 'var(--amber, #f59e0b)' }}>●</span> Fuentes ETP</span>
            <span><span style={{ color: 'var(--purple, #8b5cf6)' }}>●</span> Rack + Baterías</span>
            <span><span style={{ color: 'var(--blue, #0166ff)' }}>●</span> Entrada AC</span>
            <span><span style={{ color: 'var(--red, #ef4444)' }}>●</span> Salida AC</span>
            <span><span style={{ color: 'var(--green, #10b981)' }}>●</span> Salida DC</span>
            <span><span style={{ color: '#64748b' }}>●</span> Escalerillas</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { MaterialesCalc };
export default MaterialesCalc;
