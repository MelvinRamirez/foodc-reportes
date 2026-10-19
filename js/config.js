export const API_URL = 'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec'; // same /exec as foodc-caja, placeholder until B1-B3 are deployed
export const VERIFY_TIMEOUT_MS = 15000; // no lock, no Sheets
export const REPORT_TIMEOUT_MS = 60000; // listing + up to ~9 reads, cold start, margin
export const WINDOW_DAYS = 7;
export const PIN_MIN = 6;
export const PIN_MAX = 12;
export const PIN_SESSION_KEY = 'foodc.reportes.pin'; // sessionStorage: raw PIN string, its own key (reportes-access)
export const SERVER_UTC_OFFSET_MIN = -360; // appsscript.json timeZone America/Tegucigalpa (UTC-6, no DST)
