import { describe, expect, it } from "vitest";
import { bigintFromHex, hexOf, utf8 } from "../src/mitid/bytes.js";
import { encryptWithSessionKey, flowValueProof, isServerProofValid, proveSrp, startSrp } from "../src/mitid/srp.js";

// Reference values from mitid-cli's tests, generated with Hundter/MitID-BrowserClient's Python implementation.
const PRIVATE_KEY = 12345678901234567890123456789012345678901234567890123456789012345678901234567890n;
const PUBLIC_KEY_HEX =
  "1b4f8ba17daef6d22646d5216622ce6c725cccd9f56f96b32ef73fef8d1a389cded8e94ef9ddf872bd5a114a5bdc04aa612821d920d5f55b343ae040973a11aaf829b8c1715b4dfa4b40a95cd1b7745425de22c3124963bc3e5dd0433f96cd05437a97a1b14f013bf467618ec5f6e2e56ba86e380ab4b8b983060959c12d14fe1167065111090c944502d0b8e4755d0e33191f79fcad37f7570ea52a7fddeb49182da8752a7e75698fd1eb954d19cca4a7dab2fb83adf726c44f68ad41b1aca70e3c68581b2668850a616a032598937f32bfc6968876b3491fdae2bcddf712735f7983fd0ae21f36947dd077f8eca9ef2bde172e4546b20e878503c354bfc1ae0a7ee23538cb7253d7e84d568e65f7e68ea251d0ea2d22f1e9587e081501161963648097aee9737347e43c2e2db01427122a0daf9dbb3b00515f01bbb0343025351244b52585a47466f87323a3fe6488699e18fbf599fa4a349adcdc1968f18e298aac2965d9a571c7660f4300f88f1d6705cfe29dc7158c2cd582f4fa94e4ca";
const CHALLENGE = {
  salt: "aabbccdd".repeat(8),
  serverPublicKeyHex:
    "d4c56256f6923958d8d89e9cb8a39f13ffa9193f1cfea87c6d575cdbda3a173bdca1415b37a3748fe973f9d8cac23504371fca90a07f844633fc4c87194dc954da6a0960c1131e88680794f82b554daab8382fb303120dce40d6339bac669d8010aa51be0011cea4c0f4f21c2168a730674bd2c367a4cc065c1ed3a571e990afa3bbbe34d7ce298f7da33e3c4a4800d47f0bb801e2221e6911a0ce644c11521dac821a4164914bb1a45b80895d648bd095cfbc54d25c6e1ec79c15549bab115ea63ef577ee8c99b42226a4c30a58e0d04e3ecf1567d175f015d705967bfd739895d8d7ede05725f2f0c042de37e1fc398688576e490e11e1c89159a7b4e1a2d132b65bce336121ab4af6e5f10d5db18e206c14941f11b4e7770d683be97e319e54aa796ae2390d1260a7c05af4ca36c266c9631a49050f930b1601af46b5f29710369021e46bebaf32f875ab839cd3f972cca5b7d83ebee9255fa17cf0b0b44cbdab7fb1a257aba4c2e6a612081d737f381ecf62be76d07af0a1d8f0b8a76cdb",
};
const PASSWORD = "deadbeef".repeat(8);
const AUTHENTICATOR_SESSION_ID = "test-session-id-12345";

const M1_HEX = "a8b8f62dd8d35aaf31b33158791d1122ff649126a7e86f9f04d37e701edee51d";
const SESSION_KEY_HEX = "2ae16ddb4afd73039e63a7bb646710e210b935f8beb6ecc3f93484a9c8a4887c";
const M2_HEX = "d605333532e9403857696844351a1ee5171440a2e2a1e314d97772ff53dc9f5c";
const FLOW_VALUE_PROOF = "9d7489cd9637610fd09b9b459a1fc95b0dbda34d1f75f0176c49c5d9563564d0";

const client = startSrp(PRIVATE_KEY);

describe("SRP as MitID does it", () => {
  it("derives the public key from the private key", () => {
    expect(client.publicKey).toBe(bigintFromHex(PUBLIC_KEY_HEX));
  });

  it("produces the reference M1 and session key", async () => {
    const proof = await proveSrp(client, CHALLENGE, PASSWORD, AUTHENTICATOR_SESSION_ID);

    expect(proof.m1Hex).toBe(M1_HEX);
    expect(hexOf(proof.sessionKey)).toBe(SESSION_KEY_HEX);
  });

  it("accepts only the server's reference M2", async () => {
    const proof = await proveSrp(client, CHALLENGE, PASSWORD, AUTHENTICATOR_SESSION_ID);

    expect(await isServerProofValid(client, proof, M2_HEX)).toBe(true);
    expect(await isServerProofValid(client, proof, "0".repeat(64))).toBe(false);
  });

  it("refuses a server public key of zero", async () => {
    await expect(proveSrp(client, { ...CHALLENGE, serverPublicKeyHex: "0" }, PASSWORD, "session")).rejects.toThrow(
      "unsafe SRP public key",
    );
  });

  it("matches the reference flow value proof", async () => {
    const sessionKey = Uint8Array.from(SESSION_KEY_HEX.match(/../g)!, (byte) => parseInt(byte, 16));

    expect(await flowValueProof(sessionKey, "session1,flowkey1,hash1,eafe1,bsc1,header1,body1,sp1")).toBe(
      FLOW_VALUE_PROOF,
    );
  });

  it("encrypts as IV, then AES-GCM ciphertext and tag", async () => {
    const proof = await proveSrp(client, CHALLENGE, PASSWORD, AUTHENTICATOR_SESSION_ID);
    const plaintext = utf8("test message");

    const encrypted = await encryptWithSessionKey(proof.sessionKey, plaintext);

    const key = await crypto.subtle.importKey("raw", proof.sessionKey, "AES-GCM", false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: encrypted.subarray(0, 16) }, key, encrypted.subarray(16));
    expect(new TextDecoder().decode(decrypted)).toBe("test message");
  });
});
