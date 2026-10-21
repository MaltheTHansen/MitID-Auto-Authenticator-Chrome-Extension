import { findIdentity, withIdentityUpdated } from "./identity.js";
import { fetchAdminToken, fetchCprNumber } from "./mitid/adminApi.js";
import { loadAdminCredential, loadIdentities, saveIdentities } from "./store.js";

export async function cprNumberOf(userId: string): Promise<string> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (!identity) throw new Error(`${userId} is no longer in the list`);
  if (identity.cprNumber) return identity.cprNumber;

  const credential = await loadAdminCredential();
  if (!credential) throw new Error("add the MitID admin credential in Options to look it up");
  const cprNumber = await fetchCprNumber(await fetchAdminToken(credential), identity.identityId);

  await saveIdentities(withIdentityUpdated(await loadIdentities(), { ...identity, cprNumber }));
  return cprNumber;
}
