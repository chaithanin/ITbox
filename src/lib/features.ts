// Central feature flags.
//
// Flip a module off here to close it across the whole app in one place:
// the sidebar link disappears, the dashboard tiles for it are hidden, and
// every page / API route / server action for it returns 404 or refuses —
// so it can't be reached by typing the URL directly either.
//
// To re-open Procurement later, set this back to `true` and redeploy.
export const PROCUREMENT_ENABLED = false;
