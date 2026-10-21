import { mergeIdentities } from "./identity.js";
import { loadAdminCredential, loadIdentities, saveAdminCredential, saveIdentities } from "./store.js";
import { parseUsersFile, serializeUsersFile } from "./usersFile.js";

const credentialForm = document.querySelector<HTMLFormElement>("#credential-form")!;
const clientIdInput = document.querySelector<HTMLInputElement>("#client-id")!;
const clientSecretInput = document.querySelector<HTMLInputElement>("#client-secret")!;
const credentialResult = document.querySelector<HTMLElement>("#credential-result")!;
const usersFileText = document.querySelector<HTMLTextAreaElement>("#users-file")!;
const usersFileResult = document.querySelector<HTMLElement>("#users-file-result")!;

const MISSING_CREDENTIAL_TEXT = "No credential set. You can approve, but not add Identities.";

void loadAdminCredential().then((credential) => {
  clientIdInput.value = credential?.clientId ?? "";
  clientSecretInput.value = credential?.clientSecret ?? "";
  if (!credential) credentialResult.textContent = MISSING_CREDENTIAL_TEXT;
});

credentialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const credential = { clientId: clientIdInput.value.trim(), clientSecret: clientSecretInput.value.trim() };
  if (Boolean(credential.clientId) !== Boolean(credential.clientSecret)) {
    credentialResult.textContent = "Not saved. Fill in both the client ID and the client secret.";
    return;
  }
  await saveAdminCredential(credential);
  credentialResult.textContent = credential.clientId ? "Saved." : `Cleared. ${MISSING_CREDENTIAL_TEXT}`;
});

document.querySelector("#import")!.addEventListener("click", async () => {
  const { identities: imported, invalidLines } = parseUsersFile(usersFileText.value);
  const { merged, addedCount } = mergeIdentities(await loadIdentities(), imported);
  await saveIdentities(merged);
  usersFileResult.textContent = importSummary(addedCount, imported.length - addedCount, invalidLines);
});

document.querySelector("#export")!.addEventListener("click", async () => {
  usersFileText.value = serializeUsersFile(await loadIdentities());
  usersFileText.select();
  usersFileResult.textContent = "Current Identities are in the box above.";
});

function importSummary(addedCount: number, alreadyListedCount: number, invalidLines: string[]): string {
  const parts = [`Imported ${addedCount} Identities.`];
  if (alreadyListedCount) parts.push(`Skipped ${alreadyListedCount} already in the list.`);
  if (invalidLines.length) parts.push(`Ignored ${invalidLines.length} invalid lines: ${invalidLines.join(" | ")}`);
  return parts.join(" ");
}
