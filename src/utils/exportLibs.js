// Carga diferida y compartida de las librerías de exportación.
// Solo se descargan cuando el usuario exporta o imprime, no al abrir la app.
let xlsxPromise = null;
let jsPdfPromise = null;
let qrCodePromise = null;
let html2canvasPromise = null;

export const loadXLSX = () => (xlsxPromise = xlsxPromise || import('xlsx'));

export const loadJsPDF = () => (jsPdfPromise = jsPdfPromise || import('jspdf'));

export const loadQRCode = () => (qrCodePromise = qrCodePromise || import('qrcode'));

export const loadHtml2Canvas = () =>
  (html2canvasPromise = html2canvasPromise || import('html2canvas').then((m) => m.default));
