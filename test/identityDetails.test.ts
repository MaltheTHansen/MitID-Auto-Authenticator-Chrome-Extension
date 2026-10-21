import { describe, expect, it } from "vitest";
import { ageOn, attentionNotes, toIdentityDetails } from "../src/identityDetails.js";
import type { MitIdIdentityRecord } from "../src/mitid/adminApi.js";

const FETCHED_AT = new Date("2026-10-21T12:00:00Z");

const RECORD: MitIdIdentityRecord = {
  identityName: "Theo Testesen",
  cprNumber: "0101901234",
  dateOfBirth: "1990-01-01",
  ial: "SUBSTANTIAL",
  identityStatus: "ACTIVE",
  cprStatus: "Active, domicile in Danish Civil Registration System",
  registeredAddress: "Testvej 1",
  cprAddress: { coName: null, address: "Testvej 1", postalCode: "5000", postalDistrict: "Odense C", city: "Odense" },
  attributes: { protectedStatusForName: "false", protectedStatusForAddress: "false" },
};

describe("toIdentityDetails", () => {
  it("picks out the fields shown on the details card", () => {
    expect(toIdentityDetails(RECORD, FETCHED_AT)).toEqual({
      name: "Theo Testesen",
      cprNumber: "0101901234",
      dateOfBirth: "1990-01-01",
      address: "Testvej 1, 5000 Odense C",
      email: undefined,
      assuranceLevel: "SUBSTANTIAL",
      identityStatus: "ACTIVE",
      cprStatus: "Active, domicile in Danish Civil Registration System",
      protectedName: false,
      protectedAddress: false,
      fetchedAt: "2026-10-21T12:00:00.000Z",
    });
  });

  it("includes c/o and email when MitID has them", () => {
    const details = toIdentityDetails(
      {
        ...RECORD,
        cprAddress: { ...RECORD.cprAddress, coName: "Anna Andersen" },
        attributes: { ...RECORD.attributes, email: "theo@example.com" },
      },
      FETCHED_AT,
    );

    expect(details.address).toBe("c/o Anna Andersen, Testvej 1, 5000 Odense C");
    expect(details.email).toBe("theo@example.com");
  });

  it("falls back to the registered address when there is no CPR address", () => {
    expect(toIdentityDetails({ ...RECORD, cprAddress: null }, FETCHED_AT).address).toBe("Testvej 1");
  });

  it("refuses a record without a CPR number", () => {
    expect(() => toIdentityDetails({ ...RECORD, cprNumber: undefined }, FETCHED_AT)).toThrow("missing cprNumber");
  });
});

describe("ageOn", () => {
  it("counts a birthday only once it has been reached", () => {
    expect(ageOn("1990-10-21", new Date(2026, 9, 20))).toBe(35);
    expect(ageOn("1990-10-21", new Date(2026, 9, 21))).toBe(36);
  });
});

describe("attentionNotes", () => {
  const normal = toIdentityDetails(RECORD, FETCHED_AT);

  it("is empty for an active, unprotected Identity", () => {
    expect(attentionNotes(normal)).toEqual([]);
  });

  it("lists every abnormal status and protection", () => {
    expect(
      attentionNotes({
        ...normal,
        identityStatus: "SUSPENDED",
        cprStatus: "Deceased",
        protectedName: true,
        protectedAddress: true,
      }),
    ).toEqual(["Identity status: SUSPENDED", "CPR status: Deceased", "Name is protected", "Address is protected"]);
  });
});
