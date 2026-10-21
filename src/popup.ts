import { type Identity, withIdentityMoved, withoutIdentity } from "./identity.js";
import { APPROVE_FIRST_IDENTITY_COMMAND, sendCommand } from "./messages.js";
import { cprNumberOf } from "./cprNumber.js";
import { loadLatestStatus, onStatusReported, reportStatus, type Status } from "./status.js";
import { loadIdentities, onIdentitiesChanged, saveIdentities } from "./store.js";

const addForm = document.querySelector<HTMLFormElement>("#add-form")!;
const userIdInput = document.querySelector<HTMLInputElement>("#user-id")!;
const statusLine = document.querySelector<HTMLElement>("#status")!;
const identityList = document.querySelector<HTMLOListElement>("#identities")!;
const emptyState = document.querySelector<HTMLElement>("#empty")!;
const rowTemplate = document.querySelector<HTMLTemplateElement>("#identity-row")!;
const shortcutHint = document.querySelector<HTMLElement>("#shortcut-hint")!;

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendCommand({ type: "add-identity", userId: userIdInput.value });
  userIdInput.value = "";
});

identityList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  const userId = button?.closest<HTMLElement>("[data-user-id]")?.dataset.userId;
  if (button && userId) void runRowAction(button.dataset.action!, userId);
});

document.querySelector("#open-options")!.addEventListener("click", () => void chrome.runtime.openOptionsPage());

onStatusReported(showStatus);
void loadLatestStatus().then((status) => status && showStatus(status));
onIdentitiesChanged(renderIdentities);
void loadIdentities().then(renderIdentities);
void showShortcutHint();

async function runRowAction(action: string, userId: string): Promise<void> {
  if (action === "approve") {
    sendCommand({ type: "approve", userId });
    return;
  }
  if (action === "copy-cpr") {
    await copyCprNumber(userId);
    return;
  }
  const identities = await loadIdentities();
  if (action === "up") await saveIdentities(withIdentityMoved(identities, userId, -1));
  if (action === "down") await saveIdentities(withIdentityMoved(identities, userId, 1));
  if (action === "remove") await saveIdentities(withoutIdentity(identities, userId));
}

async function copyCprNumber(userId: string): Promise<void> {
  try {
    const cprNumber = await cprNumberOf(userId);
    await navigator.clipboard.writeText(cprNumber);
    reportStatus({ kind: "success", text: `Copied CPR number ${cprNumber} for ${userId}` });
  } catch (error) {
    reportStatus({ kind: "error", text: `Could not copy the CPR number for ${userId}: ${messageOf(error)}` });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderIdentities(identities: Identity[]): void {
  identityList.replaceChildren(...identities.map(identityRow));
  emptyState.hidden = identities.length > 0;
}

function identityRow(identity: Identity, index: number, identities: Identity[]): HTMLElement {
  const row = rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  row.dataset.userId = identity.userId;
  row.querySelector(".user-id")!.textContent = identity.userId;
  row.querySelector<HTMLButtonElement>("[data-action=up]")!.disabled = index === 0;
  row.querySelector<HTMLButtonElement>("[data-action=down]")!.disabled = index === identities.length - 1;
  return row;
}

function showStatus(status: Status): void {
  statusLine.hidden = false;
  statusLine.dataset.kind = status.kind;
  statusLine.querySelector(".text")!.textContent = status.text;
  statusLine.querySelector(".detail")!.textContent = status.detail ?? "";
}

async function showShortcutHint(): Promise<void> {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((command) => command.name === APPROVE_FIRST_IDENTITY_COMMAND)?.shortcut;
  shortcutHint.textContent = shortcut ? `${shortcut} approves the first Identity` : "No shortcut set";
}
