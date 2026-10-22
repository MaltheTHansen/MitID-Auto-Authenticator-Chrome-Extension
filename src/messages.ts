export type Command =
  | { type: "log-in"; userId: string }
  | { type: "approve"; userId: string }
  | { type: "add-identity"; userId: string };

export function sendCommand(command: Command): void {
  chrome.runtime.sendMessage(command).catch(ignoreUnansweredMessage);
}

function ignoreUnansweredMessage(): void {}
