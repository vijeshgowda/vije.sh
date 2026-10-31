export type QualityLevel = "good" | "fair" | "poor";
export type QualityStats = { bitrate: number; packetLoss: number; rtt: number };

export function getQualityLevel({ bitrate, packetLoss, rtt }: QualityStats) {
  const level: QualityLevel =
    packetLoss > 8 || bitrate < 50_000 || rtt > 0.5
      ? "poor"
      : packetLoss > 3 || bitrate < 200_000 || rtt > 0.25
        ? "fair"
        : "good";
  return {
    level,
    label: `${Math.round(bitrate / 1000)}kb/s · ${packetLoss.toFixed(1)}% loss · ${Math.round(rtt * 1000)}ms`,
  };
}

export type CandidateStats =
  | { id: string; type: "transport"; selectedCandidatePairId?: string }
  | {
      id: string;
      type: "candidate-pair";
      localCandidateId?: string;
      remoteCandidateId?: string;
      selected?: boolean;
      nominated?: boolean;
      state?: string;
    }
  | { id: string; type: "local-candidate" | "remote-candidate"; candidateType?: string };

export function getLinkType(reports: Iterable<CandidateStats>): "direct" | "relayed" | "unknown" {
  const entries = Array.from(reports);
  const selected = entries.find(
    (entry) => entry.type === "transport" && entry.selectedCandidatePairId,
  );
  const pair = entries.find(
    (entry) =>
      entry.type === "candidate-pair" &&
      (selected?.type === "transport"
        ? entry.id === selected.selectedCandidatePairId
        : entry.selected || (entry.nominated && entry.state === "succeeded")),
  );
  if (pair?.type !== "candidate-pair") return "unknown";
  const local = entries.find((entry) => entry.id === pair.localCandidateId);
  const remote = entries.find((entry) => entry.id === pair.remoteCandidateId);
  const localType = local?.type === "local-candidate" ? local.candidateType : undefined;
  const remoteType = remote?.type === "remote-candidate" ? remote.candidateType : undefined;
  if (localType === "relay" || remoteType === "relay") return "relayed";
  const direct = new Set(["host", "srflx", "prflx"]);
  return localType && remoteType && direct.has(localType) && direct.has(remoteType)
    ? "direct"
    : "unknown";
}
