import type { SimulatorRef } from "../identity.js";
import { MITID_PREPROD, postJson, required, send, sendForJson, wasRefusedByMitId } from "./http.js";

export const SIMULATOR_PIN = "112233";

const PENDING_STATUS = "OK";
const CONFIRM_TIMESTAMP_OFFSET_MS = 100;

export interface AuthKey {
  authKey: string;
  timestamp: number;
}

interface LoginRequestMessage {
  msg: string;
  datagram: string;
}

export interface LoginRequest {
  ticket: string;
  message: LoginRequestMessage;
}

export interface SignedApproval {
  response: string;
  signedResponse: string;
  serviceProviderName?: string;
  referenceTextHeader?: string;
  referenceTextBody?: string;
}

interface PullResponse {
  status?: string;
  ticket?: string;
  msg?: Partial<LoginRequestMessage>;
}

export async function fetchAuthKey(simulator: SimulatorRef): Promise<AuthKey> {
  const key = await sendForJson<Partial<AuthKey>>(
    "auth-key",
    codeAppUrl(simulator, `simulator/${simulator.authenticatorId}/auth-key`),
  );
  return { authKey: required(key.authKey, "authKey"), timestamp: required(key.timestamp, "timestamp") };
}

export async function respondsAsSimulator(simulator: SimulatorRef): Promise<boolean> {
  try {
    await fetchAuthKey(simulator);
    return true;
  } catch (error) {
    if (wasRefusedByMitId(error)) return false;
    throw error;
  }
}

export async function pullLoginRequest(simulator: SimulatorRef, authKey: AuthKey): Promise<LoginRequest | undefined> {
  const pull = await sendForJson<PullResponse>(
    "pull",
    notifierUrl(simulator, "pull"),
    postJson({ authkey: authKey.authKey, timestamp: authKey.timestamp }),
  );
  if (pull.status !== PENDING_STATUS) return undefined;
  return {
    ticket: required(pull.ticket, "ticket"),
    message: { msg: required(pull.msg?.msg, "msg"), datagram: required(pull.msg?.datagram, "datagram") },
  };
}

export async function signLoginRequest(simulator: SimulatorRef, loginRequest: LoginRequest): Promise<SignedApproval> {
  const approval = await sendForJson<Partial<SignedApproval>>(
    "perform-auth",
    notifierUrl(simulator, "perform-auth"),
    postJson({
      pIN: SIMULATOR_PIN,
      datagram: loginRequest.message.datagram,
      msg: loginRequest.message.msg,
      ticket: loginRequest.ticket,
    }),
  );
  return {
    ...approval,
    response: required(approval.response, "response"),
    signedResponse: required(approval.signedResponse, "signedResponse"),
  };
}

export async function confirmLoginRequest(
  simulator: SimulatorRef,
  authKey: AuthKey,
  loginRequest: LoginRequest,
  approval: SignedApproval,
): Promise<void> {
  await send(
    "confirm",
    notifierUrl(simulator, "confirm"),
    postJson({
      ticket: loginRequest.ticket,
      confirmed: true,
      payload: { response: approval.response, responseSignature: approval.signedResponse },
      authKey: authKey.authKey,
      timestamp: authKey.timestamp + CONFIRM_TIMESTAMP_OFFSET_MS,
    }),
  );
}

function notifierUrl(simulator: SimulatorRef, step: string): string {
  return codeAppUrl(simulator, `${simulator.authenticatorId}/simulator-notifier/${step}`);
}

function codeAppUrl(simulator: SimulatorRef, path: string): string {
  return `${MITID_PREPROD}/mitid-test-api/v4/identities/${simulator.identityId}/authenticators/code-app/${path}`;
}
