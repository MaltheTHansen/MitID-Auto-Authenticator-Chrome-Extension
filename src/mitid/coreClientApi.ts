// Ported from Saturate/mitid-cli and Hundter/MitID-BrowserClient (MIT); see THIRD-PARTY-NOTICES.md.
import { base64Of, bytesFromBase64, concatBytes, hexOf, sha256, utf8 } from "./bytes.js";
import { MITID_PREPROD, required, send, sendForJson } from "./http.js";
import { encryptWithSessionKey, flowValueProof, isServerProofValid, proveSrp, startSrp } from "./srp.js";

const CORE_CLIENT_URL = `${MITID_PREPROD}/mitid-core-client-backend`;
const CODE_APP_AUTH_URL = `${MITID_PREPROD}/mitid-code-app-auth`;
const APP_AUTHENTICATOR = "APP";
const APP_COMBINATION_ID = "S3";
const KEEP_CURRENT_COMBINATION = "";
const APPROVAL_TIMEOUT_MS = 30_000;
const STILL_WAITING_POLL_STATUSES = new Set(["timeout", "channel_validation_otp", "channel_validation_tqr", "channel_verified"]);

interface Aux {
  coreClient?: { checksum?: string };
  parameters?: { authenticationSessionId?: string };
}

interface AuthenticationSession {
  brokerSecurityContext: string;
  serviceProviderName: string;
  referenceTextHeader: string;
  referenceTextBody: string;
}

interface Authenticator {
  authenticatorType: string;
  authenticatorSessionFlowKey: string;
  eafeHash: string;
  authenticatorSessionId: string;
}

interface NextStep {
  nextAuthenticator?: Authenticator;
  nextSessionId?: string;
  errors?: { errorCode?: string; message?: string; userMessage?: { text?: { text?: string } } }[];
}

interface AppApproval {
  response: string;
  responseSignature: string;
}

interface PollResponse {
  status?: string;
  confirmation?: boolean;
  payload?: AppApproval;
}

export interface AppLogin {
  authenticationSessionId: string;
  clientHash: string;
  session: AuthenticationSession;
  authenticator: Authenticator;
  pollUrl: string;
  ticket: string;
}

export async function startAppLogin(aux: string, userId: string): Promise<AppLogin> {
  const { coreClient, parameters } = JSON.parse(new TextDecoder().decode(bytesFromBase64(aux))) as Aux;
  const authenticationSessionId = required(parameters?.authenticationSessionId, "authenticationSessionId");
  const clientHash = hexOf(bytesFromBase64(required(coreClient?.checksum, "checksum")));
  const sessionUrl = `${CORE_CLIENT_URL}/v1/authentication-sessions/${authenticationSessionId}`;

  const session = await sendForJson<AuthenticationSession>("authentication-session", sessionUrl, coreClientRequest("GET"));
  await send("identify", sessionUrl, coreClientRequest("PUT", { identityClaim: userId }));
  const authenticator = await appAuthenticator(authenticationSessionId);
  const appLogin = await sendForJson<{ pollUrl?: string; ticket?: string }>(
    "init-auth",
    `${authenticatorUrl(authenticator)}/init-auth`,
    coreClientRequest("POST", {}),
  );

  return {
    authenticationSessionId,
    clientHash,
    session,
    authenticator,
    pollUrl: required(appLogin.pollUrl, "pollUrl"),
    ticket: required(appLogin.ticket, "ticket"),
  };
}

export async function finishAppLogin(login: AppLogin): Promise<string> {
  const approval = await appApproval(login);
  const url = authenticatorUrl(login.authenticator);
  let processingMs = 0;
  const timed = async <T>(work: () => T | Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    const result = await work();
    processingMs += performance.now() - startedAt;
    return result;
  };

  const srpClient = await timed(() => startSrp());
  const challenge = await sendForJson<{ srpSalt?: { value?: string }; randomB?: { value?: string } }>(
    "srp-init",
    `${url}/init`,
    coreClientRequest("POST", { randomA: { value: srpClient.publicKey.toString(16) } }),
  );
  const { proof, valueProof } = await timed(async () => {
    const password = hexOf(
      await sha256(concatBytes(bytesFromBase64(approval.response), utf8(login.authenticator.authenticatorSessionFlowKey))),
    );
    const proof = await proveSrp(
      srpClient,
      {
        salt: required(challenge.srpSalt?.value, "srpSalt"),
        serverPublicKeyHex: required(challenge.randomB?.value, "randomB"),
      },
      password,
      login.authenticator.authenticatorSessionId,
    );
    return { proof, valueProof: await flowValueProof(proof.sessionKey, await flowValues(login)) };
  });

  const serverProof = await sendForJson<{ m2?: { value?: string } }>(
    "prove",
    `${url}/prove`,
    coreClientRequest("POST", { m1: { value: proof.m1Hex }, flowValueProof: { value: valueProof } }),
  );
  const encAuth = await timed(async () => {
    if (!(await isServerProofValid(srpClient, proof, required(serverProof.m2?.value, "m2")))) {
      throw new Error("MitID's SRP proof didn't match ours");
    }
    return base64Of(await encryptWithSessionKey(proof.sessionKey, bytesFromBase64(approval.responseSignature)));
  });
  await send("verify", `${url}/verify`, coreClientRequest("POST", { encAuth, frontEndProcessingTime: Math.round(processingMs) }));

  const finalization = await nextStep(login.authenticationSessionId, KEEP_CURRENT_COMBINATION);
  const finalizationSessionId = required(finalization.nextSessionId, "nextSessionId");
  const { authorizationCode } = await sendForJson<{ authorizationCode?: string }>(
    "finalization",
    `${CORE_CLIENT_URL}/v1/authentication-sessions/${finalizationSessionId}/finalization`,
    coreClientRequest("PUT"),
  );
  return required(authorizationCode, "authorizationCode");
}

async function appAuthenticator(authenticationSessionId: string): Promise<Authenticator> {
  let step = await nextStep(authenticationSessionId, KEEP_CURRENT_COMBINATION);
  if (step.nextAuthenticator?.authenticatorType !== APP_AUTHENTICATOR) {
    step = await nextStep(authenticationSessionId, APP_COMBINATION_ID);
  }
  const authenticator = required(step.nextAuthenticator, "nextAuthenticator");
  if (authenticator.authenticatorType !== APP_AUTHENTICATOR) {
    throw new Error(`MitID offered ${authenticator.authenticatorType} instead of the MitID app`);
  }
  return authenticator;
}

async function nextStep(authenticationSessionId: string, combinationId: string): Promise<NextStep> {
  const step = await sendForJson<NextStep>(
    "next",
    `${CORE_CLIENT_URL}/v2/authentication-sessions/${authenticationSessionId}/next`,
    coreClientRequest("POST", { combinationId }),
  );
  const [error] = step.errors ?? [];
  if (error) throw new Error(error.userMessage?.text?.text ?? error.message ?? error.errorCode ?? "MitID refused the login");
  return step;
}

async function appApproval(login: AppLogin): Promise<AppApproval> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const poll = await sendForJson<PollResponse>("poll", login.pollUrl, coreClientRequest("POST", { ticket: login.ticket }));
    if (poll.status === "OK" && poll.confirmation) return required(poll.payload, "payload");
    if (!STILL_WAITING_POLL_STATUSES.has(poll.status ?? "")) {
      throw new Error(`MitID answered the app login with ${poll.status}`);
    }
  }
  throw new Error("MitID didn't register the app approval in time");
}

async function flowValues(login: AppLogin): Promise<string> {
  const { session, authenticator } = login;
  return [
    authenticator.authenticatorSessionId,
    authenticator.authenticatorSessionFlowKey,
    login.clientHash,
    authenticator.eafeHash,
    hexOf(await sha256(utf8(session.brokerSecurityContext))),
    base64Of(utf8(session.referenceTextHeader)),
    base64Of(utf8(session.referenceTextBody)),
    base64Of(utf8(session.serviceProviderName)),
  ].join(",");
}

function authenticatorUrl(authenticator: Authenticator): string {
  return `${CODE_APP_AUTH_URL}/v1/authenticator-sessions/web/${authenticator.authenticatorSessionId}`;
}

function coreClientRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
