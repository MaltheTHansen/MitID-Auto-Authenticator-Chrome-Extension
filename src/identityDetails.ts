import type { MitIdIdentityRecord } from "./mitid/adminApi.js";

const NORMAL_IDENTITY_STATUS = "ACTIVE";
const NORMAL_CPR_STATUS_PREFIX = "Active";

export interface IdentityDetails {
  name?: string;
  cprNumber: string;
  dateOfBirth?: string;
  address?: string;
  email?: string;
  assuranceLevel?: string;
  identityStatus?: string;
  cprStatus?: string;
  protectedName: boolean;
  protectedAddress: boolean;
  fetchedAt: string;
}

export function toIdentityDetails(record: MitIdIdentityRecord, fetchedAt: Date): IdentityDetails {
  if (!record.cprNumber) throw new Error("MitID's response is missing cprNumber");
  return {
    name: record.identityName,
    cprNumber: record.cprNumber,
    dateOfBirth: record.dateOfBirth,
    address: formatAddress(record),
    email: record.attributes?.email,
    assuranceLevel: record.ial,
    identityStatus: record.identityStatus,
    cprStatus: record.cprStatus,
    protectedName: record.attributes?.protectedStatusForName === "true",
    protectedAddress: record.attributes?.protectedStatusForAddress === "true",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const [year, month, day] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const hadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthdayThisYear ? 0 : 1);
}

export function attentionNotes(details: IdentityDetails): string[] {
  const notes: string[] = [];
  if (details.identityStatus && details.identityStatus !== NORMAL_IDENTITY_STATUS) {
    notes.push(`Identity status: ${details.identityStatus}`);
  }
  if (details.cprStatus && !details.cprStatus.startsWith(NORMAL_CPR_STATUS_PREFIX)) {
    notes.push(`CPR status: ${details.cprStatus}`);
  }
  if (details.protectedName) notes.push("Name is protected");
  if (details.protectedAddress) notes.push("Address is protected");
  return notes;
}

function formatAddress(record: MitIdIdentityRecord): string | undefined {
  const cprAddress = record.cprAddress;
  if (!cprAddress?.address) return record.registeredAddress;

  const town = [cprAddress.postalCode, cprAddress.postalDistrict ?? cprAddress.city].filter(Boolean).join(" ");
  return [cprAddress.coName && `c/o ${cprAddress.coName}`, cprAddress.address, town].filter(Boolean).join(", ");
}
