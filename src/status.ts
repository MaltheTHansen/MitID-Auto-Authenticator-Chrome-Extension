export type StatusKind = "progress" | "success" | "notice" | "error";

export interface Status {
  kind: StatusKind;
  text: string;
  detail?: string;
}

const LATEST_STATUS_KEY = "latestStatus";

export function reportStatus(status: Status): void {
  void chrome.storage.session.set({ [LATEST_STATUS_KEY]: status });
}

export async function loadLatestStatus(): Promise<Status | undefined> {
  const stored = await chrome.storage.session.get(LATEST_STATUS_KEY);
  return stored[LATEST_STATUS_KEY] as Status | undefined;
}

export function onStatusReported(listener: (status: Status) => void): void {
  chrome.storage.session.onChanged.addListener((changes) => {
    const status = changes[LATEST_STATUS_KEY]?.newValue as Status | undefined;
    if (status) listener(status);
  });
}
