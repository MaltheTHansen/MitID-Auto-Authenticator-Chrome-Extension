import { findIdentity, type Identity, withIdentityUpdated } from "./identity.js";
import { type IdentityDetails, toIdentityDetails } from "./identityDetails.js";
import { fetchAdminToken, fetchIdentityRecord } from "./mitid/adminApi.js";
import { loadAdminCredential, loadIdentities, saveIdentities } from "./store.js";

export async function cprNumberOf(userId: string): Promise<string> {
  const identity = await listedIdentity(userId);
  return identity.cprNumber ?? (await lookUpDetails(userId)).cprNumber;
}

export async function lookUpDetails(userId: string): Promise<IdentityDetails> {
  const identity = await listedIdentity(userId);
  const credential = await loadAdminCredential();
  if (!credential) throw new Error("add the MitID admin credential in Options to look it up");

  const record = await fetchIdentityRecord(await fetchAdminToken(credential), identity.identityId);
  const details = toIdentityDetails(record, new Date());

  const latest = await listedIdentity(userId);
  await saveIdentities(withIdentityUpdated(await loadIdentities(), { ...latest, cprNumber: details.cprNumber, details }));
  return details;
}

async function listedIdentity(userId: string): Promise<Identity> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (!identity) throw new Error(`${userId} is no longer in the list`);
  return identity;
}
