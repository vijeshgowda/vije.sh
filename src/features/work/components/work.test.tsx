import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CareerTiming } from "./CareerTiming";
import { Kpis, Rack } from "./Rack";
import s from "./Work.module.css";

const uart = vi.hoisted(() => vi.fn());
vi.mock("@/lib/uart", () => ({ uart }));

describe("rack", () => {
  it("pulls a unit out to show its spec and logs to the UART", async () => {
    const user = userEvent.setup();
    render(<Rack />);
    const faces = screen.getAllByRole("button");
    expect(faces).toHaveLength(5);
    const gke = screen.getByRole("button", { name: /GKE/ });
    const spec = document.getElementById(gke.getAttribute("aria-controls")!)!;
    expect(gke).toHaveAttribute("aria-expanded", "false");
    expect(spec).toHaveAttribute("inert");
    expect(spec).toHaveTextContent(/Istio\/Envoy mesh/);

    await user.click(gke);
    expect(gke).toHaveAttribute("aria-expanded", "true");
    expect(spec).not.toHaveAttribute("inert");
    expect(uart).toHaveBeenLastCalledWith("rack: GKE pulled out");

    await user.click(gke);
    expect(gke).toHaveAttribute("aria-expanded", "false");
    expect(uart).toHaveBeenLastCalledWith("rack: GKE racked");
  });

  it("lists the key figures", () => {
    render(<Kpis />);
    const list = screen.getByRole("list", { name: "Key figures" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(list).toHaveTextContent("38%*lower p95 latency");
  });
});

describe("career timing", () => {
  it("lights a signal while its table row is hovered or focused", () => {
    const { container } = render(<CareerTiming nowYear={2026.76} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Meridian Systems");
    expect(rows[0]!.lastElementChild).toHaveTextContent("now");

    const signal = (i: number) => container.querySelector(`[data-signal="${i}"]`)!;
    fireEvent.mouseEnter(rows[1]!);
    expect(signal(1)).toHaveClass(s.hi!);
    expect(signal(0)).not.toHaveClass(s.hi!);
    fireEvent.mouseLeave(rows[1]!);
    expect(signal(1)).not.toHaveClass(s.hi!);

    fireEvent.focus(rows[2]!);
    expect(signal(2)).toHaveClass(s.hi!);
    fireEvent.blur(rows[2]!);
    expect(signal(2)).not.toHaveClass(s.hi!);
  });

  it("draws one clock, one signal per role and the now marker", () => {
    const { container } = render(<CareerTiming nowYear={2026.76} />);
    expect(container.querySelectorAll("[data-signal]")).toHaveLength(4);
    expect(container.querySelector("svg")).toHaveTextContent(/CLK.*MERIDIAN SYSTEMS.*now$/);
    expect(screen.getByRole("region", { name: /Career timing diagram/ })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});
