import { type AddOutcome, provisionIdentity } from "./addIdentity.js";
import { approveLoginRequest } from "./approve.js";
import { flashBadge, markApprovalFinished, markApprovalStarted } from "./badge.js";
import { findIdentity, type Identity, userIdKey, withIdentity } from "./identity.js";
import { APPROVE_FIRST_IDENTITY_COMMAND, type Command } from "./messages.js";
import { reportStatus, type Status } from "./status.js";
import { loadAdminCredential, loadIdentities, saveIdentities } from "./store.js";

const operationsInProgress = new Set<string>();

chrome.commands.onCommand.addListener((command) => {
  if (command === APPROVE_FIRST_IDENTITY_COMMAND) void approveFirstIdentity();
});

chrome.runtime.onMessage.addListener((command: Command) => {
  if (command.type === "approve") void approveByUserId(command.userId);
  if (command.type === "add-identity") void addIdentity(command.userId);
});

async function approveFirstIdentity(): Promise<void> {
  const [first] = await loadIdentities();
  if (first) {
    await approve(first);
  } else {
    flashBadge("failure");
    reportStatus({ kind: "error", text: "No Identities to approve. Add one in the popup first." });
  }
}

async function approveByUserId(userId: string): Promise<void> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (identity) await approve(identity);
}

function approve(identity: Identity): Promise<void> {
  return exclusively(`approve:${userIdKey(identity.userId)}`, async () => {
    markApprovalStarted();
    reportStatus({ kind: "progress", text: `Waiting for a Login request for ${identity.userId}…` });
    const status = await approvalStatus(identity);
    markApprovalFinished(status.kind === "success" ? "success" : "failure");
    reportStatus(status);
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
      reportStatus(alreadyListedStatus(userId));
      return;
    }
    const credential = await loadAdminCredential();
    if (!credential) {
      reportStatus({ kind: "error", text: "Add the MitID admin credential in Options before adding Identities." });
      return;
    }

    reportStatus({ kind: "progress", text: `Adding ${userId}…` });
    try {
      const { identity, outcome } = await provisionIdentity(userId, credential);
      const identities = await loadIdentities();
      if (findIdentity(identities, userId)) {
        reportStatus(alreadyListedStatus(userId));
        return;
      }
      await saveIdentities(withIdentity(identities, identity));
      reportStatus(addedStatus(userId, outcome));
    } catch (error) {
      reportStatus({ kind: "error", text: `Could not add ${userId}: ${messageOf(error)}` });
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
