import { randomBytes } from 'node:crypto';

// A 96-bit, URL-safe secret. This is the Node.js equivalent of the
// `secrets.token_hex(...)` pattern used by agent-blueprint.
export function generateInviteCode() {
  return `mc_${randomBytes(12).toString('base64url')}`;
}

export function inviteCodeHint(code) {
  return `邀请码 ···${String(code).slice(-6)}`;
}
