import type { ComponentProps } from "react";
import { MermaidDiagram } from "./MermaidDiagram";

type Props = ComponentProps<"pre"> & { "data-mermaid"?: string };

/** `pre` for post bodies: blocks rehypeMermaid marked become diagrams, the rest render as is. */
export function BodyPre({ "data-mermaid": mermaid, ...props }: Props) {
  if (mermaid === undefined) return <pre {...props} />;
  return <MermaidDiagram source={typeof props.children === "string" ? props.children : ""} />;
}
