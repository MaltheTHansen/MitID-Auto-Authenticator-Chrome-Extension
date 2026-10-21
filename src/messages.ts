export const APPROVE_FIRST_IDENTITY_COMMAND = "approve-first-identity";

export type Command = { type: "approve"; userId: string } | { type: "add-identity"; userId: string };

export function sendCommand(command: Command): void {
  chrome.runtime.sendMessage(command).catch(ignoreUnansweredMessage);
}

function ignoreUnansweredMessage(): void {}
