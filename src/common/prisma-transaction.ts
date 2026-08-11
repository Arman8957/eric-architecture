/**
 * Timeouts for Prisma interactive transactions.
 *
 * Prisma defaults to maxWait 2s / timeout 5s, which assumes a database on the
 * same machine. This app talks to a managed Postgres over the public internet,
 * so every statement inside a transaction costs a network round trip and a
 * serverless endpoint may still be waking up on the first one. A handful of
 * writes then blows the 5s budget, the transaction is closed mid-flight, and
 * the next statement fails with:
 *
 *   "Transaction not found. Transaction ID is invalid, refers to an old closed
 *    transaction Prisma doesn't have information about anymore"
 *
 * These values give multi-statement writes room to finish. They are a ceiling,
 * not a delay — a fast transaction still commits immediately. Keep read-only
 * queries outside the transaction rather than raising this further.
 */
export const TX_OPTIONS = {
  /** How long to wait for a connection from the pool before giving up. */
  maxWait: 10_000,
  /** How long the transaction itself may stay open. */
  timeout: 30_000,
} as const;
