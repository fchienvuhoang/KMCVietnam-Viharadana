import { attachDatabasePool } from "@vercel/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  databasePool?: Pool;
};

const DEFAULT_DATABASE_POOL_MAX = 2;
const TRANSIENT_DATABASE_ERROR_PATTERNS = [
  /connection terminated/i,
  /connection timeout/i,
  /connection closed/i,
  /connect econnrefused/i,
  /connect etimedout/i,
  /connection reset/i,
  /econnreset/i,
  /server closed the connection/i,
  /can't reach database server/i,
  /p1001/i,
  /p1002/i,
  /p1017/i,
];

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl());
}

export function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }

  const pool = globalForPrisma.databasePool ?? new Pool({
    connectionString: getDatabaseUrl(),
    max: getDatabasePoolMax(),
    min: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 8_000,
    maxLifetimeSeconds: 300,
    keepAlive: true,
    allowExitOnIdle: true,
  });

  if (!globalForPrisma.databasePool) {
    // Vercel pauses function instances between requests. Registering the pool
    // prevents idle sockets from becoming stale while an instance is suspended.
    attachDatabasePool(pool);
    globalForPrisma.databasePool = pool;
  }

  const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg(pool) });

  globalForPrisma.prisma = prisma;

  return prisma;
}

export async function withDatabaseReadRetry<T>(operation: () => Promise<T>): Promise<T> {
  const retryDelays = [250, 750];

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retryDelays.length || !isTransientDatabaseError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
    }
  }
}

export function isTransientDatabaseError(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current instanceof Error) messages.push(current.message, current.name);
    else if (typeof current === "string") messages.push(current);
    if (typeof current !== "object" || !("cause" in current)) break;
    current = (current as { cause?: unknown }).cause;
  }

  return TRANSIENT_DATABASE_ERROR_PATTERNS.some((pattern) =>
    messages.some((message) => pattern.test(message)),
  );
}

function getDatabaseUrl() {
  return (
    process.env.DATABASE_POOL_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL
  );
}

function getDatabasePoolMax() {
  const configured = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  if (!Number.isInteger(configured) || configured < 1) {
    return DEFAULT_DATABASE_POOL_MAX;
  }

  return Math.min(configured, 10);
}
