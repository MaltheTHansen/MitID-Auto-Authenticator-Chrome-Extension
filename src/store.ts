import type { Identity } from "./identity.js";
import type { AdminCredential } from "./mitid/adminApi.js";

const IDENTITIES_KEY = "identities";
const ADMIN_CREDENTIAL_KEY = "adminCredential";

export async function loadIdentities(): Promise<Identity[]> {
  const stored = await chrome.storage.local.get(IDENTITIES_KEY);
  return (stored[IDENTITIES_KEY] as Identity[] | undefined) ?? [];
}

export function saveIdentities(identities: readonly Identity[]): Promise<void> {
  return chrome.storage.local.set({ [IDENTITIES_KEY]: identities });
}

export function onIdentitiesChanged(listener: (identities: Identity[]) => void): void {
  chrome.storage.local.onChanged.addListener((changes) => {
    const change = changes[IDENTITIES_KEY];
    if (change) listener((change.newValue as Identity[] | undefined) ?? []);
  });
}

export async function loadAdminCredential(): Promise<AdminCredential | undefined> {
  const stored = await chrome.storage.local.get(ADMIN_CREDENTIAL_KEY);
  return stored[ADMIN_CREDENTIAL_KEY] as AdminCredential | undefined;
}

export function saveAdminCredential(credential: AdminCredential): Promise<void> {
  return credential.clientId && credential.clientSecret
    ? chrome.storage.local.set({ [ADMIN_CREDENTIAL_KEY]: credential })
    : chrome.storage.local.remove(ADMIN_CREDENTIAL_KEY);
}
