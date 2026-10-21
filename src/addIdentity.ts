import type { Identity } from "./identity.js";
import {
  type AdminCredential,
  createIdentity,
  createSimulator,
  fetchAdminToken,
  findIdentityId,
  listActiveAuthenticatorIds,
} from "./mitid/adminApi.js";
import { respondsAsSimulator } from "./mitid/simulatorApi.js";

export type AddOutcome = "added-existing" | "added-simulator" | "created-identity";

export async function provisionIdentity(
  userId: string,
  credential: AdminCredential,
): Promise<{ identity: Identity; outcome: AddOutcome }> {
  const token = await fetchAdminToken(credential);

  let identityId = await findIdentityId(token, userId);
  const createdIdentity = !identityId;
  if (!identityId) {
    await createIdentity(token, userId);
    identityId = await findIdentityId(token, userId);
    if (!identityId) throw new Error("MitID did not return the newly created Identity");
  }

  let authenticatorId = await findSimulatorAuthenticatorId(token, identityId);
  const addedSimulator = !authenticatorId;
  if (!authenticatorId) {
    await createSimulator(token, identityId);
    authenticatorId = await findSimulatorAuthenticatorId(token, identityId);
    if (!authenticatorId) throw new Error("MitID did not activate the new Simulator");
  }

  const outcome = createdIdentity ? "created-identity" : addedSimulator ? "added-simulator" : "added-existing";
  return { identity: { userId, identityId, authenticatorId }, outcome };
}

async function findSimulatorAuthenticatorId(token: string, identityId: string): Promise<string | undefined> {
  for (const authenticatorId of await listActiveAuthenticatorIds(token, identityId)) {
    if (await respondsAsSimulator({ identityId, authenticatorId })) return authenticatorId;
  }
  return undefined;
}
