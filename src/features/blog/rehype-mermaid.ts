import type { Element, ElementContent, Root } from "hast";
import { SKIP, visit } from "unist-util-visit";

function textOf(nodes: ElementContent[]): string {
  return nodes
    .map((n) => (n.type === "text" ? n.value : n.type === "element" ? textOf(n.children) : ""))
    .join("");
}

function mermaidCode(pre: Element): Element | null {
  if (pre.tagName !== "pre") return null;
  const kids = pre.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const code = kids[0];
  if (kids.length !== 1 || code.type !== "element" || code.tagName !== "code") return null;
  const cls = code.properties.className;
  return Array.isArray(cls) && cls.includes("language-mermaid") ? code : null;
}

/**
 * Turns ```mermaid code blocks into `<pre class="mermaid-src" data-mermaid>` holding the source as
 * plain text, before Shiki sees them. The blog renders that `pre` as the MermaidDiagram island;
 * without JS the source stays readable. In sanitised mode extra plugins run after rehype-sanitize,
 * so the allow-list needs no new element or attribute.
 */
export function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      const code = mermaidCode(node);
      if (!code) return;
      node.properties = { className: ["mermaid-src"], dataMermaid: "" };
      node.children = [{ type: "text", value: textOf(code.children).replace(/\n$/, "") }];
      return SKIP;
    });
  };
}
