import React, { useState, useRef, useMemo, useEffect } from 'react';
import { loadXLSX } from '@/utils/exportLibs';
import { IconExcel, IconCheckCircle } from '@/components/icons';

    function MaterialesWrapper() {
      const [tab, setTab] = useState(() => localStorage.getItem('airtek_materiales_calc_tab') || 'proyecto');
      const handleTab = (t) => {
        setTab(t);
        try { localStorage.setItem('airtek_materiales_calc_tab', t); } catch(e) {}
      };

      return (
        <div className="fin">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
              <button className={`segmented-btn ${tab === 'proyecto' ? 'active' : ''}`} onClick={() => handleTab('proyecto')}>Materiales Proyecto</button>
              <button className={`segmented-btn ${tab === 'comunidades' ? 'active' : ''}`} onClick={() => handleTab('comunidades')}>Activación Comunidades</button>
              <button className={`segmented-btn ${tab === 'tablas_respaldo' ? 'active' : ''}`} onClick={() => handleTab('tablas_respaldo')}>Armado de Tablas de Respaldo</button>
              <button className={`segmented-btn ${tab === 'unificada' ? 'active' : ''}`} onClick={() => handleTab('unificada')} style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Unir Listas (Consolidado)
              </button>
            </div>
          </div>
          {tab === 'proyecto' && <MaterialesCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'comunidades' && <ComunidadesCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'tablas_respaldo' && <TablasRespaldoCalc onGoUnificada={() => handleTab('unificada')} />}
          {tab === 'unificada' && <ListaUnificadaCalc onNavigateTab={handleTab} />}
        </div>
      );
    }

    const DEFAULT_PROYECTO_FORM = {
      fuentesCantidad: '',
      rectificadores: '',
      inversores: '',
      moduloSolarG1: '',
      moduloSolarG6: '',
      alimentacionFuente: '',
      racksCantidad: '',
      bateriasCantidad: '',
      jumpersLargos: '',
      aislamientoEntradaAC: 'THW',
      calibreEntradaAC: '',
      metrosEntradaAC: '',
      racksEntradaAC: '',
      fuentesEntradaAC: '',
      aislamientoSalidaAC: 'AUTO',
      calibreSalidaAC: '',
      metrosSalidaAC: '',
      racksSalidaAC: '',
      pduAC: '',
      aislamientoSalidaDC: 'AUTOMOTRIZ',
      calibreSalidaDC: '',
      metrosSalidaDC: '',
      racksSalidaDC: '',
      equipos10: '',
      equipos14: '',
      soportesCantidad: ''
    };

    function calcularMaterialesProyecto(f) {
      if (!f) return [];
      const getValNum = (key) => parseFloat(f[key]) || 0;
      const getValText = (key) => f[key] || '';

      // Fuentes
      const fuentesCantidad = getValNum("fuentesCantidad");
      const alimentacionFuente = getValNum("alimentacionFuente");
      const rectificadores = getValNum("rectificadores");
      const inversores = getValNum("inversores");
      const moduloSolarG1 = getValNum("moduloSolarG1");
      const moduloSolarG6 = getValNum("moduloSolarG6");
      let itemsFuentes = [];
      if (fuentesCantidad > 0) {
        itemsFuentes.push({ nombre: "CABLE ROJO AUTOMOTRIZ #2 AWG", cantidad: 1.5 * fuentesCantidad, unidad: "mts", seccion: "fuentes", orden: 1 });
        itemsFuentes.push({ nombre: "CABLE NEGRO AUTOMOTRIZ #2 AWG", cantidad: 1.5 * fuentesCantidad, unidad: "mts", seccion: "fuentes", orden: 2 });
        itemsFuentes.push({ nombre: "TERMINAL DE UN OJO #2", cantidad: 4 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 3 });
        if (alimentacionFuente > 0) {
          itemsFuentes.push({ nombre: `TERMINAL DE OJO #${alimentacionFuente}`, cantidad: 1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 4 });
        }
        itemsFuentes.push({ nombre: "TERMINAL AUTOMOTRIZ AISLADO DE ANILLO DE CALIBRE #10-12 AWG (AMARILLO) DE DIÁMETRO ¼” O 6 MM (M6)", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 5 });
        itemsFuentes.push({ nombre: 'TORNILLO CABEZA HEXAGONAL 5/16"X1"', cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 6 });
        itemsFuentes.push({ nombre: "ARANDELAS 5*16", cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 7 });
        itemsFuentes.push({ nombre: 'TUERCA 5/16"', cantidad: 2 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 8 });
        itemsFuentes.push({ nombre: "CHASIS DE FUENTE DE PODER (PSU) HUAWEI ETP23006-C3A1", cantidad: 1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 9 });
        itemsFuentes.push({ nombre: "MODULO INVERSOR HUAWEI I23003G1 3KVA / 230VAC", cantidad: inversores * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 10 });
        itemsFuentes.push({ nombre: "MODULO RECTIFICADOR HUAWEI R4875G5 48VDC / 75ADC", cantidad: rectificadores * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 11 });
        if (moduloSolarG1 > 0) {
          itemsFuentes.push({ nombre: "MODULO SOLAR SCC (CONTROLADOR DE CARGA SOLAR) SSU (SOLAR SUPPLY UNIT) MPPT HUAWEI S4875G1 4KWPK / 150VOC / 60ASC / 48VDC / 75ADC", cantidad: moduloSolarG1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 12 });
          itemsFuentes.push({ nombre: "CONECTOR PV HUAWEI EPC PARA MODULO SOLAR S4875G1", cantidad: 2 * moduloSolarG1 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 13 });
        }
        if (moduloSolarG6 > 0) {
          itemsFuentes.push({ nombre: "MODULO SOLAR SCC (CONTROLADOR DE CARGA SOLAR) SSU (SOLAR SUPPLY UNIT) MPPT HUAWEI S4875G6 4KWPK / 150VOC / 60ASC / 48VDC / 75ADC", cantidad: moduloSolarG6 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 14 });
          itemsFuentes.push({ nombre: "CABLE PARA MODULO SOLAR S4875G6", cantidad: 1 * moduloSolarG6 * fuentesCantidad, unidad: "und", seccion: "fuentes", orden: 15 });
        }
      }

      // Rack
      const racksCantidad = getValNum("racksCantidad");
      const bateriasCantidad = getValNum("bateriasCantidad");
      const jumpersLargos = getValNum("jumpersLargos");
      let itemsRack = [];
      if (racksCantidad > 0) {
        itemsRack.push({ nombre: "RACK PISO STRIG 42U CERRADO", cantidad: racksCantidad, unidad: "und", seccion: "rack", orden: 100 });
        itemsRack.push({ nombre: "AISLADOR PARA BARRA DE COBRE SM-35", cantidad: 4 * racksCantidad, unidad: "und", seccion: "rack", orden: 102 });
        itemsRack.push({ nombre: "TORNILLO 8mm", cantidad: 8 * racksCantidad, unidad: "und", seccion: "rack", orden: 103 });
      }
      if (bateriasCantidad > 0) {
        itemsRack.push({ nombre: "BATERIA PYLONTECH US5000 / IONES DE LITIO TIPO LFP / 48V / 100 AH", cantidad: bateriasCantidad, unidad: "und", seccion: "rack", orden: 104 });
        itemsRack.push({ nombre: 'TORNILLO CABEZA HEXAGONAL 5/16"X1"', cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 105 });
        itemsRack.push({ nombre: "ARANDELAS 5*16", cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 106 });
        itemsRack.push({ nombre: 'TUERCA 5/16"', cantidad: 2 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 107 });
        itemsRack.push({ nombre: "CABLE DE TIERRA DE BATERIA", cantidad: 1 * bateriasCantidad, unidad: "und", seccion: "rack", orden: 109 });
        const moduloCables = bateriasCantidad - 1;
        if (moduloCables > 0) {
          itemsRack.push({ nombre: "KIT DE CABLES DE MODULO (BATERIA-BATERIA) PARA BATERIAS PYLONTECH US", cantidad: moduloCables, unidad: "und", seccion: "rack", orden: 110 });
        }
      }
      if (jumpersLargos > 0) {
        itemsRack.push({ nombre: "KIT DE CABLES EXTERNOS (BATERIA-INVERSOR) PARA BATERIAS PYLONTECH US / UP", cantidad: jumpersLargos, unidad: "und", seccion: "rack", orden: 108 });
      }

      // Entrada AC
      const metrosEntradaAC = getValNum("metrosEntradaAC");
      const racksEntradaAC = getValNum("racksEntradaAC");
      const fuentesEntradaAC = getValNum("fuentesEntradaAC");
      const calibreEntradaAC = getValNum("calibreEntradaAC");
      const aislamientoEntradaAC = getValText("aislamientoEntradaAC");
      let itemsEntradaAC = [];
      if (metrosEntradaAC > 0 && racksEntradaAC > 0 && fuentesEntradaAC > 0 && calibreEntradaAC > 0 && aislamientoEntradaAC) {
        const total = (metrosEntradaAC + 4) * racksEntradaAC * fuentesEntradaAC;
        itemsEntradaAC.push({ nombre: `CABLE ${aislamientoEntradaAC} #${calibreEntradaAC} (Fase 1)`, cantidad: total, unidad: "mts", seccion: "entrada_ac", orden: 200 });
        itemsEntradaAC.push({ nombre: `CABLE ${aislamientoEntradaAC} #${calibreEntradaAC} (Fase 2)`, cantidad: total, unidad: "mts", seccion: "entrada_ac", orden: 201 });
      }

      // Salida AC
      const metrosSalidaAC = getValNum("metrosSalidaAC");
      const racksSalidaAC = getValNum("racksSalidaAC");
      const calibreSalidaAC = getValNum("calibreSalidaAC");
      const aislamientoSalidaAC = getValText("aislamientoSalidaAC");
      const pduAC = getValNum("pduAC");
      let itemsSalidaAC = [];
      if (metrosSalidaAC > 0 && racksSalidaAC > 0 && calibreSalidaAC > 0 && aislamientoSalidaAC) {
        const total = ((metrosSalidaAC + 4) * racksSalidaAC) * 2;
        itemsSalidaAC.push({ nombre: `CABLE ${aislamientoSalidaAC} #${calibreSalidaAC} (Fase 1)`, cantidad: total, unidad: "mts", seccion: "salida_ac", orden: 300 });
        itemsSalidaAC.push({ nombre: `CABLE ${aislamientoSalidaAC} #${calibreSalidaAC} (Fase 2)`, cantidad: total, unidad: "mts", seccion: "salida_ac", orden: 301 });
      }
      if (pduAC > 0) {
        itemsSalidaAC.push({ nombre: "PDU DC INPUT 2 CHANNELS 63A/1P, OUTPUT 8(2X4) CHANNELS 32A/1P", cantidad: pduAC, unidad: "und", seccion: "salida_ac", orden: 302 });
        itemsSalidaAC.push({ nombre: "[ENE-BRE-MAG-002] BREAKER MAGNETOTÉRMICO DE 2X20 AMP", cantidad: 4 * pduAC, unidad: "und", seccion: "salida_ac", orden: 303 });
        itemsSalidaAC.push({ nombre: "BARRA DE DISTRIBUCION PARA BREAKER TERMOMAGNETICO DE 2 POLOS 63AMP, 240/410 VOLTS", cantidad: 8 * pduAC, unidad: "und", seccion: "salida_ac", orden: 304 });
      }
      if (racksSalidaAC > 0) {
        itemsSalidaAC.push({ nombre: "TOMACORRIENTE DOBLE AC 120VOTS", cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 305 });
        itemsSalidaAC.push({ nombre: 'CAJERA METALICA DE 4X2"', cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 306 });
        itemsSalidaAC.push({ nombre: 'TAPA PLASTICA PARA TOMACORRIENTE DOBLE 4X2"', cantidad: 2 * racksSalidaAC, unidad: "und", seccion: "salida_ac", orden: 307 });
      }

      // Salida DC
      const metrosSalidaDC = getValNum("metrosSalidaDC");
      const racksSalidaDC = getValNum("racksSalidaDC");
      const calibreSalidaDC = getValNum("calibreSalidaDC");
      const aislamientoSalidaDC = getValText("aislamientoSalidaDC");
      const equipos10 = getValNum("equipos10");
      const equipos14 = getValNum("equipos14");
      let itemsSalidaDC = [];
      if (metrosSalidaDC > 0 && racksSalidaDC > 0 && calibreSalidaDC > 0 && aislamientoSalidaDC) {
        const total = ((metrosSalidaDC + 4) * racksSalidaDC) * 2;
        itemsSalidaDC.push({ nombre: `CABLE ${aislamientoSalidaDC} #${calibreSalidaDC} (ROJO)`, cantidad: total, unidad: "mts", seccion: "salida_dc", orden: 400 });
        itemsSalidaDC.push({ nombre: `CABLE ${aislamientoSalidaDC} #${calibreSalidaDC} (NEGRO)`, cantidad: total, unidad: "mts", seccion: "salida_dc", orden: 401 });
      }
      if (racksSalidaDC > 0) {
        itemsSalidaDC.push({ nombre: "PDU DC INPUT 2 CHANNELS 63A/1P, OUTPUT 8(2X4) CHANNELS 32A/1P", cantidad: racksSalidaDC, unidad: "und", seccion: "salida_dc", orden: 402 });
        itemsSalidaDC.push({ nombre: "CONECTOR PARA PEINE ELÉCTRICO, 63A", cantidad: 2 * racksSalidaDC, unidad: "und", seccion: "salida_dc", orden: 403 });
      }
      if (equipos10 > 0) {
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #10 (POS+)", cantidad: 5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 404 });
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #10 (NEG-)", cantidad: 5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 405 });
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #10 VERDE (GND)", cantidad: 2.5 * equipos10, unidad: "mts", seccion: "salida_dc", orden: 405.5 });
        itemsSalidaDC.push({ nombre: "TERMINAL AUTOMOTRIZ AISLADO DE ANILLO DE CALIBRE #10-12 AWG (AMARILLO) DE DIÁMETRO ¼” O 6 MM (M6)", cantidad: (4 * equipos10) + 1, unidad: "und", seccion: "salida_dc", orden: 406 });
      }
      if (equipos14 > 0) {
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #14 (POS+)", cantidad: 5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 407 });
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #14 (NEG-)", cantidad: 5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 408 });
        itemsSalidaDC.push({ nombre: "CABLE AUTOMOTRIZ #14 VERDE (GND)", cantidad: 2.5 * equipos14, unidad: "mts", seccion: "salida_dc", orden: 408.5 });
        itemsSalidaDC.push({ nombre: 'CONECTOR TERMINAL HORQUILLA TIPO Y PARA 1/8" (AZUL)', cantidad: (4 * equipos14) + 1, unidad: "und", seccion: "salida_dc", orden: 409 });
      }

      // Escalerillas
      const soportesCantidad = getValNum("soportesCantidad");
      let itemsEscalerillas = [];
      if (soportesCantidad > 0) {
        itemsEscalerillas.push({ nombre: "ACOPLADOR GALVANIZADO PARA BANDEJA METALICA", cantidad: soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 500 });
        itemsEscalerillas.push({ nombre: "SOPORTE PARA COLGAR BANDEJA METALICA DE ALTA RESISTENCIA (RIEL UNISTRURT DE 30CM)", cantidad: soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 501 });
        itemsEscalerillas.push({ nombre: "SOPORTE PARA ANCLAJE DE BANDEJA METALICA EN TECHO", cantidad: 2 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 502 });
        itemsEscalerillas.push({ nombre: 'TUERCA PARA BARRA ROSCADA DE 1/2"', cantidad: 8 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 503 });
        itemsEscalerillas.push({ nombre: 'ARANDELA PARA BARRA ROSCADA DE 1/2"', cantidad: 8 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 504 });
        itemsEscalerillas.push({ nombre: "TORNILLOS PARA RAMPLUNG NARANJA", cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 505 });
        itemsEscalerillas.push({ nombre: 'RAMPLUG NARANJA 3/8"', cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 506 });
        itemsEscalerillas.push({ nombre: "ARANDELAS 5*16", cantidad: 4 * soportesCantidad, unidad: "und", seccion: "escalerillas", orden: 507 });
      }

      let todos = [
        ...itemsFuentes,
        ...itemsRack,
        ...itemsEntradaAC,
        ...itemsSalidaAC,
        ...itemsSalidaDC,
        ...itemsEscalerillas
      ];

      const mapa = new Map();
      for (let item of todos) {
        if (item.cantidad === 0) continue;
        const key = item.nombre;
        if (mapa.has(key)) {
          mapa.get(key).cantidad += item.cantidad;
        } else {
          mapa.set(key, { nombre: item.nombre, cantidad: item.cantidad, unidad: item.unidad, seccion: item.seccion, orden: item.orden });
        }
      }

      let consolidado = Array.from(mapa.values());
      consolidado.sort((a, b) => a.orden - b.orden);
      return consolidado.map((item, idx) => ({ ...item, id: idx }));
    }

    function MaterialesCalc({ onGoUnificada }) {
      const [showConfirm, setShowConfirm] = useState(false);
      const [proyecto, setProyecto] = useState(() => localStorage.getItem('airtek_calc_proyecto_nombre') || '');
      const [f, setF] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_calc_proyecto_form');
          if (saved) return { ...DEFAULT_PROYECTO_FORM, ...JSON.parse(saved) };
        } catch(e) {}
        return DEFAULT_PROYECTO_FORM;
      });
      const [resultados, setResultados] = useState(() => {
        try {
          const saved = localStorage.getItem('airtek_calc_proyecto_form');
          if (saved) {
            const res = calcularMaterialesProyecto(JSON.parse(saved));
            if (res && res.length > 0) return res;
          }
        } catch(e) {}
        return null;
      });

      useEffect(() => {
        try {
          localStorage.setItem('airtek_calc_proyecto_form', JSON.stringify(f));
          localStorage.setItem('airtek_calc_proyecto_nombre', proyecto);
        } catch(e) {}
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

    // ═══════════════════════════════════════════════════
    // APP ROOT
    // ═══════════════════════════════════════════════════
    
        const MATERIALES_ACTIVACION = [
      { id: 1, nombre: "PANEL SOLAR DE 580W A 600W", base: 1 },
      { id: 2, nombre: "RIEL UNISTRUT LARGO DOS METROS CUARENTA", base: 1 },
      { id: 3, nombre: "CONECTORES END CLAMP R2", base: 4 },
      { id: 4, nombre: "TORNILLOS PARA RAMPLUNG NARANJA", base: 10 },
      { id: 5, nombre: "RAMPLUG NARANJA 3/8\"", base: 10 },
      { id: 6, nombre: "ARANDELA DE 1/4", base: 10 },
      { id: 7, nombre: "KIT DE TORNILLO Y TUERCA CON RESORTE PARA PERFIL UNISTRUT DE BANDEJA METALICA", base: 6 },
      { id: 8, nombre: "TORNILLO CABEZA HEXAGONAL 6MM\"X1 3/4\"", base: 4 },
      { id: 9, nombre: "KIT DE RESPALDO COMUNIDAD TRADICIONAL", base: 1 },
      { id: 10, nombre: "BATERIA GREEN POINT / IONES DE LITIO TIPO LFP / 24V / 120 AH", base: 1 }
    ];

    function calcularMaterialesComunidades(respaldos) {
      const num = parseFloat(respaldos) || 0;
      if (num <= 0) return [];
      return MATERIALES_ACTIVACION.map((m, idx) => ({
        id: 'com_' + (m.id || idx),
        nombre: m.nombre,
        cantidad: m.base * num,
        unidad: m.unidad || 'und',
        seccion: 'comunidades',
        requeridaPorUnidad: m.base
      }));
    }

    function ComunidadesCalc({ onGoUnificada }) {
      const [respaldos, setRespaldos] = useState(() => localStorage.getItem('energia_act_comunidades_resp') || '6');

      useEffect(() => {
        localStorage.setItem('energia_act_comunidades_resp', respaldos);
      }, [respaldos]);

      const numResp = parseFloat(respaldos) || 0;
      const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

      const resultados = useMemo(() => {
        const r = numResp > 0 ? numResp : 0;
        return MATERIALES_ACTIVACION.map(m => ({
          id: m.id,
          nombre: m.nombre,
          requerida: m.base,
          respaldos: r,
          total: m.base * r
        }));
      }, [numResp]);

      const copy = () => {
        if (!resultados || !resultados.length) return;
        let txt = 'AIRTEK - MATERIALES ACTIVACION COMUNIDADES (COMUNIDAD TRADICIONAL)\n';
        txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
        txt += `Número de Respaldos: ${numResp}\n`;
        txt += '------------------------------------------------------------\n\n';
        resultados.forEach(r => {
          txt += `${r.nombre}: ${fmt(r.total)} (Requerido: ${fmt(r.requerida)}/respaldo)\n`;
        });
        navigator.clipboard.writeText(txt).then(() => {
          alert('¡Listado copiado al portapapeles!');
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          alert('¡Listado copiado al portapapeles!');
        });
      };

      const exportXlsx = async () => {

        const XLSX = await loadXLSX();
        if (!resultados || !resultados.length) return;
        const rows = resultados.map((r, idx) => ({
          'MATERIAL': r.nombre,
          'UNIDAD REQUERIDA': fmt(r.requerida),
          'NUMERO DE RESPALDOS': idx === 0 ? numResp : '',
          'MATERIAL TOTAL': fmt(r.total)
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 65 }, { wch: 20 }, { wch: 24 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Activacion C.Tradicional');
        XLSX.writeFile(wb, 'Materiales_Activacion_Comunidades_' + Date.now() + '.xlsx');
      };

      return (
        <div className="fin">
          <div style={{ marginBottom: 18 }}>
            <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
              Calculadora Materiales - Activación Comunidades
            </h1>
            <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
              Activación C. Tradicional - listado de materiales por número de respaldos
            </p>
          </div>

          {/* Tarjeta de Entrada: Solo Número de Respaldos (Idéntico a la hoja Excel) */}
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px 18px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
                  Número de respaldos
                </label>
                <input
                  className="fi fm"
                  type="number"
                  min="0"
                  value={respaldos}
                  onChange={e => setRespaldos(e.target.value)}
                  placeholder="Ej: 6"
                  style={{ fontSize: '.95rem', fontWeight: 700 }}
                />
              </div>

              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
                    Respaldos a Construir
                  </div>
                  <div style={{ fontSize: '.76rem', color: 'var(--tx2)', marginTop: 2 }}>
                    C. Tradicional
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--blue)' }}>
                  {numResp} <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--tx3)' }}>respaldos</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lista Generada Directamente */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: 'var(--bg-card)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 140px 140px',
              background: 'var(--bg-elevated)',
              padding: '10px 16px',
              fontSize: '.7rem',
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              fontFamily: "'Outfit', 'Montserrat', sans-serif"
            }}>
              <span>Material</span>
              <span style={{ textAlign: 'center' }}>Unidad Requerida</span>
              <span style={{ textAlign: 'center' }}>Número de Respaldos</span>
              <span style={{ textAlign: 'right' }}>Material Total</span>
            </div>
            {resultados.map((r, i) => (
              <div key={r.id || i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 140px 140px',
                padding: '10px 16px',
                background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                borderTop: '1px solid var(--border)',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ fontSize: '.84rem', color: 'var(--tx1)', fontWeight: 500 }}>
                  {r.nombre}
                </span>
                <span style={{ fontSize: '.84rem', color: 'var(--tx2)', textAlign: 'center', fontFamily: "'Outfit', monospace" }}>
                  {fmt(r.requerida)}
                </span>
                <span style={{ fontSize: '.84rem', color: 'var(--tx2)', textAlign: 'center', fontFamily: "'Outfit', monospace" }}>
                  {fmt(r.respaldos)}
                </span>
                <span className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right' }}>
                  {fmt(r.total)}
                </span>
              </div>
            ))}
          </div>

          {/* Botones de Acción */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="bg" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140 }} onClick={copy}>
              Copiar lista
            </button>
            <button className="bs" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportXlsx}>
              <IconExcel size={15} color="#10b981" />
              Descargar Excel (.xlsx)
            </button>
            {onGoUnificada && (
              <button className="bp" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 160, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onGoUnificada}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Unir con otras listas
              </button>
            )}
          </div>
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // CALCULADORA: ARMADO DE TABLAS DE RESPALDO
    // ═══════════════════════════════════════════════════

    const MATERIALES_TABLAS_RESPALDO = [
      { id: 1, nombre: "CARGADOR SOLAR CON CONEXIÓN DE TORNILLO MPPT. EPEVER. (XTRA3210N G3)", base: 1, unidad: "und" },
      { id: 2, nombre: "INVERSOR DE 350W ONDA PURA 24V MARCA EPERVER", base: 1, unidad: "und" },
      { id: 3, nombre: "TERMINAL PARA CABLE NUMERO 6 - 8 AWG", base: 6, unidad: "und" },
      { id: 4, nombre: "CABLE AUTOMOTRIZ #8 ROJO", base: 5, unidad: "mts" },
      { id: 5, nombre: "CABLE AUTOMOTRIZ #8 NEGRO", base: 5, unidad: "mts" },
      { id: 6, nombre: "CABLE THHN #12 ROJO", base: 1, unidad: "mts" },
      { id: 7, nombre: "CABLE THHN #12 BLANCO", base: 1, unidad: "mts" },
      { id: 8, nombre: "CABLE THHN #12 VERDE", base: 1, unidad: "mts" },
      { id: 9, nombre: 'CABLE ST 2X10"', base: 5, unidad: "mts" },
      { id: 10, nombre: "CAJERA WAREMALL METALICA 4X2 PARA TOMACORRIENTE", base: 1, unidad: "und" },
      { id: 11, nombre: "TAPA TOMACORRIENTE DOBLE", base: 1, unidad: "und" },
      { id: 12, nombre: "TOMACORRIENTE DOBLE. 125 VOLTS, 15 AMP  MARCA COOPER", base: 1, unidad: "und" },
      { id: 13, nombre: "CONECTORES MC4 PARA PANELES FOTOVOLTAICO X2 PARES", base: 1, unidad: "und" },
      { id: 14, nombre: "BREAKER MAGNETOTÉRMICO DE 2X20 AMP", base: 2, unidad: "und" },
      { id: 15, nombre: "BREAKER TERMOMAGNETICO 2X40 AMP", base: 1, unidad: "und" },
      { id: 16, nombre: "BREAKER MAGNETOTÉRMICO 2 X 2A/3A", base: 1, unidad: "und" },
      { id: 17, nombre: "RIEL DIN PARA CONEXIONES DE COMPONENTES DE TABLEROS ELECTRICOS", base: 0.2, unidad: "mts" },
      { id: 18, nombre: "CANALETA GRIS RANURADA 40X40 DE 2 METROS DE LARGO", base: 2, unidad: "und" },
      { id: 19, nombre: 'TORNILLO PARA DRYWALL 1/2"', base: 30, unidad: "und" }
    ];

    function calcularMaterialesTablas(cantTradicional, cantNodo) {
      const numTrad = parseFloat(cantTradicional) || 0;
      const numNodo = parseFloat(cantNodo) || 0;
      const totalTablas = (numTrad + numNodo) > 0 ? (numTrad + numNodo) : (parseFloat(cantTradicional) || 0);
      if (totalTablas <= 0) return [];
      return MATERIALES_TABLAS_RESPALDO.map((m, idx) => ({
        id: 'tab_' + (m.id || idx),
        nombre: m.nombre,
        cantidad: m.base * totalTablas,
        unidad: m.unidad || 'und',
        seccion: 'tablas_respaldo',
        requeridaPorUnidad: m.base
      }));
    }

    function TablasRespaldoCalc({ onGoUnificada }) {
      const [cantTradicional, setCantTradicional] = useState(() => localStorage.getItem('airtek_tablas_resp_trad') || '5');
      const [cantNodo, setCantNodo] = useState(() => localStorage.getItem('airtek_tablas_resp_nodo') || '');

      const numTrad = parseFloat(cantTradicional) || 0;
      const numNodo = parseFloat(cantNodo) || 0;
      const totalTablas = (numTrad + numNodo) > 0 ? (numTrad + numNodo) : (parseFloat(cantTradicional) || 1);

      useEffect(() => {
        localStorage.setItem('airtek_tablas_resp_trad', cantTradicional);
        localStorage.setItem('airtek_tablas_resp_nodo', cantNodo);
      }, [cantTradicional, cantNodo]);

      const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

      const resultados = useMemo(() => {
        const tot = totalTablas;
        return MATERIALES_TABLAS_RESPALDO.map(m => ({
          id: m.id,
          nombre: m.nombre,
          requerida: m.base,
          unidad: m.unidad,
          tablas: tot,
          total: m.base * tot
        }));
      }, [totalTablas]);

      const copy = () => {
        if (!resultados || !resultados.length) return;
        let txt = 'AIRTEK - ARMADO DE TABLAS DE RESPALDO\n';
        txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
        txt += `Comunidad Tradicional: ${numTrad} tablas | Comunidad Nodo: ${numNodo} tablas | Total: ${totalTablas} tablas\n`;
        txt += '------------------------------------------------------------\n\n';
        resultados.forEach(r => {
          txt += `${r.nombre}: ${fmt(r.total)} ${r.unidad}\n`;
        });
        navigator.clipboard.writeText(txt).then(() => {
          alert('¡Listado copiado al portapapeles!');
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          alert('¡Listado copiado al portapapeles!');
        });
      };

      const exportXlsx = async () => {

        const XLSX = await loadXLSX();
        if (!resultados || !resultados.length) return;
        const rows = resultados.map(r => ({
          'MATERIAL': r.nombre,
          'MATERIAL TOTAL': `${fmt(r.total)} ${r.unidad}`
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Agregar caja lateral de Cantidad de Tablas a Construir
        ws['F1'] = { v: 'CANTIDAD DE TABLAS A CONSTRUIR', t: 's' };
        ws['F2'] = { v: 'COMUNIDAD TRADICIONAL', t: 's' };
        ws['G2'] = { v: numTrad, t: 'n' };
        ws['F3'] = { v: 'COMUNIDAD NODO', t: 's' };
        ws['G3'] = { v: numNodo || '', t: numNodo ? 'n' : 's' };
        ws['F4'] = { v: 'TOTAL TABLAS', t: 's' };
        ws['G4'] = { v: totalTablas, t: 'n' };

        ws['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 4 }, { wch: 30 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Armado de Tablas de Respaldo');
        XLSX.writeFile(wb, 'Materiales_Armado_Tablas_Respaldo_' + Date.now() + '.xlsx');
      };

      return (
        <div className="fin">
          <div style={{ marginBottom: 18 }}>
            <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
              Calculadora Materiales - Armado de Tablas de Respaldo
            </h1>
            <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
              Cálculo y cómputo de componentes para construcción de tablas de respaldo fotovoltaicas.
            </p>
          </div>

          {/* Tarjeta de Entrada: Cantidad de Tablas a Construir */}
          <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              Cantidad de Tablas a Construir
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 18px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
                  Comunidad Tradicional
                </label>
                <input
                  className="fi fm"
                  type="number"
                  min="0"
                  value={cantTradicional}
                  onChange={e => setCantTradicional(e.target.value)}
                  placeholder="Ej: 5"
                  style={{ fontSize: '.92rem', fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="lbl" style={{ marginBottom: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--tx2)' }}>
                  Comunidad Nodo (Opcional)
                </label>
                <input
                  className="fi fm"
                  type="number"
                  min="0"
                  value={cantNodo}
                  onChange={e => setCantNodo(e.target.value)}
                  placeholder="Ej: 0"
                  style={{ fontSize: '.92rem', fontWeight: 700 }}
                />
              </div>

              {/* Indicador de Total de Tablas */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '.68rem', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>
                    Total Tablas a Construir
                  </div>
                  <div style={{ fontSize: '.76rem', color: 'var(--tx2)', marginTop: 2 }}>
                    Tradicional: {numTrad} | Nodo: {numNodo}
                  </div>
                </div>
                <div className="fm" style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--blue)' }}>
                  {totalTablas} <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--tx3)' }}>tablas</span>
                </div>
              </div>
            </div>
          </div>

          {/* Listado Directo: Solo Material y Material Total */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16, background: 'var(--bg-card)' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 180px',
              background: 'var(--bg-elevated)',
              padding: '12px 20px',
              fontSize: '.72rem',
              color: 'var(--tx3)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              fontFamily: "'Outfit', 'Montserrat', sans-serif"
            }}>
              <span>Material</span>
              <span style={{ textAlign: 'right' }}>Material Total</span>
            </div>
            {resultados.map((r, i) => (
              <div key={r.id || i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 180px',
                padding: '12px 20px',
                background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                borderTop: '1px solid var(--border)',
                alignItems: 'center',
                gap: 12
              }}>
                <span style={{ fontSize: '.86rem', color: 'var(--tx1)', fontWeight: 500 }}>
                  {r.nombre}
                </span>
                <span className="fm" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  {fmt(r.total)}
                  <span style={{
                    fontSize: '.72rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 6,
                    background: r.unidad === 'mts' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(1, 102, 255, 0.12)',
                    color: r.unidad === 'mts' ? '#10b981' : 'var(--blue)'
                  }}>
                    {r.unidad}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* Botones de Acción */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button className="bg" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140 }} onClick={copy}>
              Copiar lista
            </button>
            <button className="bs" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 140, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportXlsx}>
              <IconExcel size={15} color="#10b981" />
              Descargar Excel (.xlsx)
            </button>
            {onGoUnificada && (
              <button className="bp" style={{ fontSize: '.84rem', padding: '9px 20px', minWidth: 160, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onGoUnificada}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Unir con otras listas
              </button>
            )}
          </div>
        </div>
      );
    }

    // ═══════════════════════════════════════════════════
    // LISTA UNIFICADA Y CONSOLIDADA DE MATERIALES
    // ═══════════════════════════════════════════════════
    function ListaUnificadaCalc({ onNavigateTab }) {
      // Selección de calculadoras activas a combinar
      const [incProyecto, setIncProyecto] = useState(() => localStorage.getItem('airtek_uni_inc_proy') !== 'false');
      const [incComunidades, setIncComunidades] = useState(() => localStorage.getItem('airtek_uni_inc_com') !== 'false');
      const [incTablas, setIncTablas] = useState(() => localStorage.getItem('airtek_uni_inc_tab') !== 'false');

      // Modo de visualización: 'consolidado' (sumado) o 'desglosado' (por calculadora)
      const [viewMode, setViewMode] = useState('consolidado');

      // Estados locales sincronizados para edición rápida en vivo
      const [respaldos, setRespaldos] = useState(() => localStorage.getItem('energia_act_comunidades_resp') || '6');
      const [cantTrad, setCantTrad] = useState(() => localStorage.getItem('airtek_tablas_resp_trad') || '5');
      const [cantNodo, setCantNodo] = useState(() => localStorage.getItem('airtek_tablas_resp_nodo') || '');

      // Guardar preferencias de inclusión
      useEffect(() => {
        localStorage.setItem('airtek_uni_inc_proy', incProyecto);
        localStorage.setItem('airtek_uni_inc_com', incComunidades);
        localStorage.setItem('airtek_uni_inc_tab', incTablas);
      }, [incProyecto, incComunidades, incTablas]);

      // Guardar cambios rápidos de parámetros
      useEffect(() => {
        localStorage.setItem('energia_act_comunidades_resp', respaldos);
      }, [respaldos]);

      useEffect(() => {
        localStorage.setItem('airtek_tablas_resp_trad', cantTrad);
        localStorage.setItem('airtek_tablas_resp_nodo', cantNodo);
      }, [cantTrad, cantNodo]);

      // Cargar datos actuales de proyecto
      const proyectoForm = useMemo(() => {
        try {
          const s = localStorage.getItem('airtek_calc_proyecto_form');
          if (s) return { ...DEFAULT_PROYECTO_FORM, ...JSON.parse(s) };
        } catch(e) {}
        return DEFAULT_PROYECTO_FORM;
      }, []);

      const proyectoNombre = useMemo(() => {
        return localStorage.getItem('airtek_calc_proyecto_nombre') || '';
      }, []);

      // Cálculo de cada lista individual
      const proyItems = useMemo(() => {
        if (!incProyecto) return [];
        return calcularMaterialesProyecto(proyectoForm);
      }, [incProyecto, proyectoForm]);

      const comItems = useMemo(() => {
        if (!incComunidades) return [];
        return calcularMaterialesComunidades(respaldos);
      }, [incComunidades, respaldos]);

      const tabItems = useMemo(() => {
        if (!incTablas) return [];
        return calcularMaterialesTablas(cantTrad, cantNodo);
      }, [incTablas, cantTrad, cantNodo]);

      const fmt = (n) => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));

      // Consolidación y suma inteligente de materiales comunes
      const itemsConsolidados = useMemo(() => {
        const mapa = new Map();

        const addItems = (items, origenNombre, origenColor) => {
          items.forEach(it => {
            if (!it.cantidad || it.cantidad <= 0) return;
            const normKey = it.nombre.trim().toUpperCase();
            if (!mapa.has(normKey)) {
              mapa.set(normKey, {
                nombre: it.nombre,
                cantidad: it.cantidad,
                unidad: it.unidad || 'und',
                desglose: [{ origen: origenNombre, color: origenColor, cantidad: it.cantidad }]
              });
            } else {
              const entry = mapa.get(normKey);
              entry.cantidad += it.cantidad;
              entry.desglose.push({ origen: origenNombre, color: origenColor, cantidad: it.cantidad });
            }
          });
        };

        if (incProyecto && proyItems.length > 0) {
          addItems(proyItems, 'Proyecto', '#0166ff');
        }
        if (incComunidades && comItems.length > 0) {
          addItems(comItems, 'Comunidades', '#f59e0b');
        }
        if (incTablas && tabItems.length > 0) {
          addItems(tabItems, 'Tablas de Respaldo', '#10b981');
        }

        return Array.from(mapa.values());
      }, [incProyecto, incComunidades, incTablas, proyItems, comItems, tabItems]);

      const totalCalculadorasActivas = (incProyecto ? 1 : 0) + (incComunidades ? 1 : 0) + (incTablas ? 1 : 0);

      // Copiar texto formateado
      const copyConsolidado = () => {
        if (!itemsConsolidados || itemsConsolidados.length === 0) return;
        let txt = 'AIRTEK - LISTA UNIFICADA Y CONSOLIDADA DE MATERIALES\n';
        txt += 'Fecha: ' + new Date().toLocaleString() + '\n';
        txt += 'Listas Unidas: ';
        let listasNombres = [];
        if (incProyecto) listasNombres.push(`Proyecto (${proyItems.length} materiales)`);
        if (incComunidades) listasNombres.push(`Activación Comunidades (${respaldos} respaldos)`);
        if (incTablas) listasNombres.push(`Armado Tablas (${(parseFloat(cantTrad)||0) + (parseFloat(cantNodo)||0)} tablas)`);
        txt += listasNombres.join(' + ') + '\n';
        txt += 'Total Materiales Consolidados: ' + itemsConsolidados.length + '\n';
        txt += '------------------------------------------------------------\n\n';

        itemsConsolidados.forEach((r, idx) => {
          const desgloseStr = r.desglose.length > 1
            ? ' (' + r.desglose.map(d => `${d.origen}: ${fmt(d.cantidad)} ${r.unidad}`).join(' + ') + ')'
            : '';
          txt += `${idx + 1}. ${r.nombre}: ${fmt(r.cantidad)} ${r.unidad}${desgloseStr}\n`;
        });

        navigator.clipboard.writeText(txt).then(() => {
          alert('¡Lista consolidada copiada al portapapeles!');
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
          alert('¡Lista consolidada copiada al portapapeles!');
        });
      };

      // Exportar a Excel con hojas múltiples
      const exportExcelConsolidado = async () => {
        const XLSX = await loadXLSX();
        if (!itemsConsolidados || itemsConsolidados.length === 0) return;
        const wb = XLSX.utils.book_new();

        // 1. Hoja Consolidado General
        const rowsConsolidado = itemsConsolidados.map(r => ({
          'MATERIAL': r.nombre,
          'CANTIDAD TOTAL': fmt(r.cantidad),
          'UNIDAD': r.unidad,
          'ORIGEN / DESGLOSE': r.desglose.map(d => `${d.origen}: ${fmt(d.cantidad)} ${r.unidad}`).join(' | ')
        }));
        const wsConsolidado = XLSX.utils.json_to_sheet(rowsConsolidado);
        wsConsolidado['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 12 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado General');

        // 2. Hoja Materiales Proyecto (si está seleccionada)
        if (incProyecto && proyItems.length > 0) {
          const rowsProy = proyItems.map(p => ({
            'MATERIAL': p.nombre,
            'CANTIDAD': fmt(p.cantidad),
            'UNIDAD': p.unidad,
            'SECCIÓN': p.seccion || 'Proyecto'
          }));
          const wsProy = XLSX.utils.json_to_sheet(rowsProy);
          wsProy['!cols'] = [{ wch: 65 }, { wch: 16 }, { wch: 12 }, { wch: 20 }];
          XLSX.utils.book_append_sheet(wb, wsProy, 'Materiales Proyecto');
        }

        // 3. Hoja Activación Comunidades (si está seleccionada)
        if (incComunidades && comItems.length > 0) {
          const rowsCom = comItems.map((c, i) => ({
            'MATERIAL': c.nombre,
            'UNIDAD REQUERIDA': fmt(c.requeridaPorUnidad || 0),
            'NUMERO DE RESPALDOS': i === 0 ? (parseFloat(respaldos) || 0) : '',
            'MATERIAL TOTAL': fmt(c.cantidad),
            'UNIDAD': c.unidad
          }));
          const wsCom = XLSX.utils.json_to_sheet(rowsCom);
          wsCom['!cols'] = [{ wch: 65 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 12 }];
          XLSX.utils.book_append_sheet(wb, wsCom, 'Activacion Comunidades');
        }

        // 4. Hoja Armado de Tablas de Respaldo (si está seleccionada)
        if (incTablas && tabItems.length > 0) {
          const numTrad = parseFloat(cantTrad) || 0;
          const numNodo = parseFloat(cantNodo) || 0;
          const totalTablas = (numTrad + numNodo) > 0 ? (numTrad + numNodo) : (parseFloat(cantTrad) || 0);

          const rowsTab = tabItems.map(t => ({
            'MATERIAL': t.nombre,
            'MATERIAL TOTAL': `${fmt(t.cantidad)} ${t.unidad}`
          }));
          const wsTab = XLSX.utils.json_to_sheet(rowsTab);
          wsTab['D1'] = { v: 'CANTIDAD DE TABLAS A CONSTRUIR', t: 's' };
          wsTab['D2'] = { v: 'COMUNIDAD TRADICIONAL', t: 's' };
          wsTab['E2'] = { v: numTrad, t: 'n' };
          wsTab['D3'] = { v: 'COMUNIDAD NODO', t: 's' };
          wsTab['E3'] = { v: numNodo || '', t: numNodo ? 'n' : 's' };
          wsTab['D4'] = { v: 'TOTAL TABLAS', t: 's' };
          wsTab['E4'] = { v: totalTablas, t: 'n' };
          wsTab['!cols'] = [{ wch: 65 }, { wch: 20 }, { wch: 4 }, { wch: 30 }, { wch: 14 }];
          XLSX.utils.book_append_sheet(wb, wsTab, 'Tablas de Respaldo');
        }

        XLSX.writeFile(wb, 'Materiales_Consolidado_Airtek_' + Date.now() + '.xlsx');
      };

      return (
        <div className="fin">
          {/* Encabezado */}
          <div style={{ marginBottom: 18 }}>
            <h1 className="fd" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--tx1)', marginBottom: 4 }}>
              Calculadora de Materiales — Lista Unificada y Consolidada
            </h1>
            <p style={{ color: 'var(--tx3)', fontSize: '.85rem', margin: 0 }}>
              Combina y suma automáticamente los materiales de 2 o 3 calculadoras en una sola lista unificada para compras y despacho de almacén.
            </p>
          </div>

          {/* Tarjetas de Selección de Calculadoras a Combinar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 18 }}>
            
            {/* Tarjeta 1: Materiales de Proyecto */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incProyecto ? '#0166ff' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incProyecto ? '0 4px 20px rgba(1, 102, 255, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incProyecto}
                    onChange={e => setIncProyecto(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#0166ff', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incProyecto ? '#0166ff' : 'var(--tx1)' }}>
                      Materiales Proyecto
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      Fuentes ETP, Racks, Baterías, AC/DC
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incProyecto ? 'rgba(1, 102, 255, 0.12)' : 'var(--bg-elevated)',
                  color: incProyecto ? '#0166ff' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {proyItems.length} materiales
                </span>
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--tx2)', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {proyectoNombre ? `Proyecto: ${proyectoNombre}` : (proyItems.length > 0 ? 'Parámetros configurados' : 'Sin parámetros calculados')}
                </span>
                <button
                  type="button"
                  className="bs"
                  style={{ padding: '3px 8px', fontSize: '.7rem' }}
                  onClick={() => onNavigateTab && onNavigateTab('proyecto')}
                >
                  Configurar
                </button>
              </div>
            </div>

            {/* Tarjeta 2: Activación Comunidades */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incComunidades ? '#f59e0b' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incComunidades ? '0 4px 20px rgba(245, 158, 11, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incComunidades}
                    onChange={e => setIncComunidades(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incComunidades ? '#f59e0b' : 'var(--tx1)' }}>
                      Activación Comunidades
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      10 materiales catalogados
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incComunidades ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-elevated)',
                  color: incComunidades ? '#f59e0b' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {comItems.length} materiales
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <label className="lbl" style={{ margin: 0, fontSize: '.74rem', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>
                  Número de respaldos:
                </label>
                <input
                  className="fi fm"
                  type="number"
                  min="0"
                  value={respaldos}
                  onChange={e => setRespaldos(e.target.value)}
                  style={{ width: 80, padding: '4px 8px', fontSize: '.84rem', fontWeight: 700, textAlign: 'center' }}
                  placeholder="6"
                  disabled={!incComunidades}
                />
              </div>
            </div>

            {/* Tarjeta 3: Armado de Tablas de Respaldo */}
            <div className="card" style={{
              background: 'var(--bg-card)',
              border: `2px solid ${incTablas ? '#10b981' : 'var(--border)'}`,
              borderRadius: 12,
              padding: '16px 18px',
              transition: 'all .2s ease',
              boxShadow: incTablas ? '0 4px 20px rgba(16, 185, 129, 0.12)' : 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={incTablas}
                    onChange={e => setIncTablas(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '.88rem', fontWeight: 800, color: incTablas ? '#10b981' : 'var(--tx1)' }}>
                      Armado Tablas Respaldo
                    </div>
                    <div style={{ fontSize: '.74rem', color: 'var(--tx3)', marginTop: 2 }}>
                      19 materiales catalogados
                    </div>
                  </div>
                </label>
                <span className="badge" style={{
                  background: incTablas ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-elevated)',
                  color: incTablas ? '#10b981' : 'var(--tx3)',
                  fontWeight: 700,
                  fontSize: '.72rem'
                }}>
                  {tabItems.length} materiales
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Tradicional:</span>
                  <input
                    className="fi fm"
                    type="number"
                    min="0"
                    value={cantTrad}
                    onChange={e => setCantTrad(e.target.value)}
                    style={{ width: 60, padding: '4px 6px', fontSize: '.82rem', fontWeight: 700, textAlign: 'center' }}
                    placeholder="5"
                    disabled={!incTablas}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>Nodo:</span>
                  <input
                    className="fi fm"
                    type="number"
                    min="0"
                    value={cantNodo}
                    onChange={e => setCantNodo(e.target.value)}
                    style={{ width: 60, padding: '4px 6px', fontSize: '.82rem', fontWeight: 700, textAlign: 'center' }}
                    placeholder="0"
                    disabled={!incTablas}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Barra de Control de Vista y Métricas */}
          <div className="card" style={{
            marginBottom: 16,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--tx1)' }}>
                Modo de Visualización:
              </div>
              <div className="segmented-control" style={{ margin: 0 }}>
                <button
                  className={`segmented-btn ${viewMode === 'consolidado' ? 'active' : ''}`}
                  onClick={() => setViewMode('consolidado')}
                  style={{ fontSize: '.78rem', padding: '5px 14px' }}
                >
                  Consolidado General (Suma Total)
                </button>
                <button
                  className={`segmented-btn ${viewMode === 'desglosado' ? 'active' : ''}`}
                  onClick={() => setViewMode('desglosado')}
                  style={{ fontSize: '.78rem', padding: '5px 14px' }}
                >
                  Desglosado por Calculadora
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--tx2)', fontSize: '.74rem', padding: '5px 10px' }}>
                <strong>{totalCalculadorasActivas}</strong> {totalCalculadorasActivas === 1 ? 'calculadora unida' : 'calculadoras unidas'}
              </span>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', fontSize: '.78rem', padding: '5px 12px', fontWeight: 800 }}>
                <strong>{itemsConsolidados.length}</strong> materiales totales
              </span>
            </div>
          </div>

          {/* Alerta si no hay ninguna seleccionada */}
          {totalCalculadorasActivas === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                Ninguna calculadora seleccionada
              </div>
              <p style={{ margin: 0, fontSize: '.85rem' }}>
                Marca al menos una de las casillas superiores para generar la lista de materiales.
              </p>
            </div>
          )}

          {/* VISTA 1: Consolidado General (Suma Inteligente) */}
          {totalCalculadorasActivas > 0 && viewMode === 'consolidado' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 18, background: 'var(--bg-card)' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 240px 180px',
                background: 'var(--bg-elevated)',
                padding: '12px 20px',
                fontSize: '.72rem',
                color: 'var(--tx3)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                fontFamily: "'Outfit', 'Montserrat', sans-serif"
              }}>
                <span>Material</span>
                <span style={{ textAlign: 'center' }}>Origen / Desglose</span>
                <span style={{ textAlign: 'right' }}>Total Consolidado</span>
              </div>
              {itemsConsolidados.map((r, i) => (
                <div key={r.nombre || i} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 240px 180px',
                  padding: '12px 20px',
                  background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                  borderTop: '1px solid var(--border)',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <div>
                    <span style={{ fontSize: '.86rem', color: 'var(--tx1)', fontWeight: 500 }}>
                      {r.nombre}
                    </span>
                    {r.desglose.length > 1 && (
                      <span className="badge" style={{ marginLeft: 8, fontSize: '.66rem', background: 'rgba(1, 102, 255, 0.12)', color: 'var(--blue)', fontWeight: 700 }}>
                        Combina {r.desglose.length} listas
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {r.desglose.map((d, dIdx) => (
                      <span
                        key={dIdx}
                        style={{
                          fontSize: '.68rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: d.color + '18',
                          color: d.color,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {d.origen}: <strong>{fmt(d.cantidad)}</strong> {r.unidad}
                      </span>
                    ))}
                  </div>

                  <div className="fm" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    {fmt(r.cantidad)}
                    <span style={{
                      fontSize: '.72rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: r.unidad === 'mts' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(1, 102, 255, 0.12)',
                      color: r.unidad === 'mts' ? '#10b981' : 'var(--blue)'
                    }}>
                      {r.unidad}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISTA 2: Desglosado por Calculadora */}
          {totalCalculadorasActivas > 0 && viewMode === 'desglosado' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 18 }}>
              
              {/* Sección Proyecto */}
              {incProyecto && proyItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(1, 102, 255, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#0166ff', fontSize: '.9rem' }}>
                      Materiales de Proyecto ({proyItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>{proyectoNombre || 'Cálculo de Proyecto'}</span>
                  </div>
                  {proyItems.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{p.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#0166ff', textAlign: 'right' }}>
                        {fmt(p.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{p.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección Comunidades */}
              {incComunidades && comItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(245, 158, 11, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '.9rem' }}>
                      Activación Comunidades ({comItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>{respaldos} respaldos calculados</span>
                  </div>
                  {comItems.map((c, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{c.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#f59e0b', textAlign: 'right' }}>
                        {fmt(c.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{c.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sección Tablas de Respaldo */}
              {incTablas && tabItems.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '12px 18px', background: 'rgba(16, 185, 129, 0.08)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#10b981', fontSize: '.9rem' }}>
                      Armado de Tablas de Respaldo ({tabItems.length} ítems)
                    </div>
                    <span style={{ fontSize: '.76rem', color: 'var(--tx3)' }}>Tradicional: {cantTrad || 0} | Nodo: {cantNodo || 0}</span>
                  </div>
                  {tabItems.map((t, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: '.84rem', color: 'var(--tx1)' }}>{t.nombre}</span>
                      <span className="fm" style={{ fontSize: '.95rem', fontWeight: 800, color: '#10b981', textAlign: 'right' }}>
                        {fmt(t.cantidad)} <span style={{ fontSize: '.72rem', color: 'var(--tx3)' }}>{t.unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Botones de Acción Global */}
          {totalCalculadorasActivas > 0 && itemsConsolidados.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button className="bg" style={{ fontSize: '.84rem', padding: '9px 22px', minWidth: 160 }} onClick={copyConsolidado}>
                Copiar Lista Unificada
              </button>
              <button className="bs" style={{ fontSize: '.84rem', padding: '9px 22px', minWidth: 180, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportExcelConsolidado}>
                <IconExcel size={15} color="#10b981" />
                Descargar Excel Consolidado (.xlsx)
              </button>
            </div>
          )}
        </div>
      );
    }

    // --- CONFIRM DIALOG COMPOUND COMPONENT & EXPLICIT VARIANTS (vercel-composition-patterns) ---

export default MaterialesWrapper;
export { MaterialesWrapper, MaterialesCalc, ComunidadesCalc, TablasRespaldoCalc, ListaUnificadaCalc };
