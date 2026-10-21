import { detailsCardContent } from "./detailsCard.js";
import { cprNumberOf, lookUpDetails } from "./detailsLookup.js";
import { findIdentity, type Identity, userIdKey, withIdentityMoved, withoutIdentity } from "./identity.js";
import { attentionNotes } from "./identityDetails.js";
import { APPROVE_FIRST_IDENTITY_COMMAND, sendCommand } from "./messages.js";
import { loadLatestStatus, onStatusReported, reportStatus, type Status } from "./status.js";
import { loadIdentities, onIdentitiesChanged, saveIdentities } from "./store.js";

const addForm = document.querySelector<HTMLFormElement>("#add-form")!;
const userIdInput = document.querySelector<HTMLInputElement>("#user-id")!;
const statusLine = document.querySelector<HTMLElement>("#status")!;
const identityList = document.querySelector<HTMLOListElement>("#identities")!;
const emptyState = document.querySelector<HTMLElement>("#empty")!;
const rowTemplate = document.querySelector<HTMLTemplateElement>("#identity-row")!;
const shortcutHint = document.querySelector<HTMLElement>("#shortcut-hint")!;

const expandedUserIds = new Set<string>();
const lookupsInProgress = new Set<string>();
const lookupErrors = new Map<string, string>();
let identities: Identity[] = [];

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendCommand({ type: "add-identity", userId: userIdInput.value });
  userIdInput.value = "";
});

identityList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  const userId = button?.closest<HTMLElement>("[data-user-id]")?.dataset.userId;
  if (button && userId) void runRowAction(button, userId);
});

document.querySelector("#open-options")!.addEventListener("click", () => void chrome.runtime.openOptionsPage());

onStatusReported(showStatus);
void loadLatestStatus().then((status) => status && showStatus(status));
onIdentitiesChanged(renderIdentities);
void loadIdentities().then(renderIdentities);
void showShortcutHint();

async function runRowAction(button: HTMLButtonElement, userId: string): Promise<void> {
  switch (button.dataset.action) {
    case "approve":
      return sendCommand({ type: "approve", userId });
    case "toggle-details":
      return toggleDetails(userId);
    case "refresh-details":
      return refreshDetails(userId);
    case "copy-cpr":
      return copyToClipboard(userId, "CPR number", () => cprNumberOf(userId));
    case "copy":
      return copyToClipboard(userId, button.dataset.copyLabel!, async () => button.dataset.copyValue!);
    case "up":
      return saveIdentities(withIdentityMoved(await loadIdentities(), userId, -1));
    case "down":
      return saveIdentities(withIdentityMoved(await loadIdentities(), userId, 1));
    case "remove":
      return saveIdentities(withoutIdentity(await loadIdentities(), userId));
  }
}

function toggleDetails(userId: string): void {
  const key = userIdKey(userId);
  if (expandedUserIds.delete(key)) {
    renderIdentities(identities);
    return;
  }
  expandedUserIds.add(key);
  if (findIdentity(identities, userId)?.details) renderIdentities(identities);
  else void refreshDetails(userId);
}

async function refreshDetails(userId: string): Promise<void> {
  const key = userIdKey(userId);
  if (lookupsInProgress.has(key)) return;
  lookupsInProgress.add(key);
  lookupErrors.delete(key);
  renderIdentities(identities);
  try {
    await lookUpDetails(userId);
  } catch (error) {
    lookupErrors.set(key, messageOf(error));
  } finally {
    lookupsInProgress.delete(key);
    renderIdentities(identities);
  }
}

async function copyToClipboard(userId: string, label: string, value: () => Promise<string>): Promise<void> {
  try {
    const text = await value();
    await navigator.clipboard.writeText(text);
    reportStatus({ kind: "success", text: `Copied ${label} for ${userId}`, detail: text });
  } catch (error) {
    reportStatus({ kind: "error", text: `Could not copy the ${label} for ${userId}: ${messageOf(error)}` });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderIdentities(latest: Identity[]): void {
  identities = latest;
  identityList.replaceChildren(...identities.map(identityRow));
  emptyState.hidden = identities.length > 0;
}

function identityRow(identity: Identity, index: number, all: Identity[]): HTMLElement {
  const key = userIdKey(identity.userId);
  const expanded = expandedUserIds.has(key);
  const row = rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLElement;
  row.dataset.userId = identity.userId;

  const toggle = row.querySelector<HTMLButtonElement>("[data-action=toggle-details]")!;
  toggle.textContent = identity.userId;
  toggle.setAttribute("aria-expanded", String(expanded));

  const notes = identity.details ? attentionNotes(identity.details) : [];
  const attention = row.querySelector<HTMLElement>(".attention")!;
  attention.hidden = notes.length === 0;
  attention.title = notes.join("\n");

  row.querySelector<HTMLButtonElement>("[data-action=up]")!.disabled = index === 0;
  row.querySelector<HTMLButtonElement>("[data-action=down]")!.disabled = index === all.length - 1;

  const card = row.querySelector<HTMLElement>(".details")!;
  card.hidden = !expanded;
  if (expanded) {
    card.replaceChildren(
      ...detailsCardContent(
        { details: identity.details, loading: lookupsInProgress.has(key), error: lookupErrors.get(key) },
        new Date(),
      ),
    );
  }
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
