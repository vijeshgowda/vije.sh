import { describe, expect, it } from "vitest";
import { handleSchema, profileFromMetadata, signInSchema, welcomeSchema } from "./schemas";

describe("handleSchema", () => {
  it("matches the database rule", () => {
    expect(handleSchema.parse("  vije_01 ")).toBe("vije_01");
    for (const bad of ["ab", "a".repeat(25), "has space", "dash-ed", "ümlaut"]) {
      expect(handleSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("signInSchema", () => {
  it("accepts enabled providers and cleans next", () => {
    expect(signInSchema.parse({ provider: "github", next: "//evil" })).toEqual({
      provider: "github",
      next: "/",
    });
    expect(signInSchema.parse({ provider: "azure", next: "/forum" }).next).toBe("/forum");
  });

  it("rejects providers that aren't enabled", () => {
    expect(signInSchema.safeParse({ provider: "apple" }).success).toBe(false);
    expect(signInSchema.safeParse({ provider: null }).success).toBe(false);
  });
});

describe("welcomeSchema", () => {
  const ok = { handle: "vije", accept: "on", token: "t", next: "/lab" };

  it("parses a complete form", () => {
    expect(welcomeSchema.parse(ok)).toEqual({
      handle: "vije",
      accept: "on",
      token: "t",
      next: "/lab",
    });
  });

  it("reports the first problem with a field name", () => {
    const issue = (v: object) => welcomeSchema.safeParse({ ...ok, ...v }).error?.issues[0];
    expect(issue({ handle: "x" })?.path).toEqual(["handle"]);
    expect(issue({ accept: null })?.message).toMatch(/guidelines/);
    expect(issue({ token: "" })?.message).toMatch(/human check/);
    expect(issue({ token: "t".repeat(2049) })?.path).toEqual(["token"]);
  });
});

describe("profileFromMetadata()", () => {
  it("prefers full_name, then name, user_name, preferred_username", () => {
    expect(profileFromMetadata({ full_name: " Ada ", name: "x" }).displayName).toBe("Ada");
    expect(profileFromMetadata({ name: "Bo" }).displayName).toBe("Bo");
    expect(profileFromMetadata({ user_name: "octo" }).displayName).toBe("octo");
    expect(profileFromMetadata({ preferred_username: "pu" }).displayName).toBe("pu");
    expect(profileFromMetadata({ full_name: "  ", name: 3 }).displayName).toBeNull();
    expect(profileFromMetadata(undefined)).toEqual({ displayName: null, avatarUrl: null });
  });

  it("clips the name and keeps only short http(s) avatars", () => {
    expect(profileFromMetadata({ full_name: "n".repeat(80) }).displayName).toHaveLength(60);
    expect(profileFromMetadata({ avatar_url: "https://a.example/x.png" }).avatarUrl).toBe(
      "https://a.example/x.png",
    );
    expect(profileFromMetadata({ picture: "https://g.example/p" }).avatarUrl).toBe(
      "https://g.example/p",
    );
    expect(profileFromMetadata({ avatar_url: "javascript:alert(1)" }).avatarUrl).toBeNull();
    expect(
      profileFromMetadata({ avatar_url: `https://a.example/${"p".repeat(500)}` }).avatarUrl,
    ).toBeNull();
  });
});
