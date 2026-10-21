import type { IdentityDetails } from "./identityDetails.js";

export interface Identity {
  userId: string;
  identityId: string;
  authenticatorId: string;
  cprNumber?: string;
  details?: IdentityDetails;
}

export type SimulatorRef = Pick<Identity, "identityId" | "authenticatorId">;

export function findIdentity(identities: readonly Identity[], userId: string): Identity | undefined {
  return identities.find((identity) => sameUserId(identity.userId, userId));
}

export function withIdentity(identities: readonly Identity[], identity: Identity): Identity[] {
  return [...identities, identity];
}

export function withoutIdentity(identities: readonly Identity[], userId: string): Identity[] {
  return identities.filter((identity) => !sameUserId(identity.userId, userId));
}

export function withIdentityUpdated(identities: readonly Identity[], updated: Identity): Identity[] {
  return identities.map((identity) => (sameUserId(identity.userId, updated.userId) ? updated : identity));
}

export function withIdentityMoved(identities: readonly Identity[], userId: string, offset: -1 | 1): Identity[] {
  const from = identities.findIndex((identity) => sameUserId(identity.userId, userId));
  const to = from + offset;
  if (from < 0 || to < 0 || to >= identities.length) return [...identities];

  const reordered = [...identities];
  [reordered[from], reordered[to]] = [reordered[to]!, reordered[from]!];
  return reordered;
}

export function mergeIdentities(
  identities: readonly Identity[],
  imported: readonly Identity[],
): { merged: Identity[]; addedCount: number } {
  const merged = [...identities];
  for (const identity of imported) {
    if (!findIdentity(merged, identity.userId)) merged.push(identity);
  }
  return { merged, addedCount: merged.length - identities.length };
}

export function userIdKey(userId: string): string {
  return userId.toLocaleLowerCase("da-DK");
}

function sameUserId(a: string, b: string): boolean {
  return userIdKey(a) === userIdKey(b);
}
