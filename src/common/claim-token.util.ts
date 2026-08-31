import * as crypto from 'crypto';

/**
 * One-time signup-claim tokens for account-less inquiries the studio has
 * accepted. The raw token travels in the emailed signup link; only its SHA-256
 * hash is stored on ProjectRequest.claimTokenHash.
 *
 * Shared between ProjectRequestService (issues on accept / resend) and
 * AuthService (verifies on signup, re-issues on "link expired").
 */

/** How long a claim link stays valid. */
export const CLAIM_TOKEN_TTL_DAYS = 14;

export function hashClaimToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function issueClaimToken(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const raw = crypto.randomBytes(32).toString('hex');
  return {
    raw,
    hash: hashClaimToken(raw),
    expiresAt: new Date(
      Date.now() + CLAIM_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    ),
  };
}
