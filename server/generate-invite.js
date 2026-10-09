import { createHash } from 'node:crypto';
import { disconnectDb, getDb } from './db.js';
import { generateInviteCode, inviteCodeHint } from './invite-code.js';

const role = process.argv[2] || 'user';
if (!['user', 'admin'].includes(role)) {
  throw new Error('Usage: node generate-invite.js [user|admin]');
}

const codeHash = (code) => createHash('sha256').update(code).digest('hex');
const db = await getDb();
if (!db) {
  throw new Error('Database unavailable: an invite can only be generated after it has been registered.');
}

try {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateInviteCode();
    try {
      await db.inviteCode.create({ data: { codeHash: codeHash(code), codeHint: inviteCodeHint(code), role } });
      // The plaintext is intentionally printed exactly once and is never stored.
      console.log(code);
      break;
    } catch (error) {
      if (error?.code !== 'P2002' || attempt === 2) throw error;
    }
  }
} finally {
  await disconnectDb();
}
