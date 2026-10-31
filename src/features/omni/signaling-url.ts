export interface SignalingEndpoints {
  signalingOrigin: string;
  healthOrigin: string;
  healthUrl: string;
}

export function signalingEndpoints(signalingUrl: string): SignalingEndpoints {
  const signaling = new URL(signalingUrl);
  if (signaling.protocol !== "ws:" && signaling.protocol !== "wss:") {
    throw new TypeError("Omni signalling URL must use ws: or wss:");
  }

  const health = new URL(signaling.origin);
  health.protocol = signaling.protocol === "wss:" ? "https:" : "http:";
  health.pathname = "/health";

  return {
    signalingOrigin: signaling.origin,
    healthOrigin: health.origin,
    healthUrl: health.href,
  };
}
