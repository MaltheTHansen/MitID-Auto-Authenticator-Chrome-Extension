export const MITID_PREPROD = "https://pp.mitid.dk";

export class MitIdApiError extends Error {
  constructor(
    readonly status: number,
    operation: string,
  ) {
    super(`MitID returned HTTP ${status} on ${operation}`);
  }
}

export function wasRefusedByMitId(error: unknown): boolean {
  return error instanceof MitIdApiError && error.status >= 400 && error.status < 500;
}

export async function send(operation: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new MitIdApiError(response.status, operation);
  return response;
}

export async function sendForJson<T>(operation: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await send(operation, url, init);
  return (await response.json()) as T;
}

export function postJson(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

export function required<T>(value: T | null | undefined, field: string): T {
  if (value === undefined || value === null || value === "") throw new Error(`MitID's response is missing ${field}`);
  return value;
}
