import { AWG_AMPACITY } from '@/config/constants';

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

export { calcularMaterialesProyecto, calcularMaterialesComunidades, calcularMaterialesTablas, MATERIALES_TABLAS_RESPALDO, MATERIALES_ACTIVACION };
