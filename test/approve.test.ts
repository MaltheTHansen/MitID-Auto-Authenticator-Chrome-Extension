import { afterEach, describe, expect, it, vi } from "vitest";
import { approveLoginRequest } from "../src/approve.js";
import type { Identity } from "../src/identity.js";
import { MitIdApiError } from "../src/mitid/http.js";

const identity: Identity = { userId: "Theo404", identityId: "identity-1", authenticatorId: "authenticator-1" };
const noWait = { attempts: 3, intervalMs: 0 };

const AUTH_KEY = { authKey: "auth-key-1", timestamp: 1_700_000_000_000 };
const PENDING_PULL = { status: "OK", ticket: "ticket-1", msg: { msg: "message-1", datagram: "datagram-1", lang: "da" } };
const EMPTY_PULL = { status: "NO_REQUEST" };
const PERFORM_AUTH = {
  response: "response-1",
  signedResponse: "signature-1",
  serviceProviderName: "Example Service",
  referenceTextHeader: "Log på hos Example Service",
  referenceTextBody: "Min side",
};

type Step = "auth-key" | "pull" | "perform-auth" | "confirm";

interface FakeMitId {
  calls: { step: Step; url: string; body: unknown }[];
  bodyOf(step: Step): unknown;
}

function fakeMitId(
  pulls: object[],
  failing?: { step: Step; status: number },
  performAuthResponse: object = PERFORM_AUTH,
): FakeMitId {
  const calls: FakeMitId["calls"] = [];
  const remainingPulls = [...pulls];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const step = (["auth-key", "perform-auth", "pull", "confirm"] as const).find((s) => url.endsWith(`/${s}`))!;
      calls.push({ step, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (failing?.step === step) return new Response("", { status: failing.status });

      const responses: Record<Step, () => unknown> = {
        "auth-key": () => AUTH_KEY,
        pull: () => remainingPulls.shift() ?? EMPTY_PULL,
        "perform-auth": () => performAuthResponse,
        confirm: () => "OK",
      };
      return new Response(JSON.stringify(responses[step]()), { status: 200 });
    }),
  );

  return { calls, bodyOf: (step) => calls.find((call) => call.step === step)?.body };
}

describe("approveLoginRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("approves a pending Login request through the Simulator", async () => {
    const mitId = fakeMitId([PENDING_PULL]);

    const result = await approveLoginRequest(identity, noWait);

    expect(result).toEqual({
      outcome: "approved",
      serviceProviderName: "Example Service",
      referenceText: "Log på hos Example Service — Min side",
    });
    expect(mitId.calls.map((call) => call.step)).toEqual(["auth-key", "pull", "perform-auth", "confirm"]);
    expect(mitId.calls[0]!.url).toBe(
      "https://pp.mitid.dk/mitid-test-api/v4/identities/identity-1/authenticators/code-app/simulator/authenticator-1/auth-key",
    );
    expect(mitId.calls[1]!.url).toBe(
      "https://pp.mitid.dk/mitid-test-api/v4/identities/identity-1/authenticators/code-app/authenticator-1/simulator-notifier/pull",
    );
  });

  it("sends the request bodies with MitID's exact field spellings", async () => {
    const mitId = fakeMitId([PENDING_PULL]);

    await approveLoginRequest(identity, noWait);

    expect(mitId.bodyOf("pull")).toEqual({ authkey: "auth-key-1", timestamp: AUTH_KEY.timestamp });
    expect(mitId.bodyOf("perform-auth")).toEqual({
      pIN: "112233",
      datagram: "datagram-1",
      msg: "message-1",
      ticket: "ticket-1",
    });
    expect(mitId.bodyOf("confirm")).toEqual({
      ticket: "ticket-1",
      confirmed: true,
      payload: { response: "response-1", responseSignature: "signature-1" },
      authKey: "auth-key-1",
      timestamp: AUTH_KEY.timestamp + 100,
    });
  });

  it("keeps pulling until a Login request arrives", async () => {
    const mitId = fakeMitId([EMPTY_PULL, PENDING_PULL]);

    const result = await approveLoginRequest(identity, noWait);

    expect(result.outcome).toBe("approved");
    expect(mitId.calls.filter((call) => call.step === "pull")).toHaveLength(2);
  });

  it("gives up after the retry burst when nothing is pending", async () => {
    const mitId = fakeMitId([]);

    const result = await approveLoginRequest(identity, noWait);

    expect(result).toEqual({ outcome: "nothing-pending" });
    expect(mitId.calls.filter((call) => call.step === "pull")).toHaveLength(noWait.attempts);
    expect(mitId.calls.some((call) => call.step === "perform-auth" || call.step === "confirm")).toBe(false);
  });

  it("fails instead of confirming when the signed approval is incomplete", async () => {
    const mitId = fakeMitId([PENDING_PULL], undefined, { ...PERFORM_AUTH, signedResponse: undefined });

    await expect(approveLoginRequest(identity, noWait)).rejects.toThrow("MitID's response is missing signedResponse");
    expect(mitId.calls.some((call) => call.step === "confirm")).toBe(false);
  });

  it("fails with the HTTP status when MitID rejects a step", async () => {
    fakeMitId([PENDING_PULL], { step: "perform-auth", status: 404 });

    const approving = approveLoginRequest(identity, noWait);

    await expect(approving).rejects.toThrow(MitIdApiError);
    await expect(approving).rejects.toThrow("MitID returned HTTP 404 on perform-auth");
  });
});
