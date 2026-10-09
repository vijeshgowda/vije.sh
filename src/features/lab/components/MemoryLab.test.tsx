import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUart } from "@/lib/uart";
import { MemoryLab } from "./MemoryLab";

describe("MemoryLab", () => {
  it("starts at 27 B, 1.58 bits", () => {
    render(<MemoryLab />);
    expect(screen.getByTestId("lab-gb").textContent).toBe("5.3");
    expect(screen.getByRole("button", { name: "1.58 ternary" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/Standard 16-bit would be 54 GB/)).toBeInTheDocument();
    const fits = within(screen.getByRole("list", { name: "Fits in" }));
    expect(fits.getByText("8 GB laptop")).toHaveTextContent(": fits");
    expect(fits.getByText(/ESP32-C3/)).toHaveTextContent(": too small");
  });

  it("recomputes on a new bit width, logs to the UART and remembers it", () => {
    const log = renderHook(() => useUart());
    render(<MemoryLab />);
    fireEvent.click(screen.getByRole("button", { name: "16" }));
    expect(screen.getByTestId("lab-gb").textContent).toBe("54");
    expect(screen.getByText("This is the standard 16-bit size.")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Fits in" })).getByText("64 GB workstation"),
    ).toHaveTextContent(": fits");
    expect(
      within(screen.getByRole("list", { name: "Fits in" })).getByText("32 GB GPU"),
    ).toHaveTextContent(": too small");
    expect(log.result.current.lines.at(-1)).toBe("npu: requantised to 16 bits");
    expect(JSON.parse(localStorage.getItem("vj:lab")!)).toEqual({ p: 27, b: 16 });
  });

  it("follows the parameter slider", () => {
    render(<MemoryLab />);
    const slider = screen.getByRole("slider", { name: /Parameters/ });
    act(() => {
      fireEvent.change(slider, { target: { value: "70" } });
    });
    expect(screen.getByTestId("lab-gb").textContent).toBe("14");
    expect(screen.getByText("70", { selector: "output" })).toBeInTheDocument();
  });

  it("restores stored state", () => {
    localStorage.setItem("vj:lab", JSON.stringify({ p: 8, b: 4 }));
    render(<MemoryLab />);
    expect(screen.getByTestId("lab-gb").textContent).toBe("4.0");
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-pressed", "true");
  });
});
