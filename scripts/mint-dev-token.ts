/**
 * ⚠️ DEV-ONLY UTILITY — DO NOT USE IN PRODUCTION ⚠️
 *
 * Mint a properly HS256-signed JWT token using the local JWT_SECRET.
 * This is for developer testing and local API verification only.
 *
 * Usage:
 *   pnpm --filter @opspilot/api exec tsx ../../scripts/mint-dev-token.ts [ROLE] [SUBJECT]
 *
 * Example:
 *   pnpm --filter @opspilot/api exec tsx ../../scripts/mint-dev-token.ts SECURITY_ADMIN dev-admin-user
 */

import dotenv from 'dotenv';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { getConfig } from '../packages/config/src/index.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const args = process.argv.slice(2);
const role = (args[0] || 'SECURITY_ADMIN').toUpperCase();
const subject = args[1] || 'dev-user';

const validRoles = ['VIEWER', 'SRE_OPERATOR', 'INCIDENT_COMMANDER', 'SECURITY_ADMIN'];
if (!validRoles.includes(role)) {
  console.error(`❌ Invalid role: "${role}". Allowed roles: ${validRoles.join(', ')}`);
  process.exit(1);
}

// Fails loudly via Zod schema if JWT_SECRET is missing or invalid
const config = getConfig();

const payload = {
  sub: subject,
  name: `Dev ${role} ${subject}`,
  roles: [role],
  iss: 'opspilot-dev-mint',
  aud: 'opspilot-api',
};

const token = jwt.sign(payload, config.JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '24h',
});

console.log(`🔑 Dev JWT minted for role=${role}, subject=${subject}:`);
console.log(token);
