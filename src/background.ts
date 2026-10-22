import { type AddOutcome, provisionIdentity } from "./addIdentity.js";
import { approveLoginRequest } from "./approve.js";
import { markApprovalFinished, markApprovalStarted } from "./badge.js";
import { findIdentity, type Identity, userIdKey, withIdentity, withIdentityFirst } from "./identity.js";
import { loginPageAux, submitAuthCode } from "./loginPage.js";
import type { Command } from "./messages.js";
import { finishAppLogin, startAppLogin } from "./mitid/coreClientApi.js";
import { reportStatus, type Status } from "./status.js";
import { loadAdminCredential, loadIdentities, saveIdentities } from "./store.js";

const operationsInProgress = new Set<string>();

void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

chrome.runtime.onMessage.addListener((command: Command, sender) => {
  if (command.type === "log-in") void logInByUserId(command.userId, sender.tab?.id);
  if (command.type === "approve") void approveByUserId(command.userId);
  if (command.type === "add-identity") void addIdentity(command.userId);
});

async function logInByUserId(userId: string, tabId: number | undefined): Promise<void> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (identity) await logIn(identity, tabId ?? (await activeTabId()));
}

function logIn(identity: Identity, tabId: number): Promise<void> {
  return exclusively(`log-in:${userIdKey(identity.userId)}`, () =>
    useIdentity(identity, `Logging in ${identity.userId}…`, () => logInStatus(identity, tabId)),
  );
}

async function logInStatus(identity: Identity, tabId: number): Promise<Status> {
  try {
    const aux = await loginPageAux(tabId);
    if (!aux) return { kind: "error", text: "Open the MitID login page in this tab to log in" };

    const appLogin = await startAppLogin(aux, identity.userId);
    const approval = await approveLoginRequest(identity);
    if (approval.outcome === "nothing-pending") {
      return { kind: "error", text: `MitID sent no Login request to ${identity.userId}'s Simulator` };
    }
    await submitAuthCode(tabId, await finishAppLogin(appLogin));
    return {
      kind: "success",
      text: `✓ Logged in ${identity.userId}${serviceProviderSuffix(approval)}`,
      detail: approval.referenceText,
    };
  } catch (error) {
    return { kind: "error", text: `Could not log in ${identity.userId}: ${messageOf(error)}` };
  }
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error("no active tab");
  return tab.id;
}

async function approveByUserId(userId: string): Promise<void> {
  const identity = findIdentity(await loadIdentities(), userId);
  if (identity) await approve(identity);
}

function approve(identity: Identity): Promise<void> {
  return exclusively(`approve:${userIdKey(identity.userId)}`, () =>
    useIdentity(identity, `Waiting for a Login request for ${identity.userId}…`, () => approvalStatus(identity)),
  );
}

async function useIdentity(identity: Identity, progressText: string, use: () => Promise<Status>): Promise<void> {
  markApprovalStarted();
  reportStatus({ kind: "progress", text: progressText });
  const status = await use();
  markApprovalFinished(status.kind === "success" ? "success" : "failure");
  if (status.kind === "success") await saveIdentities(withIdentityFirst(await loadIdentities(), identity.userId));
  reportStatus(status);
}

async function approvalStatus(identity: Identity): Promise<Status> {
  try {
    const result = await approveLoginRequest(identity);
    if (result.outcome === "nothing-pending") {
      return { kind: "error", text: `No pending Login request for ${identity.userId}` };
    }
    return { kind: "success", text: `✓ Approved ${identity.userId}${serviceProviderSuffix(result)}`, detail: result.referenceText };
  } catch (error) {
    return { kind: "error", text: `Approve failed for ${identity.userId}: ${messageOf(error)}` };
  }
}

function serviceProviderSuffix(approval: { serviceProviderName?: string }): string {
  return approval.serviceProviderName ? ` → ${approval.serviceProviderName}` : "";
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
