/**
 * The local signalling server Playwright starts from services/omni-signaling (playwright.config.ts).
 * The app is built with this URL, and the server only accepts the e2e app's origin. CI's build step
 * passes the same URL (.github/workflows/ci.yml).
 */
export const OMNI_SIGNALING_PORT = 3201;
export const OMNI_SIGNALING_URL = `ws://localhost:${OMNI_SIGNALING_PORT}`;
