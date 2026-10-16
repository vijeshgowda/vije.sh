import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

const { MermaidDiagram } = await import("./MermaidDiagram");
const { BodyPre } = await import("./BodyPre");

const SOURCE = "graph TD\n  accTitle: Flow\n  A --> B";

beforeEach(() => {
  mermaid.render.mockImplementation(async (id: string) => ({
    svg: `<svg id="${id}"><g class="node"></g></svg>`,
    diagramType: "flowchart",
    bindFunctions: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  delete document.documentElement.dataset.theme;
});

describe("MermaidDiagram", () => {
  it("shows the source first, then swaps in the strict-mode SVG with an accessible name", async () => {
    const { container } = render(<MermaidDiagram source={SOURCE} />);
    expect(container.querySelector("pre code")).toHaveTextContent("graph TD");
    const source = container.querySelector("pre")!;
    expect(source).toHaveAttribute("tabindex", "0");
    source.focus();
    expect(source).toHaveFocus();

    const img = await screen.findByRole("img", { name: "Flow" });
    expect(img.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false, theme: "base" }),
    );
    const [id, text, measureIn] = mermaid.render.mock.calls[0]!;
    expect(id).toMatch(/^mermaid-[\w-]+$/);
    expect(img.querySelector("svg")!.id).toBe(id);
    expect(text).toBe(SOURCE);
    // labels are measured under the same CSS as the final SVG
    expect(measureIn).toBe(img);
    const { bindFunctions } = await mermaid.render.mock.results[0]!.value;
    expect(bindFunctions).toHaveBeenCalledWith(img);
  });

  it("keeps the source visible with a note when the diagram fails to render", async () => {
    mermaid.render.mockRejectedValueOnce(new Error("Parse error on line 1"));
    const { container } = render(<MermaidDiagram source="not a diagram" />);
    expect(await screen.findByText(/Diagram failed to render/)).toBeInTheDocument();
    expect(container.querySelector("pre code")).toHaveTextContent("not a diagram");
    expect(container.querySelector("pre")).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("[role=img]")).toHaveAttribute("aria-hidden", "true");
  });

  it("re-renders in the dark theme when the site theme changes", async () => {
    render(<MermaidDiagram source={SOURCE} />);
    await screen.findByRole("img");
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ themeVariables: expect.objectContaining({ darkMode: false }) }),
    );

    await act(async () => {
      document.documentElement.dataset.theme = "dark";
    });
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(mermaid.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ themeVariables: expect.objectContaining({ darkMode: true }) }),
    );
  });

  it("gives each diagram on a page its own id", async () => {
    render(
      <>
        <MermaidDiagram source="graph TD" />
        <MermaidDiagram source="graph LR" />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    const ids = mermaid.render.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("BodyPre", () => {
  it("renders an unmarked pre as is", () => {
    const { container } = render(<BodyPre className="shiki">code</BodyPre>);
    expect(container.innerHTML).toBe('<pre class="shiki">code</pre>');
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("renders a marked pre as a diagram", async () => {
    render(<BodyPre data-mermaid="">{SOURCE}</BodyPre>);
    expect(await screen.findByRole("img", { name: "Flow" })).toBeInTheDocument();
  });
});
