import { delay } from "../delay.js";
import { MITID_PREPROD, MitIdApiError, postJson, required, send, sendForJson } from "./http.js";
import { SIMULATOR_PIN } from "./simulatorApi.js";

// MitID pre-production intermittently rejects valid admin credentials with 403; retrying gets through.
const ADMIN_LOGIN_ATTEMPTS = 6;
const ADMIN_LOGIN_RETRY_MS = 1000;

const SIMULATED_ANDROID_DEVICE = {
  osName: "Android",
  osVersion: "10",
  model: "SM-A515F",
  hwGenKey: "true",
  jailbrokenStatus: "false",
  malwareOnDevice: "false",
  appName: "MitID app",
  appVersion: "1.0.0",
  appIdent: "dk.mitid.app.android",
  sdkVersion: "1.0.0",
  swFingerprint: "4b58eee4672b4ec29682fa35902589fde2bc04ba7de843b1941ba69233b79819",
  extra: JSON.stringify({ packageName: "dk.mitid.app.android" }),
};

export interface AdminCredential {
  clientId: string;
  clientSecret: string;
}

interface Authenticator {
  authenticatorId: string;
  state: string;
}

export async function fetchAdminToken(credential: AdminCredential): Promise<string> {
  const url = `${MITID_PREPROD}/mitid-administrative-idp/oauth/token?grant_type=client_credentials`;
  const init = {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${credential.clientId}:${credential.clientSecret}`)}` },
  };

  for (let attempt = 1; ; attempt++) {
    try {
      const token = await sendForJson<{ access_token?: string }>("admin login", url, init);
      return required(token.access_token, "access_token");
    } catch (error) {
      if (!(error instanceof MitIdApiError) || attempt === ADMIN_LOGIN_ATTEMPTS) throw error;
      await delay(ADMIN_LOGIN_RETRY_MS);
    }
  }
}

export async function findIdentityId(token: string, userId: string): Promise<string | undefined> {
  const result = await sendForJson<{ identities?: { identityId?: string }[] }>(
    "identity lookup",
    `${MITID_PREPROD}/administration/v5/identities`,
    postJson({ userId, exactMatch: true }, bearer(token)),
  );
  return result.identities?.[0]?.identityId;
}

export async function createIdentity(token: string, userId: string): Promise<void> {
  const mockIdentity = await sendForJson<Record<string, unknown>>(
    "test person autofill",
    `${MITID_PREPROD}/mitid-test-api/v4/testpersons`,
    postJson({ countryCode: "DK" }, bearer(token)),
  );
  await send(
    "identity creation",
    `${MITID_PREPROD}/mitid-test-api/v4/identities`,
    postJson({ ...mockIdentity, identity: userId }, bearer(token)),
  );
}

export async function listActiveAuthenticatorIds(token: string, identityId: string): Promise<string[]> {
  const authenticators = await sendForJson<Authenticator[] | undefined>(
    "authenticator lookup",
    `${MITID_PREPROD}/administration/v4/identities/${identityId}/authenticators`,
    { headers: bearer(token) },
  );
  if (!Array.isArray(authenticators)) throw new Error("MitID's response is missing the authenticator list");
  return authenticators.filter((a) => a.state === "ACTIVE").map((a) => a.authenticatorId);
}

export async function createSimulator(token: string, identityId: string): Promise<void> {
  await send(
    "simulator creation",
    `${MITID_PREPROD}/mitid-test-api/v4/identities/${identityId}/authenticators/code-app/simulator`,
    postJson(
      { activate: true, ael: "SUBSTANTIAL", device: btoa(JSON.stringify(SIMULATED_ANDROID_DEVICE)), pin: SIMULATOR_PIN },
      bearer(token),
    ),
  );
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
