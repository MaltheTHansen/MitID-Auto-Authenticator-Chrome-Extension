export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function hexOf(bytes: Bytes): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bigintFromHex(hex: string): bigint {
  return BigInt(`0x${hex}`);
}

export function base64Of(bytes: Bytes): string {
  return btoa(String.fromCharCode(...bytes));
}

export function bytesFromBase64(base64: string): Bytes {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function concatBytes(...parts: Bytes[]): Bytes {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function hmacSha256(key: Bytes, data: Bytes): Promise<Bytes> {
  const hmacKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, data));
}
