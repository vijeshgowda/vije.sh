import { describe, expect, it } from "vitest";
import { displayRole, ROLE_PILL_LABEL } from "./roles";

const ENG = "2";
const GAMES = "4";

describe("displayRole", () => {
  it("shows members without grants as members", () => {
    expect(displayRole([], ENG)).toBe("member");
  });

  it("shows global moderators everywhere and category moderators only in their category", () => {
    expect(displayRole([{ role: "moderator", categoryId: null }], ENG)).toBe("moderator");
    expect(displayRole([{ role: "moderator", categoryId: GAMES }], GAMES)).toBe("moderator");
    expect(displayRole([{ role: "moderator", categoryId: GAMES }], ENG)).toBe("member");
  });

  it("shows superusers everywhere", () => {
    expect(displayRole([{ role: "superuser", categoryId: null }], GAMES)).toBe("superuser");
    expect(
      displayRole(
        [
          { role: "moderator", categoryId: null },
          { role: "superuser", categoryId: null },
        ],
        ENG,
      ),
    ).toBe("superuser");
  });

  it("picks the highest grant", () => {
    expect(
      displayRole(
        [
          { role: "moderator", categoryId: ENG },
          { role: "admin", categoryId: null },
          { role: "moderator", categoryId: null },
        ],
        ENG,
      ),
    ).toBe("admin");
    expect(
      displayRole(
        [
          { role: "admin", categoryId: null },
          { role: "moderator", categoryId: null },
        ],
        GAMES,
      ),
    ).toBe("admin");
  });

  it("has a label for every role", () => {
    expect(ROLE_PILL_LABEL).toEqual({
      admin: "Owner",
      superuser: "Superuser",
      moderator: "Moderator",
      member: "Member",
    });
  });
});
