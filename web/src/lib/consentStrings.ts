// The consent banner's words now live in shared/src/consent/strings.ts, so the API hashes the same text the banner
// shows (routes/consent.ts). This file keeps the old import path for the app.
export { CONSENT_STRINGS, type ConsentStrings } from '../../../shared/src/consent/strings';
