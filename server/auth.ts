import crypto from "node:crypto";
import fs from "node:fs";
import { promisify } from "node:util";
import express from "express";
import Database from "better-sqlite3";
import type pg from "pg";
import { ApiError } from "../shared/services";

/**
 * Accounts, workspaces and sign-in for the API.
 *
 * Each business has a workspace with its own data. Anyone can sign up,
 * which creates a new workspace with them as its owner (unless
 * ALLOW_SIGNUP=false); owners invite their team by link. Every account
 * belongs to exactly one workspace. The "default" workspace holds the data
 * from before workspaces existed and is owned by OWNER_EMAIL (ensureOwner).
 *
 * Clients send the session token as "Authorization: Bearer <token>", which
 * works the same from the web app and the Android app.
 */

const SESSION_DAYS = 30;
const INVITE_DAYS = 7;
const MIN_PASSWORD_LENGTH = 10;
export const DEFAULT_WORKSPACE = "default";

export type Role = "owner" | "member";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  workspaceId: string;
  role: Role;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface Invite {
  id: string;
  workspaceId: string;
  email: string;
  expiresAt: number;
}

/** Where accounts, workspaces, invites and sessions live. Tokens are stored hashed. */
export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  /** Inserts or updates by id. */
  saveUser(user: User): Promise<void>;
  deleteUser(id: string): Promise<void>;
  listWorkspaceUsers(workspaceId: string): Promise<User[]>;

  createWorkspace(workspace: Workspace): Promise<void>;
  getWorkspace(id: string): Promise<Workspace | null>;

  /** The signed-in user for a session, or null if unknown or expired. */
  findSessionUser(tokenHash: string, now: number): Promise<User | null>;
  createSession(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Signs a user out everywhere, except the session given (if any). */
  deleteUserSessions(userId: string, exceptTokenHash?: string): Promise<void>;

  /** Replaces any earlier invite for the same email in the same workspace. */
  saveInvite(invite: Invite, tokenHash: string): Promise<void>;
  findInvite(tokenHash: string, now: number): Promise<Invite | null>;
  listInvites(workspaceId: string, now: number): Promise<Invite[]>;
  deleteInvite(workspaceId: string, id: string): Promise<void>;
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
const newToken = () => crypto.randomBytes(32).toString("base64url");
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function checkNewPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
}

/* ------------------------------- owner -------------------------------- */

/**
 * Creates the default workspace's owner from .env if that account does
 * not exist yet. After that the password is changed in the app; with
 * resetPassword (RESET_OWNER_PASSWORD=yes) the .env password is forced
 * back on and every device is signed out — the way back in if it is lost.
 */
export async function ensureOwner(
  store: AuthStore,
  email: string,
  password: string,
  options: { resetPassword: boolean },
): Promise<string> {
  email = normalizeEmail(email);
  if (!isEmail(email)) throw new Error(`OWNER_EMAIL "${email}" does not look like an email address.`);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`OWNER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  const existing = await store.findUserByEmail(email);
  if (!existing) {
    await store.saveUser({
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      workspaceId: DEFAULT_WORKSPACE,
      role: "owner",
    });
    return `Sign-in account created for ${email}.`;
  }
  if (!options.resetPassword || (await verifyPassword(password, existing.passwordHash))) {
    return `Sign-in account: ${email}.`;
  }
  await store.saveUser({ ...existing, passwordHash: await hashPassword(password) });
  await store.deleteUserSessions(existing.id);
  return (
    `Password for ${email} reset to OWNER_PASSWORD and every device signed out. ` +
    "Remove RESET_OWNER_PASSWORD now, or it will undo password changes made in the app."
  );
}

/* ---------------------------- rate limiting ---------------------------- */

/** Counts attempts per key in a rolling window (in memory). */
class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}

  /** Milliseconds until the key may try again, or 0 if it may try now. */
  blockedFor(key: string, now: number): number {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) return 0;
    return h.count >= this.max ? h.resetAt - now : 0;
  }

  record(key: string, now: number) {
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

function tooMany(waitMs: number, what: string): ApiError {
  const minutes = Math.ceil(waitMs / 60_000);
  return new ApiError(429, `Too many ${what}. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
}

/* ------------------------------- routes -------------------------------- */

function bearerToken(req: express.Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
  return match ? match[1] : null;
}

const describeUser = (u: User) => ({ id: u.id, email: u.email, role: u.role });
const describeInvite = (i: Invite) => ({ id: i.id, email: i.email, expiresAt: i.expiresAt });

export interface AuthOptions {
  /** Whether strangers may create accounts (and workspaces). */
  allowSignup: boolean;
  /** Whether OWNER_EMAIL is configured, for a clearer message when nobody can sign in. */
  ownerConfigured: boolean;
  /** Fills a newly created workspace with its starting data. */
  seedWorkspace: (workspaceId: string) => Promise<void>;
}

/**
 * Public routes under /auth (sign-up, sign-in, invites), the signed-in
 * routes /auth/me, /auth/logout, /auth/password and /team, and
 * requireAuth, which every other API route sits behind.
 */
export function createAuth(store: AuthStore, options: AuthOptions) {
  const WINDOW = 15 * 60 * 1000;
  const failedByIp = new AttemptLimiter(10, WINDOW);
  const failedByEmail = new AttemptLimiter(30, WINDOW);
  const signupsByIp = new AttemptLimiter(5, 60 * 60 * 1000);
  const router = express.Router();

  const requireAuth: express.RequestHandler = async (req, res, next) => {
    const token = bearerToken(req);
    const user = token ? await store.findSessionUser(hashToken(token), Date.now()) : null;
    if (!user) throw new ApiError(401, "Please sign in");
    res.locals.user = user;
    res.locals.tokenHash = hashToken(token!);
    next();
  };

  const requireOwner: express.RequestHandler = (_req, res, next) => {
    if ((res.locals.user as User).role !== "owner") {
      throw new ApiError(403, "Only the workspace owner can manage the team");
    }
    next();
  };

  /** Starts a session and replies with what the client keeps. */
  const signInAs = async (res: express.Response, user: User) => {
    const token = newToken();
    const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    await store.createSession(hashToken(token), user.id, expiresAt);
    res.json({ token, expiresAt });
  };

  const assertEmailFree = async (email: string) => {
    if (await store.findUserByEmail(email)) {
      throw new ApiError(409, "An account with this email already exists. Sign in instead.");
    }
  };

  /* ---- public ---- */

  router.get("/auth/options", (_req, res) => {
    res.json({ signup: options.allowSignup });
  });

  router.post("/auth/signup", async (req, res) => {
    if (!options.allowSignup) throw new ApiError(403, "Sign-up is turned off on this server");
    const now = Date.now();
    const ip = req.ip ?? "unknown";
    const wait = signupsByIp.blockedFor(ip, now);
    if (wait > 0) throw tooMany(wait, "new accounts from this network");

    const email = normalizeEmail(String(req.body?.email ?? ""));
    const password = String(req.body?.password ?? "");
    const workspaceName = String(req.body?.workspaceName ?? "").trim();
    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address");
    checkNewPassword(password);
    if (!workspaceName) throw new ApiError(400, "Enter your business name");
    if (workspaceName.length > 80) throw new ApiError(400, "Business name must be 80 characters or fewer");
    await assertEmailFree(email);
    signupsByIp.record(ip, now);

    const workspace = { id: crypto.randomUUID(), name: workspaceName };
    await store.createWorkspace(workspace);
    await options.seedWorkspace(workspace.id);
    const user: User = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await hashPassword(password),
      workspaceId: workspace.id,
      role: "owner",
    };
    await store.saveUser(user);
    await signInAs(res, user);
  });

  router.post("/auth/login", async (req, res) => {
    const now = Date.now();
    const email = normalizeEmail(String(req.body?.email ?? ""));
    const password = String(req.body?.password ?? "");
    const ip = req.ip ?? "unknown";

    const wait = Math.max(failedByIp.blockedFor(ip, now), failedByEmail.blockedFor(email, now));
    if (wait > 0) throw tooMany(wait, "failed sign-in attempts");
    if (!email || !password) throw new ApiError(400, "Enter your email and password");

    const user = await store.findUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      failedByIp.record(ip, now);
      failedByEmail.record(email, now);
      if (!options.ownerConfigured && !options.allowSignup) {
        throw new ApiError(
          401,
          "No sign-in account is set up on this server yet. Set OWNER_EMAIL and OWNER_PASSWORD in its .env and restart it.",
        );
      }
      throw new ApiError(401, "Wrong email or password");
    }
    failedByIp.clear(ip);
    failedByEmail.clear(email);
    await signInAs(res, user);
  });

  // The invite token travels in the request body, never the URL, so it
  // doesn't end up in server or proxy logs.
  const findInviteOr404 = async (token: unknown) => {
    const invite = typeof token === "string" && token ? await store.findInvite(hashToken(token), Date.now()) : null;
    if (!invite) throw new ApiError(404, "This invite link is invalid or has expired. Ask for a new one.");
    return invite;
  };

  router.post("/auth/invite", async (req, res) => {
    const invite = await findInviteOr404(req.body?.token);
    const workspace = await store.getWorkspace(invite.workspaceId);
    res.json({ email: invite.email, workspaceName: workspace?.name ?? "" });
  });

  router.post("/auth/invite/accept", async (req, res) => {
    const invite = await findInviteOr404(req.body?.token);
    const password = String(req.body?.password ?? "");
    checkNewPassword(password);
    await assertEmailFree(invite.email);
    const user: User = {
      id: crypto.randomUUID(),
      email: invite.email,
      passwordHash: await hashPassword(password),
      workspaceId: invite.workspaceId,
      role: "member",
    };
    await store.saveUser(user);
    await store.deleteInvite(invite.workspaceId, invite.id);
    await signInAs(res, user);
  });

  /* ---- signed in ---- */

  router.get("/auth/me", requireAuth, async (_req, res) => {
    const user = res.locals.user as User;
    const workspace = await store.getWorkspace(user.workspaceId);
    res.json({ email: user.email, role: user.role, workspaceName: workspace?.name ?? "" });
  });

  router.post("/auth/logout", requireAuth, async (_req, res) => {
    await store.deleteSession(res.locals.tokenHash as string);
    res.json({ ok: true });
  });

  router.post("/auth/password", requireAuth, async (req, res) => {
    const user = res.locals.user as User;
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (!(await verifyPassword(current, user.passwordHash))) throw new ApiError(400, "Current password is wrong");
    checkNewPassword(next);
    await store.saveUser({ ...user, passwordHash: await hashPassword(next) });
    // Keep this device signed in; sign out every other one.
    await store.deleteUserSessions(user.id, res.locals.tokenHash as string);
    res.json({ ok: true });
  });

  router.get("/team", requireAuth, async (_req, res) => {
    const user = res.locals.user as User;
    const [members, invites] = await Promise.all([
      store.listWorkspaceUsers(user.workspaceId),
      user.role === "owner" ? store.listInvites(user.workspaceId, Date.now()) : Promise.resolve([]),
    ]);
    res.json({ members: members.map(describeUser), invites: invites.map(describeInvite) });
  });

  router.post("/team/invites", requireAuth, requireOwner, async (req, res) => {
    const user = res.locals.user as User;
    const email = normalizeEmail(String(req.body?.email ?? ""));
    if (!isEmail(email)) throw new ApiError(400, "Enter a valid email address");
    if (await store.findUserByEmail(email)) {
      throw new ApiError(409, "That email already has a Marketbing account, so it can't join another workspace");
    }
    const token = newToken();
    const invite: Invite = {
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      email,
      expiresAt: Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
    };
    await store.saveInvite(invite, hashToken(token));
    // The token is only ever shown here; the database keeps its hash.
    res.status(201).json({ ...describeInvite(invite), token });
  });

  router.delete("/team/invites/:id", requireAuth, requireOwner, async (req, res) => {
    await store.deleteInvite((res.locals.user as User).workspaceId, String(req.params.id));
    res.json({ ok: true });
  });

  router.delete("/team/members/:id", requireAuth, requireOwner, async (req, res) => {
    const user = res.locals.user as User;
    const memberId = String(req.params.id);
    if (memberId === user.id) throw new ApiError(400, "You can't remove yourself");
    const members = await store.listWorkspaceUsers(user.workspaceId);
    if (!members.some((m) => m.id === memberId)) throw new ApiError(404, "No such team member");
    await store.deleteUser(memberId);
    res.json({ ok: true });
  });

  return { router, requireAuth };
}

/* ------------------------------- stores -------------------------------- */

type UserRow = { id: string; email: string; password_hash: string; workspace_id: string; role: Role };
const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  workspaceId: r.workspace_id,
  role: r.role,
});
const USER_COLUMNS = "id, email, password_hash, workspace_id, role";

export class PgAuthStore implements AuthStore {
  constructor(private pool: pg.Pool) {}

  async findUserByEmail(email: string) {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM marketbing.users WHERE email = $1`,
      [email],
    );
    return rows.length ? toUser(rows[0]) : null;
  }

  async saveUser(user: User) {
    await this.pool.query(
      "INSERT INTO marketbing.users (id, email, password_hash, workspace_id, role) VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role",
      [user.id, user.email, user.passwordHash, user.workspaceId, user.role],
    );
  }

  async deleteUser(id: string) {
    await this.pool.query("DELETE FROM marketbing.users WHERE id = $1", [id]);
  }

  async listWorkspaceUsers(workspaceId: string) {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM marketbing.users WHERE workspace_id = $1 ORDER BY role DESC, email`,
      [workspaceId],
    );
    return rows.map(toUser);
  }

  async createWorkspace(workspace: Workspace) {
    await this.pool.query("INSERT INTO marketbing.workspaces (id, name) VALUES ($1, $2)", [workspace.id, workspace.name]);
  }

  async getWorkspace(id: string) {
    const { rows } = await this.pool.query<Workspace>("SELECT id, name FROM marketbing.workspaces WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  async findSessionUser(tokenHash: string, now: number) {
    const { rows } = await this.pool.query<UserRow>(
      "SELECT u.id, u.email, u.password_hash, u.workspace_id, u.role FROM marketbing.sessions s " +
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

  async deleteUserSessions(userId: string, exceptTokenHash = "") {
    await this.pool.query("DELETE FROM marketbing.sessions WHERE user_id = $1 AND token_hash <> $2", [
      userId,
      exceptTokenHash,
    ]);
  }

  async saveInvite(invite: Invite, tokenHash: string) {
    await this.pool.query(
      "INSERT INTO marketbing.invites (id, token_hash, workspace_id, email, expires_at) VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (workspace_id, email) DO UPDATE SET id = EXCLUDED.id, token_hash = EXCLUDED.token_hash, " +
        "created_at = now(), expires_at = EXCLUDED.expires_at",
      [invite.id, tokenHash, invite.workspaceId, invite.email, new Date(invite.expiresAt)],
    );
  }

  async findInvite(tokenHash: string, now: number) {
    const { rows } = await this.pool.query<{ id: string; workspace_id: string; email: string; expires_at: Date }>(
      "SELECT id, workspace_id, email, expires_at FROM marketbing.invites WHERE token_hash = $1 AND expires_at > $2",
      [tokenHash, new Date(now)],
    );
    return rows.length ? toInvite(rows[0]) : null;
  }

  async listInvites(workspaceId: string, now: number) {
    const { rows } = await this.pool.query<{ id: string; workspace_id: string; email: string; expires_at: Date }>(
      "SELECT id, workspace_id, email, expires_at FROM marketbing.invites " +
        "WHERE workspace_id = $1 AND expires_at > $2 ORDER BY created_at",
      [workspaceId, new Date(now)],
    );
    return rows.map(toInvite);
  }

  async deleteInvite(workspaceId: string, id: string) {
    await this.pool.query("DELETE FROM marketbing.invites WHERE workspace_id = $1 AND id = $2", [workspaceId, id]);
  }
}

const toInvite = (r: { id: string; workspace_id: string; email: string; expires_at: Date | number }): Invite => ({
  id: r.id,
  workspaceId: r.workspace_id,
  email: r.email,
  expiresAt: typeof r.expires_at === "number" ? r.expires_at : r.expires_at.getTime(),
});

export class SqliteAuthStore implements AuthStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL);
        INSERT OR IGNORE INTO workspaces (id, name) VALUES ('${DEFAULT_WORKSPACE}', 'NovaSkin (Demo Workspace)');
        CREATE TABLE IF NOT EXISTS users      (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                                               password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions   (token_hash TEXT PRIMARY KEY,
                                               user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                                               expires_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS invites    (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
                                               workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
                                               email TEXT NOT NULL, created_at INTEGER NOT NULL,
                                               expires_at INTEGER NOT NULL, UNIQUE (workspace_id, email));
      `);
      // Accounts from before workspaces own the default workspace.
      const columns = (this.db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
      if (!columns.includes("workspace_id")) {
        this.db.exec(`
          ALTER TABLE users ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE}';
          ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
        `);
      }
    })();
  }

  async findUserByEmail(email: string) {
    const row = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).get(email) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async saveUser(user: User) {
    this.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, workspace_id, role) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, role = excluded.role",
      )
      .run(user.id, user.email, user.passwordHash, user.workspaceId, user.role);
  }

  async deleteUser(id: string) {
    this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  async listWorkspaceUsers(workspaceId: string) {
    return (
      this.db
        .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE workspace_id = ? ORDER BY role DESC, email`)
        .all(workspaceId) as UserRow[]
    ).map(toUser);
  }

  async createWorkspace(workspace: Workspace) {
    this.db.prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(workspace.id, workspace.name);
  }

  async getWorkspace(id: string) {
    return (this.db.prepare("SELECT id, name FROM workspaces WHERE id = ?").get(id) as Workspace | undefined) ?? null;
  }

  async findSessionUser(tokenHash: string, now: number) {
    const row = this.db
      .prepare(
        "SELECT u.id, u.email, u.password_hash, u.workspace_id, u.role FROM sessions s JOIN users u ON u.id = s.user_id " +
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

  async deleteUserSessions(userId: string, exceptTokenHash = "") {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, exceptTokenHash);
  }

  async saveInvite(invite: Invite, tokenHash: string) {
    this.db
      .prepare(
        "INSERT INTO invites (id, token_hash, workspace_id, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(workspace_id, email) DO UPDATE SET id = excluded.id, token_hash = excluded.token_hash, " +
          "created_at = excluded.created_at, expires_at = excluded.expires_at",
      )
      .run(invite.id, tokenHash, invite.workspaceId, invite.email, Date.now(), invite.expiresAt);
  }

  async findInvite(tokenHash: string, now: number) {
    const row = this.db
      .prepare("SELECT id, workspace_id, email, expires_at FROM invites WHERE token_hash = ? AND expires_at > ?")
      .get(tokenHash, now) as { id: string; workspace_id: string; email: string; expires_at: number } | undefined;
    return row ? toInvite(row) : null;
  }

  async listInvites(workspaceId: string, now: number) {
    return (
      this.db
        .prepare(
          "SELECT id, workspace_id, email, expires_at FROM invites WHERE workspace_id = ? AND expires_at > ? ORDER BY created_at",
        )
        .all(workspaceId, now) as { id: string; workspace_id: string; email: string; expires_at: number }[]
    ).map(toInvite);
  }

  async deleteInvite(workspaceId: string, id: string) {
    this.db.prepare("DELETE FROM invites WHERE workspace_id = ? AND id = ?").run(workspaceId, id);
  }
}

/** JSON-file AuthStore for runtimes where SQLite cannot load. */
export class JsonAuthStore implements AuthStore {
  private users: User[] = [];
  private workspaces: Workspace[] = [];
  private sessions: { tokenHash: string; userId: string; expiresAt: number }[] = [];
  private invites: (Invite & { tokenHash: string; createdAt: number })[] = [];

  constructor(private file: string) {
    if (fs.existsSync(file)) Object.assign(this, JSON.parse(fs.readFileSync(file, "utf8")));
    // Accounts from before workspaces own the default workspace.
    this.users = this.users.map((u) => ({ ...u, workspaceId: u.workspaceId ?? DEFAULT_WORKSPACE, role: u.role ?? "owner" }));
    if (!this.workspaces.some((w) => w.id === DEFAULT_WORKSPACE)) {
      this.workspaces.push({ id: DEFAULT_WORKSPACE, name: "NovaSkin (Demo Workspace)" });
    }
  }

  private persist() {
    const { users, workspaces, sessions, invites } = this;
    fs.writeFileSync(this.file, JSON.stringify({ users, workspaces, sessions, invites }));
  }

  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async saveUser(user: User) {
    this.users = [...this.users.filter((u) => u.id !== user.id), user];
    this.persist();
  }

  async deleteUser(id: string) {
    this.users = this.users.filter((u) => u.id !== id);
    this.sessions = this.sessions.filter((s) => s.userId !== id);
    this.persist();
  }

  async listWorkspaceUsers(workspaceId: string) {
    return this.users
      .filter((u) => u.workspaceId === workspaceId)
      .sort((a, b) => b.role.localeCompare(a.role) || a.email.localeCompare(b.email));
  }

  async createWorkspace(workspace: Workspace) {
    this.workspaces.push(workspace);
    this.persist();
  }

  async getWorkspace(id: string) {
    return this.workspaces.find((w) => w.id === id) ?? null;
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

  async deleteUserSessions(userId: string, exceptTokenHash?: string) {
    this.sessions = this.sessions.filter((s) => s.userId !== userId || s.tokenHash === exceptTokenHash);
    this.persist();
  }

  async saveInvite(invite: Invite, tokenHash: string) {
    this.invites = [
      ...this.invites.filter((i) => !(i.workspaceId === invite.workspaceId && i.email === invite.email)),
      { ...invite, tokenHash, createdAt: Date.now() },
    ];
    this.persist();
  }

  async findInvite(tokenHash: string, now: number) {
    const i = this.invites.find((x) => x.tokenHash === tokenHash && x.expiresAt > now);
    return i ? { id: i.id, workspaceId: i.workspaceId, email: i.email, expiresAt: i.expiresAt } : null;
  }

  async listInvites(workspaceId: string, now: number) {
    return this.invites
      .filter((i) => i.workspaceId === workspaceId && i.expiresAt > now)
      .map((i) => ({ id: i.id, workspaceId: i.workspaceId, email: i.email, expiresAt: i.expiresAt }));
  }

  async deleteInvite(workspaceId: string, id: string) {
    this.invites = this.invites.filter((i) => !(i.workspaceId === workspaceId && i.id === id));
    this.persist();
  }
}
