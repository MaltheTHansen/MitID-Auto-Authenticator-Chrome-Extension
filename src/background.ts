import { type AddOutcome, provisionIdentity } from "./addIdentity.js";
import { approveLoginRequest } from "./approve.js";
import { flashBadge, markApprovalFinished, markApprovalStarted } from "./badge.js";
import { findIdentity, type Identity, userIdKey, withIdentity } from "./identity.js";
import { APPROVE_FIRST_IDENTITY_COMMAND, broadcastStatus, type Command, type Status } from "./messages.js";
import { loadAdminCredential, loadIdentities, saveIdentities } from "./store.js";

const PANEL_WINDOW_SIZE = { width: 380, height: 640 };

const operationsInProgress = new Set<string>();
let panelWindowId: number | undefined;

openPanelFromToolbarButton();

chrome.commands.onCommand.addListener((command) => {
  if (command === APPROVE_FIRST_IDENTITY_COMMAND) void approveFirstIdentity();
});

chrome.runtime.onMessage.addListener((command: Command) => {
  if (command.type === "approve") void approveByUserId(command.userId);
  if (command.type === "add-identity") void addIdentity(command.userId);
});

function openPanelFromToolbarButton(): void {
  if (chrome.sidePanel) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } else {
    chrome.action.onClicked.addListener(() => void openPanelWindow());
  }
}

async function openPanelWindow(): Promise<void> {
  if (panelWindowId !== undefined) {
    try {
      await chrome.windows.update(panelWindowId, { focused: true });
      return;
    } catch {
      panelWindowId = undefined;
    }
  }
  const panelWindow = await chrome.windows.create({ url: "sidepanel.html", type: "popup", ...PANEL_WINDOW_SIZE });
  panelWindowId = panelWindow?.id;
}

async function approveFirstIdentity(): Promise<void> {
  const [first] = await loadIdentities();
  if (first) {
    await approve(first);
  } else {
    flashBadge("failure");
    broadcastStatus({ kind: "error", text: "No Identities to approve. Add one in the side panel first." });
  }
}

async function approveByUserId(userId: string): Promise<void> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (identity) await approve(identity);
}

function approve(identity: Identity): Promise<void> {
  return exclusively(`approve:${userIdKey(identity.userId)}`, async () => {
    markApprovalStarted();
    broadcastStatus({ kind: "progress", text: `Waiting for a Login request for ${identity.userId}…` });
    const status = await approvalStatus(identity);
    markApprovalFinished(status.kind === "success" ? "success" : "failure");
    broadcastStatus(status);
  });
}

async function approvalStatus(identity: Identity): Promise<Status> {
  try {
    const result = await approveLoginRequest(identity);
    if (result.outcome === "nothing-pending") {
      return { kind: "error", text: `No pending Login request for ${identity.userId}` };
    }
    const serviceProvider = result.serviceProviderName ? ` → ${result.serviceProviderName}` : "";
    return { kind: "success", text: `✓ Approved ${identity.userId}${serviceProvider}`, detail: result.referenceText };
  } catch (error) {
    return { kind: "error", text: `Approve failed for ${identity.userId}: ${messageOf(error)}` };
  }
}

function addIdentity(rawUserId: string): Promise<void> {
  const userId = rawUserId.trim();
  if (!userId) return Promise.resolve();

  return exclusively(`add:${userIdKey(userId)}`, async () => {
    if (findIdentity(await loadIdentities(), userId)) {
      broadcastStatus(alreadyListedStatus(userId));
      return;
    }
    const credential = await loadAdminCredential();
    if (!credential) {
      broadcastStatus({ kind: "error", text: "Add the MitID admin credential in Options before adding Identities." });
      return;
    }

    broadcastStatus({ kind: "progress", text: `Adding ${userId}…` });
    try {
      const { identity, outcome } = await provisionIdentity(userId, credential);
      const identities = await loadIdentities();
      if (findIdentity(identities, userId)) {
        broadcastStatus(alreadyListedStatus(userId));
        return;
      }
      await saveIdentities(withIdentity(identities, identity));
      broadcastStatus(addedStatus(userId, outcome));
    } catch (error) {
      broadcastStatus({ kind: "error", text: `Could not add ${userId}: ${messageOf(error)}` });
    }
  });
}

async function exclusively(key: string, operation: () => Promise<void>): Promise<void> {
  if (operationsInProgress.has(key)) return;
  operationsInProgress.add(key);
  try {
    await operation();
  } finally {
    operationsInProgress.delete(key);
  }
}

function alreadyListedStatus(userId: string): Status {
  return { kind: "notice", text: `${userId} is already in the list` };
}

function addedStatus(userId: string, outcome: AddOutcome): Status {
  switch (outcome) {
    case "added-existing":
      return { kind: "success", text: `Added existing Identity ${userId}` };
    case "added-simulator":
      return { kind: "success", text: `Added ${userId} and gave it a new Simulator` };
    case "created-identity":
      return { kind: "notice", text: `Created new Identity ${userId} with mock data` };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
