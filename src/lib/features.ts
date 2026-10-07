// Central feature flags.
//
// Flip a module off here to close it across the whole app in one place:
// the sidebar link disappears, the dashboard tiles for it are hidden, and
// every page / API route / server action for it returns 404 or refuses —
// so it can't be reached by typing the URL directly either.
//
// To re-open Procurement later, set this back to `true` and redeploy.
export const PROCUREMENT_ENABLED = false;

// CCTV monitoring module. Set to `true` and redeploy to re-open it (sidebar
// link, /cctv pages, CCTV API/ingest routes and the daily CCTV cron).
export const CCTV_ENABLED = false;

// Lesser-used enterprise modules, hidden to keep the sidebar compact. Each
// hides its sidebar link and 404s its pages (data is retained). Flip to `true`
// and redeploy to re-open.
export const CMDB_ENABLED = false;
export const BACKUP_ENABLED = false;
export const VULN_ENABLED = false;
export const ENDPOINTS_ENABLED = false;
