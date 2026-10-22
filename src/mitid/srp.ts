// Ported from Saturate/mitid-cli and Hundter/MitID-BrowserClient (MIT); see THIRD-PARTY-NOTICES.md.
import { bigintFromHex, type Bytes, concatBytes, hexOf, hmacSha256, randomBytes, sha256, utf8 } from "./bytes.js";

const N = BigInt(
  "4983313092069490398852700692508795473567251422586244806694940877242664573189903192937797446992068818099986958054998012331720869136296780936009508700487789962429161515853541556719593346959929531150706457338429058926505817847524855862259333438239756474464759974189984231409170758360686392625635632084395639143229889862041528635906990913087245817959460948345336333086784608823084788906689865566621015175424691535711520273786261989851360868669067101108956159530739641990220546209432953829448997561743719584980402874346226230488627145977608389858706391858138200618631385210304429902847702141587470513336905449351327122086464725143970313054358650488241167131544692349123381333204515637608656643608393788598011108539679620836313915590459891513992208387515629240292926570894321165482608544030173975452781623791805196546326996790536207359143527182077625412731080411108775183565594553871817639221414953634530830290393130518228654795859",
);
const g = 2n;
const N_BYTE_LENGTH = bytesOf(N).length;
const PRIVATE_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 16;

export interface SrpClient {
  privateKey: bigint;
  publicKey: bigint;
}

export interface SrpServerChallenge {
  salt: string;
  serverPublicKeyHex: string;
}

export interface SrpProof {
  m1Hex: string;
  sessionKey: Bytes;
}

export function startSrp(privateKey = bigintFromHex(hexOf(randomBytes(PRIVATE_KEY_BYTES)))): SrpClient {
  return { privateKey, publicKey: modPow(g, privateKey, N) };
}

export async function proveSrp(
  client: SrpClient,
  challenge: SrpServerChallenge,
  password: string,
  authenticatorSessionId: string,
): Promise<SrpProof> {
  const serverPublicKey = bigintFromHex(challenge.serverPublicKeyHex);
  if (serverPublicKey % N === 0n) throw new Error("MitID sent an unsafe SRP public key");

  const hashedPassword = bigintFromHex(hexOf(await sha256(utf8(challenge.salt + password))));
  const scrambler = await scramblerOf(client.publicKey, serverPublicKey);
  const multiplier = bigintFromHex(hexOf(await sha256(concatBytes(decimalBytes(N), padToN(bytesOf(g))))));

  const base = mod(serverPublicKey - modPow(g, hashedPassword, N) * multiplier, N);
  const sharedSecret = modPow(base, scrambler * hashedPassword + client.privateKey, N);
  const sessionKey = await sha256(decimalBytes(sharedSecret));

  const identityHashHex = hexOf(await sha256(utf8(authenticatorSessionId)));
  const groupHash = (await hashedDecimal(N)) ^ (await hashedDecimal(g));
  const m1Message =
    groupHash.toString(10) +
    identityHashHex +
    challenge.salt +
    client.publicKey.toString(10) +
    serverPublicKey.toString(10) +
    hexOf(sessionKey);
  return { m1Hex: hexOf(await sha256(utf8(m1Message))), sessionKey };
}

export async function isServerProofValid(client: SrpClient, proof: SrpProof, m2Hex: string): Promise<boolean> {
  const message = client.publicKey.toString(10) + bigintFromHex(proof.m1Hex).toString(10) + hexOf(proof.sessionKey);
  return hexOf(await sha256(utf8(message))) === m2Hex;
}

export async function encryptWithSessionKey(sessionKey: Bytes, plaintext: Bytes): Promise<Bytes> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const key = await crypto.subtle.importKey("raw", sessionKey, "AES-GCM", false, ["encrypt"]);
  const ciphertextAndTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return concatBytes(iv, ciphertextAndTag);
}

export async function flowValueProof(sessionKey: Bytes, proofData: string): Promise<string> {
  const key = await sha256(utf8(`flowValues${hexOf(sessionKey)}`));
  return hexOf(await hmacSha256(key, utf8(proofData)));
}

async function scramblerOf(clientPublicKey: bigint, serverPublicKey: bigint): Promise<bigint> {
  const hash = await sha256(concatBytes(padToN(bytesOf(clientPublicKey)), padToN(bytesOf(serverPublicKey))));
  return bigintFromHex(hexOf(hash)) % N;
}

async function hashedDecimal(value: bigint): Promise<bigint> {
  return bigintFromHex(hexOf(await sha256(decimalBytes(value))));
}

function decimalBytes(value: bigint): Bytes {
  return utf8(value.toString(10));
}

function bytesOf(value: bigint): Bytes {
  const hex = value.toString(16);
  return Uint8Array.from((hex.length % 2 ? `0${hex}` : hex).match(/../g)!, (byte) => parseInt(byte, 16));
}

function padToN(bytes: Bytes): Bytes {
  return concatBytes(new Uint8Array(N_BYTE_LENGTH - bytes.length), bytes);
}

function mod(value: bigint, modulus: bigint): bigint {
  return ((value % modulus) + modulus) % modulus;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let square = mod(base, modulus);
  for (let remaining = exponent; remaining > 0n; remaining >>= 1n) {
    if (remaining & 1n) result = (result * square) % modulus;
    square = (square * square) % modulus;
  }
  return result;
}
