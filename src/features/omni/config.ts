/**
 * ICE servers ported from the original Omni `js/config.js` (pinned commit c2a2056). The Metered
 * TURN credentials are public by design (the owner accepts this for now); replace them with
 * short-lived credentials from a route handler in a later PR.
 */
const TURN_USERNAME = "0cefb2fbcb33b85faa1dcbc2";
const TURN_CREDENTIAL = "P3sNIoL2SmEjGV4Z";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
  {
    urls: "turns:global.relay.metered.ca:443",
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
];

function urlsOf(server: RTCIceServer) {
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}

/** "STUN 2 · TURN 3" for the setup spec panel. */
export function iceSummary(servers: RTCIceServer[] = ICE_SERVERS) {
  const urls = servers.flatMap(urlsOf);
  return {
    stun: urls.filter((url) => url.startsWith("stun:")).length,
    turn: urls.filter((url) => /^turns?:/.test(url)).length,
  };
}
