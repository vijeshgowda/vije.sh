import { describe, expect, it } from "vitest";
import { getLinkType, getQualityLevel, type CandidateStats } from "./quality";

describe("original quality thresholds", () => {
  it.each([
    [1500000, 0.5, 0.05, "good"],
    [150000, 1, 0.1, "fair"],
    [500000, 5, 0.05, "fair"],
    [500000, 1, 0.3, "fair"],
    [30000, 0.5, 0.05, "poor"],
    [1000000, 12, 0.05, "poor"],
    [1000000, 1, 0.6, "poor"],
    [20000, 15, 1, "poor"],
    [500000, 3, 0.05, "good"],
    [500000, 3.1, 0.05, "fair"],
    [500000, 8, 0.05, "fair"],
    [500000, 8.1, 0.05, "poor"],
    [0, 0, 0, "poor"],
    [200000, 0, 0.01, "good"],
    [500000, 0, 0.25, "good"],
    [500000, 0, 0.251, "fair"],
    [50000, 0, 0.5, "fair"],
  ])("%i b/s, %f loss, %f RTT is %s", (bitrate, packetLoss, rtt, level) => {
    expect(getQualityLevel({ bitrate, packetLoss, rtt }).level).toBe(level);
  });
  it("formats bitrate, packet loss and RTT exactly like the original", () => {
    expect(getQualityLevel({ bitrate: 1500000, packetLoss: 0.5, rtt: 0.05 }).label).toBe(
      "1500kb/s · 0.5% loss · 50ms",
    );
  });
});

describe("direct versus relayed selected candidate pair", () => {
  function reports(local = "host", remote = "srflx"): CandidateStats[] {
    return [
      { id: "transport", type: "transport", selectedCandidatePairId: "active" },
      {
        id: "active",
        type: "candidate-pair",
        state: "succeeded",
        localCandidateId: "local",
        remoteCandidateId: "remote",
      },
      { id: "local", type: "local-candidate", candidateType: local },
      { id: "remote", type: "remote-candidate", candidateType: remote },
    ];
  }
  it("uses the selected pair, not another successful pair", () => {
    expect(
      getLinkType([
        { id: "unused", type: "candidate-pair", nominated: true, state: "succeeded" },
        ...reports(),
      ]),
    ).toBe("direct");
    expect(getLinkType(reports("relay"))).toBe("relayed");
    expect(getLinkType(reports("host", "relay"))).toBe("relayed");
  });
  it("falls back to nominated or selected pairs without a transport report", () => {
    const entries = reports().slice(1);
    entries[0] = {
      id: "active",
      type: "candidate-pair",
      selected: true,
      localCandidateId: "local",
      remoteCandidateId: "remote",
    };
    expect(getLinkType(entries)).toBe("direct");
    entries[0] = { ...entries[0], selected: false, nominated: true, state: "succeeded" };
    expect(getLinkType(entries)).toBe("direct");
  });
  it("never claims a direct link with missing or unrecognised candidates", () => {
    expect(getLinkType([])).toBe("unknown");
    expect(getLinkType(reports("unknown"))).toBe("unknown");
    expect(getLinkType(reports().slice(0, 3))).toBe("unknown");
    expect(getLinkType(reports().slice(2))).toBe("unknown");
  });
});
