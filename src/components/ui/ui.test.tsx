import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "../layout/SiteFooter";

// the footer mounts the jump-to palette, which needs the App Router
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { Button, ButtonLink } from "./Button";
import { Card } from "./Card";
import { Lede, PageIntro, RunFoot, RunHead, Section } from "./Datasheet";
import { StubPage } from "./StubPage";

describe("ui primitives", () => {
  it("Button defaults to type=button and supports variants", () => {
    render(
      <>
        <Button variant="red" size="sm">
          Go
        </Button>
        <ButtonLink href="/work">Work</ButtonLink>
      </>,
    );
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("link", { name: "Work" })).toHaveAttribute("href", "/work");
  });

  it("Card renders code, meta and a labelled title", () => {
    render(
      <Card code="LF-01" meta="live" title="ISS" titleId="t1" aria-labelledby="t1">
        <p>body</p>
      </Card>,
    );
    expect(screen.getByRole("article", { name: "ISS" })).toHaveTextContent("LF-01");
  });

  it("Card without meta or title", () => {
    const { container } = render(<Card code="X" lift={false} />);
    expect(container.querySelector("h3")).toBeNull();
  });

  it("datasheet furniture", () => {
    render(
      <>
        <RunHead label="Live" />
        <PageIntro kicker="Section 1" title="Title">
          intro
        </PageIntro>
        <PageIntro kicker="Section 2" title="Bare" />
        <Section id="s" no={1} title="Sec" note="n">
          <Lede>lede</Lede>
        </Section>
        <Section id="t" no={2} title="NoNote">
          x
        </Section>
        <RunFoot page={3} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "1Sec" })).toBeInTheDocument();
    expect(screen.getByText("Page 3 of 7")).toBeInTheDocument();
  });

  it("StubPage and footer", () => {
    render(
      <>
        <StubPage page={2} label="Work" kicker="Section 7" title="Deployments">
          soon
        </StubPage>
        <SiteFooter />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Deployments" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "All pages" }).querySelectorAll("a"),
    ).toHaveLength(7);
  });
});
