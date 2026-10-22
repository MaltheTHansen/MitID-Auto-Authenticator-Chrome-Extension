type BadgeResult = "success" | "failure";

const PROGRESS_BADGE = { text: "…", color: "#5b6b7f" };
const RESULT_BADGES: Record<BadgeResult, { text: string; color: string }> = {
  success: { text: "✓", color: "#1a7f37" },
  failure: { text: "✗", color: "#c62828" },
};

const RESULT_VISIBLE_MS = 5000;

let approvalsRunning = 0;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

export function markApprovalStarted(): void {
  approvalsRunning++;
  clearTimeout(clearTimer);
  setBadge(PROGRESS_BADGE);
}

export function markApprovalFinished(result: BadgeResult): void {
  approvalsRunning--;
  if (approvalsRunning === 0) flashBadge(result);
}

function flashBadge(result: BadgeResult): void {
  clearTimeout(clearTimer);
  setBadge(RESULT_BADGES[result]);
  clearTimer = setTimeout(() => void chrome.action.setBadgeText({ text: "" }), RESULT_VISIBLE_MS);
}

function setBadge(badge: { text: string; color: string }): void {
  void chrome.action.setBadgeBackgroundColor({ color: badge.color });
  void chrome.action.setBadgeText({ text: badge.text });
}
