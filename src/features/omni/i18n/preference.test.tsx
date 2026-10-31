import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { languagePreference } from "./preference";

function Language() {
  return <p>{languagePreference.use()}</p>;
}

beforeEach(() => localStorage.clear());

describe("Omni stored language", () => {
  it("defaults to English and persists Kannada using the shared vj: storage prefix", () => {
    render(<Language />);
    expect(screen.getByText("en")).toBeInTheDocument();
    act(() => languagePreference.set("kn"));
    expect(screen.getByText("kn")).toBeInTheDocument();
    expect(localStorage.getItem("vj:omni-lang")).toBe(JSON.stringify("kn"));
    expect(localStorage.getItem("omni-lang")).toBeNull();
  });
  it("reads existing stored language and rejects unsupported persisted values", () => {
    localStorage.setItem("vj:omni-lang", JSON.stringify("es"));
    expect(languagePreference.get()).toBe("es");
    localStorage.setItem("vj:omni-lang", JSON.stringify("zz"));
    expect(languagePreference.get()).toBe("en");
  });
  it("updates subscribers when another tab changes the preference", () => {
    render(<Language />);
    act(() => {
      localStorage.setItem("vj:omni-lang", JSON.stringify("kn"));
      window.dispatchEvent(new StorageEvent("storage", { key: "vj:omni-lang" }));
    });
    expect(screen.getByText("kn")).toBeInTheDocument();
  });
});
