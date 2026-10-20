# Guía del Proyecto y Reglas para Agentes (AGENTS.md)
# Sistema de Gestión de Energía en Nodos – Airtek Energy

Bienvenido al repositorio **Airtek Energía Nodos** (`airtek-energia-nodos`).
Este documento define la arquitectura, normas operativas, modelos de datos, reglas de seguridad y buenas prácticas que cualquier agente de inteligencia artificial o desarrollador debe respetar al modificar o extender este sistema.

---

## 1. Visión General del Proyecto

- **Propósito:** Plataforma web en tiempo real para el monitoreo, gestión y control operativo de la infraestructura energética de nodos y datacenters de Airtek (bancos de baterías, inversores, plantas eléctricas, transferencias automáticas, consumo y control estricto de combustible).
- **Despliegue de Producción:** [https://airtek-energia-nodos.vercel.app/](https://airtek-energia-nodos.vercel.app/)
- **Repositorio Git:** `https://github.com/energiaairtek-dotcom/airtek-energia-nodos.git` (rama principal: `main`).

---

## 2. Pila Tecnológica (Tech Stack)

| Capa | Tecnologías | Notas |
| :--- | :--- | :--- |
| **Frontend Core** | React 18 (UMD CDN), Babel Standalone | Aplicación SPA reactiva modular contenida en [`index.html`](./index.html). |
| **Diseño y Estilos** | CSS Vanilla con Design System de Airtek | Variables CSS en `:root` (tokens de color, dark/light theme, glassmorphism, tipografías Outfit, Montserrat y JetBrains Mono). **Evitar emojis en la UI**, utilizar iconos SVG vectoriales limpios. |
| **Base de Datos** | Google Cloud Firestore (SDK v10 compat) | Base de datos compartida multiapp (`energy_nodes`, `energy_users`, `airtek_users`, subcolecciones). |
| **Reglas de Seguridad** | [`firestore.rules`](./firestore.rules) | Reglas endurecidas que preservan compatibilidad con PM V7 y Almacén. |
| **Automatización Python** | Python 3.12, OpenPyXL | Script [`monitor_plantas_excel.py`](./monitor_plantas_excel.py) para auditoría y reportes ejecutivos en vivo en Excel. |
| **Validación de Código** | `esbuild` | Verificación de sintaxis JSX antes de commitear en Git. |

---

## 3. Arquitectura del Modelo de Datos (Firestore)

> [!IMPORTANT]
> Esta base de datos es **compartida** con otras plataformas de la empresa (como PM V7 y Almacén). Ninguna regla de seguridad o script debe eliminar colecciones ni modificar campos ajenos a la app de Energía.

### Colecciones Principales

1. **`energy_nodes` (Documento por Nodo/Datacenter):**
   - Campos: `name`, `zone`, `type`, `status`, `fuelState`, etc.
   - **Subcolecciones de cada nodo:**
     - `energy_equipment`: Equipos físicos activos o retirados (`INV`, `BAT`, `ATS`, `GEN`, `BKR`, `ETP`).
     - `energy_records`: Historial cronológico inmutable de inspecciones, surtidos, ajustes y mantenimiento.
     - `fuel/state` (Documento único por nodo): Estado de combustible en tiempo real:
       - `reserva_lts` (Litros actuales en la reserva del sitio).
       - `cap_reserva_lts` (Capacidad nominal física del tanque de reserva).
       - `subtanque_actual` (Nivel del tanque interno de la planta activa).
       - `total_nodo_lts` (Combustible total neto en la sede).
       - `lastRefillDate`, `lastRefillLiters`, `lastRefillDestino`, `lastRefillTag`, etc.

2. **`airtek_users` / `energy_users`:**
   - Usuarios autenticados con control de roles (`role` o `rol`):
     - `admin`: Administrador de sistema (permiso total de configuración y eliminación).
     - `supervisor`: Supervisor de monitoreo de energía (auditoría, edición y calibración).
     - `tecnico`: Técnico operativo (registro de inspecciones y surtidos).
     - `directivo`: Acceso ejecutivo de consulta y calibración.

---

## 4. Reglas Críticas del Sistema de Combustible

### A. Reserva Compartida por Sede Física
- Los nodos con múltiples plantas eléctricas (como **Datacenter El Callao** con `CALL-PLT-00` y `CALL-PLT-01`, o **Datacenter 18 de Octubre** con `18OT-PLT-00` y `18OT-PLT-01`) **comparten un único tanque de reserva físico**.
- Ambas plantas deben reflejar **exactamente la misma capacidad y litros de reserva** en:
  1. La tabla principal de **Control de Surtidos**.
  2. La pestaña de **Plantas Eléctricas** del nodo (tarjetas `PlantCard`).
  3. La pestaña de **Equipos** en la tarjeta de cada generador `GEN`.
- Surtir o ajustar cualquiera de las dos plantas debe descontar o actualizar el tanque común de la sede y propagarse a todas las plantas hermanas en memoria, en `localStorage` (`airtek_fuel_tanks_v13`) y en Firestore (`energy_nodes/{id}/fuel/state`).

### B. Lógica de Despacho en `NewFuelRefillModal`
- **Surtido a Planta (con reserva en nodo):** Descuenta los litros del tanque de reserva compartida (`newRes = Math.max(0, curRes - l)`) y llena el subtanque de la planta seleccionada (`newSub = Math.min(subCap, curSub + l)`).
- **Surtido Externo a Planta (Cisterna a Planta):** Ingresa combustible directamente de un camión cisterna al subtanque de la planta seleccionada **sin modificar** la reserva compartida.
- **Surtido a Reserva:** Llena el tanque de reserva compartida hasta su tope físico nominal.
- **Trasiego Interno:** Trasiega litros de la reserva externa al subtanque de la planta, sin añadir combustible nuevo al total del nodo.
- **Nodos sin Reserva (Directo a Planta):** Suministro directo al subtanque sin afectar reservas.

### C. Calibración Directa para Supervisores y Administradores
- Los usuarios con rol `admin`, `supervisor` o `directivo` tienen permiso para calibrar niveles reales (medición de vara en sitio, horómetros, capacidades de tanques y consumos) desde dos puntos:
  - Botón **`Ajustar`** en la tabla de Control de Surtidos.
  - Botón **`Calibrar Combustible`** o botón **`Modificar`** dentro de la tarjeta de planta en `NodePlantas`.

---

## 5. Directrices de Desarrollo y Flujo de Trabajo

1. **Integridad de Código:**
   - La aplicación frontend reside en [`index.html`](./index.html). Antes de realizar cambios, analiza los bloques específicos afectados y preserva la estructura de componentes.
2. **Validación de Sintaxis Obligatoria:**
   - Tras cualquier edición que involucre código JSX/React en `index.html`, debes compilar el bloque de scripts con `esbuild` o el script de pruebas en `scratch/` para verificar que haya **0 errores de sintaxis**:
     ```bash
     npx esbuild scratch/babel_test.jsx --outfile=scratch/test_bundle.js
     ```
3. **Estilo Visual & UI:**
   - No usar emojis en componentes ni botones (usar iconos SVG limpios y texto claro).
   - Mantener consistencia tipográfica con el design system oficial de Airtek (`var(--bg-surface)`, `var(--blue)`, `var(--tx1)`, etc.).
4. **Despliegue:**
   - Los commits a `main` disparan automáticamente el despliegue en Vercel. Asegurarse de que el árbol de trabajo esté limpio antes de desplegar.
