import crypto from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import express from "express";
import Database from "better-sqlite3";
import type pg from "pg";
import { ApiError } from "../shared/services";

/**
 * Sign-in for the API. Accounts are not self-service: the owner's account
 * comes from OWNER_EMAIL / OWNER_PASSWORD in .env (see ensureOwner), so a
 * stranger who finds the server cannot create one. Clients send the session
 * token as "Authorization: Bearer <token>", which works the same from the
 * web app and from the Android app (no cross-site cookies involved).
 */

const SESSION_DAYS = 30;
const MIN_PASSWORD_LENGTH = 10;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

/** Where accounts and sessions live. Session tokens are stored hashed. */
export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  /** The signed-in user for a session, or null if unknown or expired. */
  findSessionUser(tokenHash: string, now: number): Promise<User | null>;
  createSession(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
}

/* ------------------------------ passwords ------------------------------ */

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Checked when an email is unknown, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString("hex"));

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

/* ------------------------------- owner -------------------------------- */

/**
 * Creates the owner account from .env, or updates its password when
 * OWNER_PASSWORD has changed (which also signs out every device). Returns
 * a message describing what happened, or throws with a fixable message.
 */
export async function ensureOwner(store: AuthStore, email: string, password: string): Promise<string> {
  email = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error(`OWNER_EMAIL "${email}" does not look like an email address.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  const existing = await store.findUserByEmail(email);
  if (!existing) {
    await store.saveUser({ id: crypto.randomUUID(), email, passwordHash: await hashPassword(password) });
    return `Sign-in account created for ${email}.`;
  }
  if (await verifyPassword(password, existing.passwordHash)) return `Sign-in account: ${email}.`;
  await store.saveUser({ ...existing, passwordHash: await hashPassword(password) });
  await store.deleteUserSessions(existing.id);
  return `Password changed for ${email} — every device has been signed out.`;
}

/* ---------------------------- rate limiting ---------------------------- */

/** Counts failed sign-ins per key in a rolling window (in memory). */
class FailureLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}

  /** Milliseconds until the key may try again, or 0 if it may try now. */
  blockedFor(key: string, now: number): number {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) return 0;
    return h.count >= this.max ? h.resetAt - now : 0;
  }

  fail(key: string, now: number) {
    if (this.hits.size > 10_000) {
      for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
    }
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else h.count++;
  }

  clear(key: string) {
    this.hits.delete(key);
  }
}

/* ------------------------------- routes -------------------------------- */

function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * /auth/login, /auth/logout, /auth/me, plus requireAuth, which every other
 * API route sits behind.
 */
export function createAuth(store: AuthStore, options: { ownerConfigured: boolean }) {
  const WINDOW = 15 * 60 * 1000;
  const byIp = new FailureLimiter(10, WINDOW);
  const byEmail = new FailureLimiter(30, WINDOW);
  const router = express.Router();

  const requireAuth: express.RequestHandler = async (req, res, next) => {
    const token = bearerToken(req);
    const user = token ? await store.findSessionUser(hashToken(token), Date.now()) : null;
    if (!user) throw new ApiError(401, "Please sign in");
    res.locals.user = user;
    res.locals.tokenHash = hashToken(token!);
    next();
  };

  router.post("/auth/login", async (req, res) => {
    const now = Date.now();
    const email = normalizeEmail(String(req.body?.email ?? ""));
    const password = String(req.body?.password ?? "");
    const ip = req.ip ?? "unknown";

    const wait = Math.max(byIp.blockedFor(ip, now), byEmail.blockedFor(email, now));
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60_000);
      throw new ApiError(429, `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }
    if (!email || !password) throw new ApiError(400, "Enter your email and password");

    const user = await store.findUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      byIp.fail(ip, now);
      byEmail.fail(email, now);
      if (!options.ownerConfigured) {
        throw new ApiError(
          401,
          "No sign-in account is set up on this server yet. Set OWNER_EMAIL and OWNER_PASSWORD in its .env and restart it.",
        );
      }
      throw new ApiError(401, "Wrong email or password");
    }
    byIp.clear(ip);
    byEmail.clear(email);

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
    await store.createSession(hashToken(token), user.id, expiresAt);
    res.json({ token, email: user.email, expiresAt });
  });

  router.get("/auth/me", requireAuth, (_req, res) => {
    res.json({ email: (res.locals.user as User).email });
  });

  router.post("/auth/logout", requireAuth, async (_req, res) => {
    await store.deleteSession(res.locals.tokenHash as string);
    res.json({ ok: true });
  });

  return { router, requireAuth };
}

/* ------------------------------- stores -------------------------------- */

type UserRow = { id: string; email: string; password_hash: string };
const toUser = (r: UserRow): User => ({ id: r.id, email: r.email, passwordHash: r.password_hash });

export class PgAuthStore implements AuthStore {
  constructor(private pool: pg.Pool) {}

  async findUserByEmail(email: string) {
    const { rows } = await this.pool.query<UserRow>(
      "SELECT id, email, password_hash FROM marketbing.users WHERE email = $1",
      [email],
    );
    return rows.length ? toUser(rows[0]) : null;
  }

  async saveUser(user: User) {
    await this.pool.query(
      "INSERT INTO marketbing.users (id, email, password_hash) VALUES ($1, $2, $3) " +
        "ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash",
      [user.id, user.email, user.passwordHash],
    );
  }

  async findSessionUser(tokenHash: string, now: number) {
    const { rows } = await this.pool.query<UserRow>(
      "SELECT u.id, u.email, u.password_hash FROM marketbing.sessions s " +
        "JOIN marketbing.users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2",
      [tokenHash, new Date(now)],
    );
    return rows.length ? toUser(rows[0]) : null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: number) {
    await this.pool.query("DELETE FROM marketbing.sessions WHERE expires_at <= now()");
    await this.pool.query(
      "INSERT INTO marketbing.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash, userId, new Date(expiresAt)],
    );
  }

  async deleteSession(tokenHash: string) {
    await this.pool.query("DELETE FROM marketbing.sessions WHERE token_hash = $1", [tokenHash]);
  }

  async deleteUserSessions(userId: string) {
    await this.pool.query("DELETE FROM marketbing.sessions WHERE user_id = $1", [userId]);
  }
}

export class SqliteAuthStore implements AuthStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users    (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                                           password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,
                                           user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                                           expires_at INTEGER NOT NULL);
    `);
  }

  async findUserByEmail(email: string) {
    const row = this.db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as
      | UserRow
      | undefined;
    return row ? toUser(row) : null;
  }

  async saveUser(user: User) {
    this.db
      .prepare(
        "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash",
      )
      .run(user.id, user.email, user.passwordHash);
  }

  async findSessionUser(tokenHash: string, now: number) {
    const row = this.db
      .prepare(
        "SELECT u.id, u.email, u.password_hash FROM sessions s JOIN users u ON u.id = s.user_id " +
          "WHERE s.token_hash = ? AND s.expires_at > ?",
      )
      .get(tokenHash, now) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: number) {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
  }

  async deleteSession(tokenHash: string) {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  async deleteUserSessions(userId: string) {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}

/** JSON-file AuthStore for runtimes where SQLite cannot load. */
export class JsonAuthStore implements AuthStore {
  private users: User[] = [];
  private sessions: { tokenHash: string; userId: string; expiresAt: number }[] = [];

  constructor(private file: string) {
    if (fs.existsSync(file)) Object.assign(this, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  private persist() {
    fs.writeFileSync(this.file, JSON.stringify({ users: this.users, sessions: this.sessions }));
  }

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async saveUser(user: User) {
    this.users = [...this.users.filter((u) => u.id !== user.id), user];
    this.persist();
  }

  async findSessionUser(tokenHash: string, now: number) {
    const s = this.sessions.find((x) => x.tokenHash === tokenHash && x.expiresAt > now);
    return (s && this.users.find((u) => u.id === s.userId)) ?? null;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: number) {
    const now = Date.now();
    this.sessions = [...this.sessions.filter((s) => s.expiresAt > now), { tokenHash, userId, expiresAt }];
    this.persist();
  }

  async deleteSession(tokenHash: string) {
    this.sessions = this.sessions.filter((s) => s.tokenHash !== tokenHash);
    this.persist();
  }

  async deleteUserSessions(userId: string) {
    this.sessions = this.sessions.filter((s) => s.userId !== userId);
    this.persist();
  }
}
