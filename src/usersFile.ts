import type { Identity } from "./identity.js";

export function parseUsersFile(text: string): { identities: Identity[]; invalidLines: string[] } {
  const identities: Identity[] = [];
  const invalidLines: string[] = [];

  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const fields = line.split(",").map((field) => field.trim());
    const [userId, identityId, authenticatorId] = fields;
    if (fields.length === 3 && userId && identityId && authenticatorId) {
      identities.push({ userId, identityId, authenticatorId });
    } else {
      invalidLines.push(line);
    }
  }

  return { identities, invalidLines };
}

export function serializeUsersFile(identities: readonly Identity[]): string {
  return identities.map((i) => `${i.userId},${i.identityId},${i.authenticatorId}\n`).join("");
}
