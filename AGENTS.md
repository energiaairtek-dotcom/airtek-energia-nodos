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
| **Frontend Core** | React 18, Vite 5 | Arquitectura SPA modularizada en `src/` (`App.jsx`, `main.jsx`, `modules/`, `components/`). Respaldo monolito en [`index.legacy.html`](./index.legacy.html). |
| **Diseño y Estilos** | CSS Vanilla con Design System de Airtek | Variables CSS en `:root` en [`src/styles/global.css`](./src/styles/global.css) (tokens de color, dark/light theme, glassmorphism, tipografías Outfit, Montserrat y JetBrains Mono). **Evitar emojis en la UI**, utilizar iconos SVG vectoriales limpios en [`src/components/icons`](./src/components/icons). |
| **Base de Datos** | Google Cloud Firestore (SDK v10 compat) | Base de datos compartida multiapp (`energy_nodes`, `energy_users`, `airtek_users`, subcolecciones) gestionada en [`src/services/firebase.js`](./src/services/firebase.js). |
| **Reglas de Seguridad** | [`firestore.rules`](./firestore.rules) | Reglas endurecidas que preservan compatibilidad con PM V7 y Almacén. |
| **Automatización Python** | Python 3.12, OpenPyXL | Script [`monitor_plantas_excel.py`](./monitor_plantas_excel.py) para auditoría y reportes ejecutivos en vivo en Excel. |
| **Validación & Build** | Vite & `esbuild` | Compilación ultrarrápida con `npm run build` y servidor local `npm run dev`. |

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

## 4. Matriz Universal y Reglas del Sistema de Combustible

El sistema administra **29 plantas eléctricas** distribuidas en 4 arquetipos operativos claros:

### Categoría 1: Nodos Multiplanta con Reserva Compartida (El Callao, 18 de Octubre)
- **Características:** Sedes con 2 plantas eléctricas (`-00` y `-01`) que se alimentan de un **único tanque de reserva físico central** (ej. 2,500 L en Callao, 240 L en 18 de Octubre).
- **Regla de Oro:** Ambas plantas comparten **la misma capacidad y el mismo volumen disponible de reserva** en todas las vistas:
  1. Tabla principal de **Control de Surtidos**.
  2. Pestaña de **Plantas Eléctricas** del nodo (tarjetas `PlantCard`).
  3. Pestaña de **Equipos** (insignia en cada generador `GEN`).
- **Flujo:** Surtir o calibrar cualquiera de las dos plantas descuenta o actualiza el tanque central común y sincroniza a ambas en memoria, `localStorage` (`airtek_fuel_tanks_v13`) y Firestore (`energy_nodes/{id}/fuel/state`).

### Categoría 2: Nodos Individuales con Reserva Dedicada (Marfi, Bella Vista, Ojeda, Pomona, etc.)
- **Plantas:** `MARFI-PLT-00`, `BVIS-PLT-00`, `CPS-PLT-00`, `COM-PLT-00`, `LCAR-PLT-00`, `SANR-PLT-00`, `LCON-PLT-00`, `SRAF-PLT-00`, `SCRU-PLT-00`, `MACH-PLT-00`, `VILL-PLT-00`, `CABI-PLT-00`, `BACH-PLT-00`, `MENE-PLT-00`, `LPUE-PLT-00`, y las recién actualizadas con reserva de 1,000 L: `OJEDA-PLT-00`, `POMO-PLT-00`, `MARI-PLT-00`, `CANA-PLT-00`.
- **Características:** Cuentan con un subtanque propio del generador y un tanque de reserva externo dedicado (ej. 1,000 L en Ojeda, Pomona, Marite y Cañada).
- **Flujo de Operación:**
  - `Surtido Planta`: Llena el subtanque (tope nominal) y descuenta de su reserva dedicada.
  - `Surtido Externo Planta`: El camión cisterna llena el subtanque directamente sin tocar la reserva dedicada.
  - `Surtido Reserva`: Llena el tanque de reserva externo hasta su tope nominal.
  - `Trasiego Interno`: Pasa litros de su reserva dedicada al subtanque sin añadir combustible externo al total del nodo.

### Categoría 3: Nodos "Directo a Planta" Sin Reserva Externa (`cap_reserva = 0`)
- **Plantas:** `LTUN-PLT-00` (Las Tunas: 100 L), `SVG-PLT-00` (Servicios Generales: 50 L), `PORT-PLT-00` (Planta Portátil: 100 L).
- **Características:** No existe tanque cisterna externo. Todo el combustible reside en el tanque interno de la planta.
- **Flujo de Operación:**
  - El modal restringe automáticamente las opciones y selecciona **"Surtido Directo a Planta"**.
  - No muestra opciones irrelevantes de trasiego ni de reserva.
  - La reserva se mantiene estrictamente en `0 L` y la UI muestra la etiqueta clara `Directo a Planta`.

### Categoría 4: Nodos con Tanques de Gran Capacidad / Megatanques (Atlantis, Bachaquero, etc.)
- **Plantas:** `ATL-PLT-00` (1,700 L), `ATL-PLT-01` (60 L), `ATL-PLT-02` (1,000 L), `BACH-PLT-00` (1,000 L tanque + 1,000 L reserva), `LPUE-PLT-00` (1,100 L tanque + 1,000 L reserva).
- **Características:** Instalaciones críticas con grandes volúmenes de almacenamiento nominal.
- **Flujo de Operación:** En Atlantis, cada planta opera con su tanque propio de gran autonomía directo a planta. Bachaquero y Los Puertos operan con tanque nominal y reserva masiva respetando consumos nominales (L/h) para el cálculo de autonomía en días.

---

### D. Tipos de Despacho en `NewFuelRefillModal`
1. **Surtido a Planta (con reserva en nodo):** Descuenta los litros del tanque de reserva (`newRes = Math.max(0, curRes - l)`) y llena el subtanque de la planta seleccionada (`newSub = Math.min(subCap, curSub + l)`).
2. **Surtido Externo a Planta (Cisterna a Planta):** Ingresa combustible de un camión cisterna directo al subtanque de la planta **sin modificar** la reserva del nodo.
3. **Surtido a Reserva:** Llena el tanque de reserva hasta su tope físico nominal (`newRes = Math.min(resCap, curRes + l)`).
4. **Trasiego Interno:** Trasiega litros de la reserva externa al subtanque de la planta, sin añadir combustible nuevo al total del nodo (`addedTotal = 0`).
5. **Surtido Mixto:** Despacha litros tanto a la planta como a la reserva simultáneamente.

---

### E. Calibración Directa para Supervisores y Administradores
- Los usuarios con rol `admin`, `supervisor` o `directivo` pueden calibrar niveles reales físicos (medición de vara en sitio, horómetros, capacidades y consumos) desde dos puntos:
  - Botón **`Ajustar`** en la tabla de Control de Surtidos.
  - Botón **`Calibrar Combustible`** o **`Modificar`** dentro de la tarjeta de planta en `NodePlantas`.

---

## 5. Directrices de Desarrollo y Flujo de Trabajo
 
1. **Estructura Modular (`src/`):**
   - La aplicación reside modularmente en `src/`: componentes transversales en `src/components/`, contextos en `src/context/`, módulos de negocio en `src/modules/` (`fuel/`, `nodes/`, `plants/`, `calculators/`, `admin/`, `auth/`), y servicios en `src/services/`.
   - El archivo histórico [`index.legacy.html`](./index.legacy.html) permanece como respaldo íntegro.
2. **Validación de Compilación Obligatoria:**
   - Tras cualquier cambio de código, ejecuta la compilación de producción para validar que no haya errores de importación, sintaxis o dependencias:
     ```bash
     npm run build
     ```
3. **Estilo Visual & UI:**
   - No usar emojis en componentes ni botones (usar iconos SVG limpios desde [`src/components/icons`](./src/components/icons) y texto claro).
   - Mantener consistencia tipográfica con el design system oficial de Airtek (`var(--bg-surface)`, `var(--blue)`, `var(--tx1)`, etc.).
4. **Despliegue:**
   - Configurado en [`vercel.json`](./vercel.json) con comando `npm run build` y salida en `/dist`.
   - Los commits a `main` disparan automáticamente el despliegue en Vercel. Asegurarse de que el árbol de trabajo esté limpio y `npm run build` pase con éxito antes de desplegar.
