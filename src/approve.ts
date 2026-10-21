import { delay } from "./delay.js";
import type { Identity } from "./identity.js";
import { confirmLoginRequest, fetchAuthKey, pullLoginRequest, signLoginRequest } from "./mitid/simulatorApi.js";

export interface RetryBurst {
  attempts: number;
  intervalMs: number;
}

export const DEFAULT_RETRY_BURST: RetryBurst = { attempts: 8, intervalMs: 2000 };

export type ApproveResult =
  | { outcome: "approved"; serviceProviderName?: string; referenceText: string }
  | { outcome: "nothing-pending" };

export async function approveLoginRequest(identity: Identity, burst = DEFAULT_RETRY_BURST): Promise<ApproveResult> {
  for (let attempt = 1; attempt <= burst.attempts; attempt++) {
    const result = await approveIfPending(identity);
    if (result.outcome === "approved") return result;
    if (attempt < burst.attempts) await delay(burst.intervalMs);
  }
  return { outcome: "nothing-pending" };
}

async function approveIfPending(identity: Identity): Promise<ApproveResult> {
  const authKey = await fetchAuthKey(identity);
  const loginRequest = await pullLoginRequest(identity, authKey);
  if (!loginRequest) return { outcome: "nothing-pending" };

  const approval = await signLoginRequest(identity, loginRequest);
  await confirmLoginRequest(identity, authKey, loginRequest, approval);
  return {
    outcome: "approved",
    serviceProviderName: approval.serviceProviderName,
    referenceText: [approval.referenceTextHeader, approval.referenceTextBody].filter(Boolean).join(" — "),
  };
}
