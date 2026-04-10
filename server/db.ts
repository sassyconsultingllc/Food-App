import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _dbInitAttempted = false;
let _dbUnavailableReason: string | null = null;

/**
 * Check if database is available and get reason if not
 */
export function getDatabaseStatus(): { available: boolean; reason: string | null } {
  return {
    available: _db !== null,
    reason: _dbUnavailableReason,
  };
}

/**
 * Get database connection. Returns null if database is unavailable.
 * The app will function without a database (no caching, no user persistence).
 */
export async function getDb() {
  if (_dbInitAttempted) {
    return _db;
  }
  
  _dbInitAttempted = true;
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    _dbUnavailableReason = "DATABASE_URL not set";
    console.warn("[Database] DATABASE_URL not set - running without database (no caching, searches will hit external APIs every time)");
    return null;
  }
  
  // Check for unsupported database URLs
  if (dbUrl.startsWith("cloudflare://") || dbUrl.includes(".d1/")) {
    _dbUnavailableReason = "Cloudflare D1 requires Workers runtime";
    console.warn("[Database] Cloudflare D1 requires Workers runtime - running without database in Node.js");
    return null;
  }
  
  try {
    _db = drizzle(dbUrl);
    console.log("[Database] Connected successfully");
  } catch (error) {
    _dbUnavailableReason = `Connection failed: ${error}`;
    console.warn("[Database] Failed to connect:", error);
    _db = null;
  }
  
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}
