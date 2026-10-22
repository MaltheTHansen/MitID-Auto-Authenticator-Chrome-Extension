import { describe, expect, it } from "vitest";
import { type Identity, withIdentity, withIdentityFirst } from "../src/identity.js";

const identityFor = (userId: string): Identity => ({ userId, identityId: `${userId}-identity`, authenticatorId: `${userId}-app` });
const userIdsOf = (identities: Identity[]) => identities.map((identity) => identity.userId);

const listed = ["Theo404", "Anna1", "Bo2"].map(identityFor);

describe("most recently used first", () => {
  it("puts a newly added Identity at the top", () => {
    expect(userIdsOf(withIdentity(listed, identityFor("New3")))).toEqual(["New3", "Theo404", "Anna1", "Bo2"]);
  });

  it("moves a used Identity to the top, ignoring the user ID's case", () => {
    expect(userIdsOf(withIdentityFirst(listed, "bo2"))).toEqual(["Bo2", "Theo404", "Anna1"]);
  });

  it("leaves the list alone when the Identity isn't in it", () => {
    expect(userIdsOf(withIdentityFirst(listed, "Missing"))).toEqual(["Theo404", "Anna1", "Bo2"]);
  });
});
