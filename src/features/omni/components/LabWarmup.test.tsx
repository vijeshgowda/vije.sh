import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabWarmup } from "./LabWarmup";

describe("LabWarmup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a no-cors health request on hover, only once", async () => {
    const fetch = vi.fn().mockResolvedValue({});
    vi.stubGlobal("fetch", fetch);
    render(
      <LabWarmup healthUrl="https://omni.example/health">
        <a href="/lab/omni">Omni</a>
      </LabWarmup>,
    );

    fireEvent.pointerEnter(screen.getByRole("link", { name: "Omni" }));
    fireEvent.pointerEnter(screen.getByRole("link", { name: "Omni" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "https://omni.example/health",
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );
  });
});
