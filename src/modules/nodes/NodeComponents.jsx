import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, useTransition, useContext } from 'react';
import { loadXLSX, loadJsPDF, loadQRCode } from '@/utils/exportLibs';
import { computeDispatchLevels, validateDispatch } from '@/modules/fuel/fuelCalc';
import { validateInspection } from '@/modules/nodes/inspectionValidation';
import { getFieldLabel, getFieldUnit } from '@/modules/nodes/fieldLabels';
import { generateReportText } from '@/utils/reportText';
import firebase, { db, auth, TS, FieldValue } from '@/services/firebase';
import { 
  NODE_TYPES, EQ_TYPES, BAT_TYPES, BAT_CELL_TYPES, 
  AWG_AMPACITY, AWG_OPTIONS, BAT_VN, REC_TYPES 
} from '@/config/constants';
import { DEFAULT_AUTHORIZED_STAFF, useAuthorizedStaff } from '@/hooks/useAuthorizedStaff';
import { 
  IconSearch, IconExcel, IconCheckCircle, IconAlertTriangle, 
  IconMapPin, IconPdf, IconCopy, IconChecklist 
} from '@/components/icons';
import { ConfirmModal } from '@/components/common/ConfirmDialog';
import { 
  fmtDateTime, fmtDate, slugify, formatHHMMSS, parseHours, 
  sanitize, normalizeNodeName, formatCleanHoro, parseHorometerToHours
} from '@/utils/formatters';
import { 
  getBankId, getEqTypeFromTag, groupByBank, calcLoad, 
  calcAutonomy, fmtHours, sortEquipment, checkAtsAlarms 
} from '@/utils/energyCalculations';
import { sendNotificationAlert } from '@/services/email';
import { INITIAL_FUEL_TANKS, INITIAL_MAINTENANCE_LOG, persistNodeFuelUpdate, revertFuelTanks, generateFuelReportText } from '@/modules/fuel/fuelUtils';
import { AdjustFuelLevelModal } from '@/modules/fuel/CombustibleWrapper';
import { QRModal } from '@/modules/nodes/components/QrModal';
import { LoadChart } from '@/modules/nodes/components/LoadChart';
import { NodeEvents } from '@/modules/nodes/components/NodeEvents';
import { PersonnelMultiSelect } from '@/modules/nodes/components/PersonnelMultiSelect';
import { NodeAlerts } from '@/modules/nodes/components/NodeAlerts';
import { EditEqModal } from '@/modules/nodes/components/EditEqModal';
import { NodeDocs } from '@/modules/nodes/components/NodeDocs';
import { PlantRecordForm } from '@/modules/nodes/components/PlantRecordForm';
import { RecordDetail } from '@/modules/nodes/components/RecordDetail';
import { MeasurementDisplayCard } from '@/modules/nodes/components/MeasurementDisplayCard';
import { InfoItem } from '@/modules/nodes/components/InfoItem';
import { ReportModal } from '@/modules/nodes/components/ReportModal';
import { RecordForm } from '@/modules/nodes/components/RecordForm';
import { MF } from '@/modules/nodes/components/MF';
import { EqMeasurements } from '@/modules/nodes/components/EqMeasurements';
import { PlantCardContext } from '@/modules/nodes/context/plantCardContext';
import { usePlantCard } from '@/modules/nodes/hooks/usePlantCard';
import { CalibrateHoroModal } from '@/modules/nodes/components/CalibrateHoroModal';
import { PlantCard } from '@/modules/nodes/components/PlantCard';
import { NodePlantas } from '@/modules/nodes/components/NodePlantas';
import { NodeDetail } from '@/modules/nodes/components/NodeDetail';
import { NodeList } from '@/modules/nodes/components/NodeList';
import { ALERT_PRIORITIES } from '@/modules/nodes/components/alertPriorities';


    // ═══════════════════════════════════════════════════
    // CAMPO DE MEDICIÓN
    // ═══════════════════════════════════════════════════
    // MEDICIONES DINÁMICAS POR TIPO DE EQUIPO
        // Helper para formatear horómetros limpios (ej. 674:12 o 674h)
        // Helper para parsear cualquier formato de horómetro a número flotante de horas
        // DEFAULT_AUTHORIZED_STAFF & useAuthorizedStaff imported from @/hooks/useAuthorizedStaff

    // Revierte el efecto de un surtido sobre los tanques: sub-tanque SOLO de la planta (por tag)
    // y reserva compartida SOLO en las plantas del mismo nodo que realmente tienen reserva.
    // ═══════════════════════════════════════════════════
    // FORMULARIO DE REGISTRO
    // ═══════════════════════════════════════════════════
    // DETALLE DE REGISTRO
    // ═══════════════════════════════════════════════════
    // GRÁFICO HISTÓRICO DE CARGAS POR BANCO
    // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    //  MODAL EDICIÓN DE EQUIPO
    // ═══════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════
    // DOCUMENTOS DEL NODO — Diagramas y manuales (solo usuarios registrados)
    // ═══════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════
    //  COMPONENTES DE PLANTA ELÉCTRICA
;

        // ═══════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════
    //  LISTA DE NODOS (DASHBOARD PRINCIPAL)
    // ═══════════════════════════════════════════════════
    
    function IconSliders({ size = 18, color = "currentColor" }) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      );
    }

        // ═══════════════════════════════════════════════════
    // AGREGAR USUARIO EXISTENTE
    // ═══════════════════════════════════════════════════

export default NodeList;
export {
  NodeList, NodeDetail, NodePlantas, RecordForm, RecordDetail,
  ReportModal, QRModal, EqMeasurements, EditEqModal, NodeDocs,
  NodeAlerts, NodeEvents, PlantRecordForm, CalibrateHoroModal,
  PlantCard, MeasurementDisplayCard, LoadChart
};
