import { describe, expect, it } from "vitest";
import { parseUsersFile, serializeUsersFile } from "../src/usersFile.js";

describe("parseUsersFile", () => {
  it("reads one Identity per line", () => {
    const { identities, invalidLines } = parseUsersFile("Theo404,id-1,auth-1\nCam37830,id-2,auth-2");

    expect(identities).toEqual([
      { userId: "Theo404", identityId: "id-1", authenticatorId: "auth-1" },
      { userId: "Cam37830", identityId: "id-2", authenticatorId: "auth-2" },
    ]);
    expect(invalidLines).toEqual([]);
  });

  it("accepts Windows line endings, blank lines and stray whitespace", () => {
    const { identities } = parseUsersFile("\r\n  Theo404 , id-1 , auth-1  \r\n\r\nCam37830,id-2,auth-2\r\n");

    expect(identities.map((i) => i.userId)).toEqual(["Theo404", "Cam37830"]);
    expect(identities[0]).toEqual({ userId: "Theo404", identityId: "id-1", authenticatorId: "auth-1" });
  });

  it("reports lines that don't have exactly three non-empty fields", () => {
    const { identities, invalidLines } = parseUsersFile("Theo404,id-1\nTheo404,id-1,auth-1,extra\nTheo404,,auth-1\nok,id,auth");

    expect(identities).toEqual([{ userId: "ok", identityId: "id", authenticatorId: "auth" }]);
    expect(invalidLines).toEqual(["Theo404,id-1", "Theo404,id-1,auth-1,extra", "Theo404,,auth-1"]);
  });
});

describe("serializeUsersFile", () => {
  it("writes the console app's format, ending in a newline so the old apps can append to it", () => {
    const identities = [
      { userId: "Theo404", identityId: "id-1", authenticatorId: "auth-1" },
      { userId: "Cam37830", identityId: "id-2", authenticatorId: "auth-2" },
    ];

    const text = serializeUsersFile(identities);

    expect(text).toBe("Theo404,id-1,auth-1\nCam37830,id-2,auth-2\n");
    expect(parseUsersFile(text).identities).toEqual(identities);
  });
});
