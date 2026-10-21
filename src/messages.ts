export const APPROVE_FIRST_IDENTITY_COMMAND = "approve-first-identity";

export type Command = { type: "approve"; userId: string } | { type: "add-identity"; userId: string };

export type StatusKind = "progress" | "success" | "notice" | "error";

export interface Status {
  kind: StatusKind;
  text: string;
  detail?: string;
}

export interface StatusMessage {
  type: "status";
  status: Status;
}

export function sendCommand(command: Command): void {
  chrome.runtime.sendMessage(command).catch(ignoreUnansweredMessage);
}

export function broadcastStatus(status: Status): void {
  const message: StatusMessage = { type: "status", status };
  chrome.runtime.sendMessage(message).catch(ignoreUnansweredMessage);
}

export function onStatus(listener: (status: Status) => void): void {
  chrome.runtime.onMessage.addListener((message: StatusMessage | Command) => {
    if (message.type === "status") listener(message.status);
  });
}

function ignoreUnansweredMessage(): void {}
