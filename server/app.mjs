import { combatSchema, combatFeaturesSchema } from "./combat.mjs";
import { firstLevelSchema, buildFirstLevel } from "./first-level.mjs";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { abilities, skills, calculateRules } from "./rules.mjs";
import { creationSchema, buildStarter } from "./starter.mjs";
import defaultItems from "../shared/default-items.json" with { type: "json" };
import effectTargets from "../shared/effect-targets.json" with { type: "json" };
import {
  optionSchema,
  choicesSchema,
  mergeOptions,
  resolveChoices,
} from "./character-options.mjs";
import { resourcesSchema, applyResourceCommand } from "./resources.mjs";
import { lockDatabase, createBackup, automaticBackup } from "./backups.mjs";

const derive = promisify(scrypt);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fail = (code, message) => {
  throw Object.assign(new Error(message), { statusCode: code });
};
const text = (max = 200) => z.string().trim().min(1).max(max);
const credentials = z.object({
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.-]{3,40}$/),
  password: z.string().min(10).max(128),
  name: text(60),
});
const itemSchema = z
  .object({
    combat: combatSchema.optional(),
    combatProficiency: z.boolean().optional(),
    weightGrams: z.number().int().min(0).max(1000000000).optional(),
    effects: z
      .array(
        z
          .object({
            target: z.enum(effectTargets.map((t) => t.id)),
            value: z
              .number()
              .int()
              .min(-30)
              .max(30)
              .refine((n) => n !== 0),
          })
          .strict(),
      )
      .max(26)
      .refine(
        (effects) =>
          new Set(effects.map((e) => e.target)).size === effects.length,
        "Цели эффектов повторяются",
      )
      .optional(),
    id: text(),
    name: text(),
    type: text(),
    description: z.string().max(4000),
    secret: z.string().max(4000).optional(),
    revealed: z.boolean(),
    quantity: z.number().int().min(1).max(9999).optional(),
    equipped: z.boolean().optional(),
    requiresAttunement: z.boolean().optional(),
    attuned: z.boolean().optional(),
    maxCharges: z.number().int().min(0).max(9999).optional(),
    charges: z.number().int().min(0).max(9999).optional(),
    tags: z
      .array(z.enum(["str", "dex", "con", "int", "wis", "cha"]))
      .max(6)
      .optional(),
  })
  .strict()
  .refine(
    (i) => (i.charges || 0) <= (i.maxCharges || 0),
    "Заряды не могут превышать максимум",
  )
  .refine(
    (i) => !i.attuned || i.requiresAttunement,
    "Предмет не требует настройки",
  )
  .refine(
    (i) =>
      (i.quantity ?? 1) === 1 ||
      (!i.equipped && !i.requiresAttunement && !(i.maxCharges || 0)),
    "Экипированные предметы, предметы с зарядами или настройкой учитываются по одному",
  );
const abilityFields = {
  id: text(),
  name: text(),
  description: text(8000),
  source: z.string().max(500),
  tags: z.array(z.enum(["str", "dex", "con", "int", "wis", "cha"])).max(6),
};
const abilitySchema = z.discriminatedUnion("kind", [
  z.object({ ...abilityFields, kind: z.literal("feature") }).strict(),
  z
    .object({
      ...abilityFields,
      kind: z.literal("spell"),
      spell: z
        .object({
          level: z.number().int().min(0).max(9),
          castingTime: z.string().max(200),
          range: z.string().max(200),
          duration: z.string().max(200),
          components: z.string().max(500),
          concentration: z.boolean(),
          ritual: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);
const libraryFileSchema = z
  .object({
    format: z.literal("dnd-ipl-library"),
    version: z.literal(1),
    items: z.array(itemSchema).max(100),
    abilities: z.array(abilitySchema).max(100),
  })
  .strict();
const draftSchema = z.object({
  firstLevel: firstLevelSchema.optional(),
  originChoices: choicesSchema.optional(),
  creation: creationSchema.optional(),
  id: z.string().uuid(),
  name: text(60),
  species: text(60),
  cls: text(60),
  background: text(60),
  bio: z.string().max(5000),
  stats: z
    .array(z.number().int())
    .length(6)
    .refine(
      (a) => [...a].sort((a, b) => a - b).join(",") === "8,10,12,13,14,15",
      "Нужен стандартный массив",
    ),
  status: z.enum(["draft", "submitted"]),
});
const patchSchema = z
  .object({
    backgroundTrainingEnabled: z.boolean().optional(),
    classTrainingEnabled: z.boolean().optional(),
    acMode: z.enum(["manual", "equipment"]).optional(),
    combatFeatures: combatFeaturesSchema.optional(),
    conditions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: text(120),
            source: z.string().trim().max(200),
            duration: z.string().trim().max(200),
            note: z.string().trim().max(1000),
          })
          .strict(),
      )
      .max(20)
      .refine(
        (values) => new Set(values.map((v) => v.id)).size === values.length,
        "Состояния повторяются",
      )
      .optional(),
    concentration: z
      .object({
        name: text(120),
        duration: z.string().trim().max(200),
        note: z.string().trim().max(1000),
      })
      .strict()
      .nullable()
      .optional(),
    adjustments: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            source: text(200),
            target: z.enum([
              "ac",
              "initiative",
              ...skills.map((s) => `skill:${s.id}`),
              ...abilities.map((a) => `save:${a}`),
            ]),
            value: z
              .number()
              .int()
              .min(-30)
              .max(30)
              .refine((n) => n !== 0),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(50)
      .refine(
        (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
        "Поправки повторяются",
      )
      .optional(),
    resources: resourcesSchema.optional(),
    hp: z.number().int().min(0).max(10000).optional(),
    maxHp: z.number().int().min(1).max(10000).optional(),
    ac: z.number().int().min(0).max(100).optional(),
    level: z.number().int().min(1).max(20).optional(),
    stats: z.array(z.number().int().min(1).max(30)).length(6).optional(),
    skillRanks: z
      .object(
        Object.fromEntries(
          skills.map((s) => [s.id, z.number().int().min(0).max(2).optional()]),
        ),
      )
      .strict()
      .optional(),
    saveProficiencies: z
      .array(z.enum(abilities))
      .max(6)
      .refine((v) => new Set(v).size === v.length, "Владения повторяются")
      .optional(),
    rulesNote: z.string().max(1000).optional(),
    items: z.array(itemSchema).max(500).optional(),
    abilities: z.array(abilitySchema).max(500).optional(),
    status: z.enum(["draft", "approved"]).optional(),
    feedback: z.string().max(1000).optional(),
  })
  .strict();

export async function buildApp({
  dbPath = "data/database.sqlite",
  origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3001",
  ],
  serveStatic = false,
} = {}) {
  if (dbPath !== ":memory:")
    mkdirSync(path.dirname(dbPath), { recursive: true });
  const release = dbPath === ":memory:" ? () => {} : lockDatabase(dbPath);
  let db;
  let backupTimer;
  try {
    db = new DatabaseSync(dbPath);
    const previousVersion = db
      .prepare("PRAGMA user_version")
      .get().user_version;
    if (previousVersion > 4)
      throw new Error("База создана более новой версией приложения");
    if (previousVersion > 0 && previousVersion < 4)
      createBackup(db, dbPath, "before-update", false);
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',common_note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS members(campaign_id TEXT REFERENCES campaigns(id),user_id TEXT REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('dm','player')),PRIMARY KEY(campaign_id,user_id));
 CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY,campaign_id TEXT REFERENCES campaigns(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),owner_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS notes(character_id TEXT REFERENCES characters(id),user_id TEXT REFERENCES users(id),text TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(character_id,user_id));
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,campaign_id TEXT REFERENCES campaigns(id),character_id TEXT NOT NULL,user_id TEXT REFERENCES users(id),data TEXT NOT NULL,after_version INTEGER NOT NULL,undone INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS operations(user_id TEXT REFERENCES users(id),id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(user_id,id));
 CREATE TABLE IF NOT EXISTS library_items(campaign_id TEXT NOT NULL REFERENCES campaigns(id),id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(campaign_id,id));
 CREATE TABLE IF NOT EXISTS ability_templates(campaign_id TEXT NOT NULL REFERENCES campaigns(id),id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(campaign_id,id));
 CREATE TABLE IF NOT EXISTS character_options(campaign_id TEXT NOT NULL REFERENCES campaigns(id),id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(campaign_id,id));
 PRAGMA user_version=4;`);
    const app = Fastify({ logger: false, bodyLimit: 128 * 1024 });
    if (dbPath !== ":memory:") {
      const runBackup = () => {
        try {
          automaticBackup(db, dbPath);
        } catch (error) {
          console.error(
            "Не удалось создать автоматическую копию:",
            error.message,
          );
        }
      };
      runBackup();
      backupTimer = setInterval(runBackup, 60 * 60 * 1000);
      backupTimer.unref();
    }
    await app.register(cookie);
    await app.register(websocket);
    const sockets = new Map();
    const notify = () => {
      for (const ws of sockets.keys())
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: "changed" }));
    };
    function transaction(fn) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    }
    function member(user, campaignId) {
      const m = db
        .prepare("SELECT * FROM members WHERE campaign_id=? AND user_id=?")
        .get(campaignId, user.id);
      if (!m) fail(403, "Нет доступа к кампании");
      return m;
    }
    function master(user, campaignId) {
      if (member(user, campaignId).role !== "dm")
        fail(403, "Действие доступно только мастеру");
    }
    function current(req) {
      const token = req.cookies.ipl_session;
      if (!token) return null;
      const user = db
        .prepare(
          "SELECT u.id,u.name,u.login,u.admin FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        )
        .get(hash(token), Date.now());
      return user ? { ...user, admin: Boolean(user.admin) } : null;
    }
    function requireUser(req) {
      const u = current(req);
      if (!u) fail(401, "Войдите в аккаунт");
      return u;
    }
    function getChar(user, campaignId, id) {
      if (typeof id !== "string") fail(400, "Не указан персонаж");
      const m = member(user, campaignId);
      const row = db
        .prepare("SELECT * FROM characters WHERE id=? AND campaign_id=?")
        .get(id, campaignId);
      if (!row || (m.role !== "dm" && row.owner_id !== user.id))
        fail(404, "Персонаж не найден");
      return row;
    }
    function version(expected, actual) {
      if (!Number.isInteger(expected) || expected !== actual)
        fail(
          409,
          "Данные изменились. Обновите страницу перед повторным сохранением.",
        );
    }
    function templates(table, campaignId) {
      return db
        .prepare(`SELECT data FROM ${table} WHERE campaign_id=? ORDER BY rowid`)
        .all(campaignId)
        .map((row) => JSON.parse(row.data));
    }
    function cleanTemplate(value) {
      const { __archived, ...card } = value;
      return card;
    }
    function snapshot(user, campaignId) {
      const m = member(user, campaignId),
        dm = m.role === "dm",
        c = db.prepare("SELECT * FROM campaigns WHERE id=?").get(campaignId);
      const rows = db
        .prepare(
          `SELECT c.*,u.name AS owner FROM characters c JOIN users u ON u.id=c.owner_id WHERE campaign_id=? ${dm ? "" : "AND owner_id=?"}`,
        )
        .all(...(dm ? [campaignId] : [campaignId, user.id]));
      const characters = rows.map((row) => {
        const d = JSON.parse(row.data),
          n = db
            .prepare("SELECT * FROM notes WHERE character_id=? AND user_id=?")
            .get(row.id, user.id);
        const value = {
          ...d,
          id: row.id,
          owner: row.owner,
          ownerId: row.owner_id,
          version: row.version,
          derived: calculateRules(d),
        };
        if (dm) {
          delete value.note;
        } else {
          delete value.dmNote;
          value.note = n?.text || "";
          value.noteVersion = n?.version || 0;
          value.items = value.items.map((i) => {
            if (!i.revealed) {
              const { secret, ...safe } = i;
              return safe;
            }
            return i;
          });
        }
        return value;
      });
      const events = dm
        ? db
            .prepare(
              "SELECT * FROM events WHERE campaign_id=? ORDER BY rowid DESC LIMIT 200",
            )
            .all(campaignId)
            .map((e) => {
              const d = JSON.parse(e.data),
                row = db
                  .prepare("SELECT version FROM characters WHERE id=?")
                  .get(e.character_id);
              return {
                id: e.id,
                characterId: e.character_id,
                title: d.title,
                detail: d.detail,
                time: d.time,
                before: { name: d.before.name },
                undone: !!e.undone,
                canUndo: !e.undone && row?.version === e.after_version,
              };
            })
        : [];
      return {
        id: campaignId,
        role: m.role,
        version: c.version,
        campaign: c.name,
        description: c.description,
        commonNote: c.common_note,
        characterOptions: mergeOptions(
          templates("character_options", campaignId),
        ),
        libraryArchive: dm
          ? {
              items: templates("library_items", campaignId)
                .filter((i) => i.__archived)
                .map((i) => i.id),
              abilities: templates("ability_templates", campaignId)
                .filter((i) => i.__archived)
                .map((i) => i.id),
            }
          : { items: [], abilities: [] },
        abilityLibrary: dm
          ? db
              .prepare(
                "SELECT data FROM ability_templates WHERE campaign_id=? ORDER BY rowid",
              )
              .all(campaignId)
              .map((row) => cleanTemplate(JSON.parse(row.data)))
          : [],
        library: dm
          ? db
              .prepare(
                "SELECT data FROM library_items WHERE campaign_id=? ORDER BY rowid",
              )
              .all(campaignId)
              .map((row) => cleanTemplate(JSON.parse(row.data)))
          : [],
        characters,
        events,
        members: dm
          ? db
              .prepare(
                "SELECT u.id,u.name,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE campaign_id=?",
              )
              .all(campaignId)
          : [],
        memberCount: db
          .prepare("SELECT COUNT(*) AS n FROM members WHERE campaign_id=?")
          .get(campaignId).n,
      };
    }
    async function passwordHash(password) {
      const salt = randomBytes(16).toString("hex"),
        key = await derive(password, salt, 64);
      return salt + ":" + Buffer.from(key).toString("hex");
    }
    async function verify(password, encoded) {
      const [salt, expected] = encoded.split(":");
      const got = await derive(password, salt, 64);
      return timingSafeEqual(Buffer.from(expected, "hex"), got);
    }
    function startSession(reply, user, origin) {
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        hash(token),
        user.id,
        Date.now() + 7 * 86400000,
      );
      reply.setCookie("ipl_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: origin?.startsWith("https://"),
        path: "/",
        maxAge: 7 * 86400,
      });
      return {
        user: {
          id: user.id,
          name: user.name,
          login: user.login,
          admin: !!user.admin,
        },
      };
    }
    const attempts = new Map();
    app.addHook("onRequest", async (req, reply) => {
      reply
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer");
      if (req.url.startsWith("/api/"))
        reply.header("Cache-Control", "no-store");
      if (req.method !== "GET" && req.method !== "HEAD") {
        if (
          !origins.includes(req.headers.origin) ||
          req.headers["x-ipl-request"] !== "1"
        )
          fail(403, "Недопустимый источник запроса");
        if (req.url.startsWith("/api/auth/") || req.url === "/api/setup") {
          const now = Date.now();
          for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
          const r = attempts.get(req.ip) || { n: 0, until: now + 60000 };
          r.n++;
          attempts.set(req.ip, r);
          if (r.n > 12) fail(429, "Слишком много попыток. Подождите минуту.");
        }
      }
    });
    app.setErrorHandler((err, req, reply) => {
      const code = err instanceof z.ZodError ? 400 : err.statusCode || 500;
      reply.code(code).send({
        error:
          code === 500
            ? "Внутренняя ошибка сервера"
            : err instanceof z.ZodError
              ? "Проверьте заполненные поля"
              : err.message,
      });
    });
    app.get("/api/session", async (req) => ({
      user: current(req),
      setupRequired: !db.prepare("SELECT id FROM users LIMIT 1").get(),
    }));
    app.post("/api/setup", async (req, reply) => {
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip))
        fail(403, "Первичная настройка доступна только на ноутбуке мастера");
      const input = credentials.parse(req.body),
        password = await passwordHash(input.password),
        id = randomUUID();
      transaction(() => {
        if (db.prepare("SELECT id FROM users LIMIT 1").get())
          fail(409, "Первичная настройка уже завершена");
        db.prepare("INSERT INTO users VALUES(?,?,?,?,1)").run(
          id,
          input.login,
          input.name,
          password,
        );
      });
      return startSession(
        reply,
        { id, ...input, admin: 1 },
        req.headers.origin,
      );
    });
    app.post("/api/auth/login", async (req, reply) => {
      const input = z
        .object({ login: z.string().max(40), password: z.string().max(128) })
        .parse(req.body);
      const user = db
        .prepare("SELECT * FROM users WHERE login=?")
        .get(input.login.trim().toLowerCase());
      if (!user || !(await verify(input.password, user.password)))
        fail(401, "Неверный логин или пароль");
      return startSession(reply, user, req.headers.origin);
    });
    app.post("/api/auth/register", async (req, reply) => {
      const input = credentials
          .extend({ invitation: text(200) })
          .parse(req.body),
        password = await passwordHash(input.password),
        id = randomUUID();
      transaction(() => {
        const inv = db
          .prepare(
            "SELECT * FROM invites WHERE token=? AND used=0 AND expires>?",
          )
          .get(hash(input.invitation), Date.now());
        if (!inv) fail(400, "Приглашение недействительно или истекло");
        if (db.prepare("SELECT id FROM users WHERE login=?").get(input.login))
          fail(409, "Логин уже занят");
        db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(
          id,
          input.login,
          input.name,
          password,
        );
        db.prepare("INSERT INTO members VALUES(?,?,?)").run(
          inv.campaign_id,
          id,
          "player",
        );
        db.prepare("UPDATE invites SET used=1 WHERE token=?").run(
          hash(input.invitation),
        );
      });
      notify();
      return startSession(
        reply,
        { id, ...input, admin: 0 },
        req.headers.origin,
      );
    });
    app.post("/api/auth/logout", async (req, reply) => {
      const token = req.cookies.ipl_session;
      if (token) {
        const t = hash(token);
        db.prepare("DELETE FROM sessions WHERE token=?").run(t);
        for (const [ws, s] of sockets) if (s === t) ws.close();
      }
      reply.clearCookie("ipl_session", { path: "/" });
      return { ok: true };
    });
    app.get("/api/campaigns", async (req) => {
      const u = requireUser(req);
      return db
        .prepare(
          "SELECT c.id,c.name,c.description,m.role FROM campaigns c JOIN members m ON m.campaign_id=c.id WHERE user_id=?",
        )
        .all(u.id);
    });
    app.post("/api/campaigns", async (req) => {
      const u = requireUser(req);
      if (!u.admin)
        fail(403, "Создание кампаний доступно управляющему установкой");
      const b = z
          .object({
            name: text(90),
            description: z.string().max(2000).default(""),
          })
          .parse(req.body),
        id = randomUUID();
      transaction(() => {
        db.prepare(
          "INSERT INTO campaigns(id,name,description) VALUES(?,?,?)",
        ).run(id, b.name, b.description);
        db.prepare("INSERT INTO members VALUES(?,?,?)").run(id, u.id, "dm");
      });
      return { id };
    });
    app.post("/api/join", async (req) => {
      const u = requireUser(req),
        { invitation } = z.object({ invitation: text(200) }).parse(req.body);
      return transaction(() => {
        const inv = db
          .prepare(
            "SELECT * FROM invites WHERE token=? AND used=0 AND expires>?",
          )
          .get(hash(invitation), Date.now());
        if (!inv) fail(400, "Приглашение недействительно");
        if (
          db
            .prepare("SELECT * FROM members WHERE campaign_id=? AND user_id=?")
            .get(inv.campaign_id, u.id)
        )
          fail(409, "Вы уже участвуете в кампании");
        db.prepare("INSERT INTO members VALUES(?,?,?)").run(
          inv.campaign_id,
          u.id,
          "player",
        );
        db.prepare("UPDATE invites SET used=1 WHERE token=?").run(
          hash(invitation),
        );
        notify();
        return { id: inv.campaign_id };
      });
    });
    app.get("/api/campaigns/:id", async (req) =>
      snapshot(requireUser(req), req.params.id),
    );
    app.post("/api/campaigns/:id/invites", async (req) => {
      const u = requireUser(req);
      master(u, req.params.id);
      const token = randomBytes(24).toString("hex");
      db.prepare("INSERT INTO invites VALUES(?,?,?,0)").run(
        hash(token),
        req.params.id,
        Date.now() + 86400000,
      );
      return { invitation: token, expiresHours: 24 };
    });
    app.post("/api/campaigns/:id/revoke", async (req) => {
      const u = requireUser(req);
      master(u, req.params.id);
      const { userId } = z.object({ userId: text() }).parse(req.body);
      if (userId === u.id) fail(400, "Нельзя отключить самого себя");
      db.prepare(
        "DELETE FROM members WHERE campaign_id=? AND user_id=? AND role='player'",
      ).run(req.params.id, userId);
      notify();
      return { ok: true };
    });
    app.get("/api/campaigns/:id/library-export", async (req) => {
      const u = requireUser(req);
      master(u, req.params.id);
      const items = [
        ...new Map(
          [...defaultItems, ...templates("library_items", req.params.id)].map(
            (i) => [i.id, i],
          ),
        ).values(),
      ];
      const data = {
        format: "dnd-ipl-library",
        version: 1,
        items: items.filter((i) => !i.__archived).map(cleanTemplate),
        abilities: templates("ability_templates", req.params.id)
          .filter((i) => !i.__archived)
          .map(cleanTemplate),
      };
      if (data.items.length > 100 || data.abilities.length > 100)
        fail(
          400,
          "Для переноса оставьте не более 100 активных карточек каждого вида; остальные можно временно архивировать",
        );
      if (
        Buffer.byteLength(JSON.stringify(data, null, 2), "utf8") >
        2 * 1024 * 1024 - 2048
      )
        fail(
          400,
          "Экспорт превышает 2 МБ. Временно архивируйте часть карточек и повторите экспорт",
        );
      return libraryFileSchema.parse(data);
    });
    app.post(
      "/api/campaigns/:id/action",
      { bodyLimit: 2 * 1024 * 1024 },
      async (req) => {
        const u = requireUser(req),
          campaignId = req.params.id,
          m = member(u, campaignId);
        const b = z
          .object({
            operationId: z.string().uuid(),
            type: z.enum([
              "characterOption",
              "character",
              "resource",
              "draft",
              "note",
              "campaign",
              "undo",
              "library",
              "abilityLibrary",
              "libraryArchive",
              "libraryImport",
            ]),
            id: z.string().optional(),
            version: z.number().int().optional(),
            data: z.unknown(),
            title: z.string().max(150).optional(),
            detail: z.string().max(1000).optional(),
          })
          .parse(req.body);
        transaction(() => {
          const key = hash(JSON.stringify({ campaignId, ...b })),
            old = db
              .prepare(
                "SELECT payload FROM operations WHERE user_id=? AND id=?",
              )
              .get(u.id, b.operationId);
          if (old) {
            if (old.payload !== key)
              fail(409, "Идентификатор операции уже использован");
            return;
          }
          if (b.type === "libraryArchive") {
            master(u, campaignId);
            const c = db
              .prepare("SELECT version FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, c.version);
            const d = z
              .object({
                kind: z.enum(["item", "ability"]),
                id: text(),
                archived: z.boolean(),
              })
              .strict()
              .parse(b.data);
            const table =
              d.kind === "item" ? "library_items" : "ability_templates";
            const row = db
              .prepare(`SELECT data FROM ${table} WHERE campaign_id=? AND id=?`)
              .get(campaignId, d.id);
            const card = row
              ? JSON.parse(row.data)
              : d.kind === "item"
                ? defaultItems.find((i) => i.id === d.id)
                : undefined;
            if (!card) fail(404, "Карточка не найдена в этой кампании");
            db.prepare(
              `INSERT INTO ${table}(campaign_id,id,data) VALUES(?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET data=excluded.data`,
            ).run(
              campaignId,
              d.id,
              JSON.stringify({ ...card, __archived: d.archived }),
            );
            db.prepare("UPDATE campaigns SET version=version+1 WHERE id=?").run(
              campaignId,
            );
          }
          if (b.type === "libraryImport") {
            master(u, campaignId);
            const c = db
              .prepare("SELECT version FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, c.version);
            const data = libraryFileSchema.parse(b.data);
            if (!data.items.length && !data.abilities.length)
              fail(400, "В файле нет карточек");
            for (const [table, cards] of [
              ["library_items", data.items],
              ["ability_templates", data.abilities],
            ]) {
              const insert = db.prepare(
                `INSERT INTO ${table}(campaign_id,id,data) VALUES(?,?,?)`,
              );
              for (const card of cards) {
                const copy = { ...card, id: randomUUID() };
                insert.run(campaignId, copy.id, JSON.stringify(copy));
              }
            }
            db.prepare("UPDATE campaigns SET version=version+1 WHERE id=?").run(
              campaignId,
            );
          }
          if (b.type === "abilityLibrary") {
            master(u, campaignId);
            const c = db
              .prepare("SELECT version FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, c.version);
            const ability = abilitySchema.parse(b.data);
            const prior = db
              .prepare(
                "SELECT data FROM ability_templates WHERE campaign_id=? AND id=?",
              )
              .get(campaignId, ability.id);
            if (prior && JSON.parse(prior.data).__archived)
              fail(409, "Сначала восстановите карточку из архива");
            db.prepare(
              "INSERT INTO ability_templates(campaign_id,id,data) VALUES(?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET data=excluded.data",
            ).run(campaignId, ability.id, JSON.stringify(ability));
            db.prepare("UPDATE campaigns SET version=version+1 WHERE id=?").run(
              campaignId,
            );
          }
          if (b.type === "library") {
            master(u, campaignId);
            const c = db
              .prepare("SELECT version FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, c.version);
            const item = itemSchema.parse(b.data);
            const prior = db
              .prepare(
                "SELECT data FROM library_items WHERE campaign_id=? AND id=?",
              )
              .get(campaignId, item.id);
            if (prior && JSON.parse(prior.data).__archived)
              fail(409, "Сначала восстановите карточку из архива");
            db.prepare(
              "INSERT INTO library_items(campaign_id,id,data) VALUES(?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET data=excluded.data",
            ).run(campaignId, item.id, JSON.stringify(item));
            db.prepare("UPDATE campaigns SET version=version+1 WHERE id=?").run(
              campaignId,
            );
          }
          if (b.type === "campaign") {
            master(u, campaignId);
            const c = db
              .prepare("SELECT * FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, c.version);
            const d = z
              .object({ campaign: text(90), description: z.string().max(2000) })
              .strict()
              .parse(b.data);
            db.prepare(
              "UPDATE campaigns SET name=?,description=?,version=version+1 WHERE id=?",
            ).run(d.campaign, d.description, campaignId);
          }
          if (b.type === "characterOption") {
            master(u, campaignId);
            const campaign = db
              .prepare("SELECT version FROM campaigns WHERE id=?")
              .get(campaignId);
            version(b.version, campaign.version);
            const card = optionSchema.parse(b.data);
            const oldCard = mergeOptions(
              templates("character_options", campaignId),
            ).find((c) => c.id === card.id);
            if (oldCard && oldCard.kind !== card.kind)
              fail(400, "Категорию существующей карточки менять нельзя");
            if (!oldCard && !z.string().uuid().safeParse(card.id).success)
              fail(400, "Для новой карточки нужен уникальный идентификатор");
            if (
              !oldCard &&
              templates("character_options", campaignId).length >= 200
            )
              fail(
                400,
                "Лимит: 200 пользовательских карточек и изменений каталога",
              );
            db.prepare(
              "INSERT INTO character_options VALUES(?,?,?) ON CONFLICT(campaign_id,id) DO UPDATE SET data=excluded.data",
            ).run(campaignId, card.id, JSON.stringify(card));
            db.prepare("UPDATE campaigns SET version=version+1 WHERE id=?").run(
              campaignId,
            );
          }
          if (b.type === "draft") {
            const d = draftSchema.parse(b.data);
            const existing = db
              .prepare("SELECT * FROM characters WHERE id=?")
              .get(d.id);
            if (d.creation && d.firstLevel)
              fail(400, "Выберите один способ расчёта");
            if (d.originChoices) {
              const resolved = resolveChoices(
                d.originChoices,
                mergeOptions(templates("character_options", campaignId)),
                existing ? JSON.parse(existing.data) : null,
              );
              Object.assign(d, resolved);
              if (
                d.creation &&
                (d.originChoices.species !== "core2024-species-dwarf" ||
                  d.originChoices.class !== "core2024-class-fighter" ||
                  d.originChoices.background !== "core2024-background-soldier")
              )
                fail(
                  400,
                  "Авторасчёт стартового шаблона не соответствует выбранным карточкам",
                );
            }
            if (existing) {
              getChar(u, campaignId, d.id);
              version(b.version, existing.version);
              if (JSON.parse(existing.data).status !== "draft")
                fail(403, "Анкета уже отправлена или утверждена");
              const previous = JSON.parse(existing.data);
              if (
                !!previous.creation !== !!d.creation ||
                !!previous.firstLevel !== !!d.firstLevel
              )
                fail(
                  409,
                  "Нельзя менять способ создания сохранённого персонажа",
                );
              const starter = d.creation
                ? buildStarter(d, previous)
                : d.firstLevel
                  ? buildFirstLevel(d, previous)
                  : {};
              if (d.creation && d.firstLevel)
                fail(400, "Выберите один способ расчёта");
              db.prepare(
                "UPDATE characters SET data=?,version=version+1 WHERE id=?",
              ).run(JSON.stringify({ ...previous, ...d, ...starter }), d.id);
            } else {
              if (b.version !== undefined) fail(409, "Персонаж не существует");
              const character = {
                ...d,
                hp: 12,
                maxHp: 12,
                ac: 14,
                items: [],
                dmNote: "",
                feedback: "",
                color: "#718876",
                ...(d.creation
                  ? buildStarter(d)
                  : d.firstLevel
                    ? buildFirstLevel(d)
                    : {}),
              };
              db.prepare(
                "INSERT INTO characters(id,campaign_id,owner_id,data) VALUES(?,?,?,?)",
              ).run(d.id, campaignId, u.id, JSON.stringify(character));
            }
          }
          if (b.type === "character" || b.type === "resource") {
            master(u, campaignId);
            const row = getChar(u, campaignId, b.id);
            version(b.version, row.version);
            const before = JSON.parse(row.data);
            const result =
              b.type === "resource"
                ? applyResourceCommand(before.resources, b.data)
                : null;
            const patch = result
                ? { resources: result.resources }
                : patchSchema.parse(b.data),
              after = { ...before, ...patch };
            if (
              result &&
              JSON.stringify(before.resources || []) ===
                JSON.stringify(result.resources)
            )
              fail(400, "Нет ресурсов для восстановления");
            if ((after.combatFeatures?.monkLevel || 0) > (after.level || 1))
              fail(
                400,
                "Уровень монаха не может превышать общий уровень персонажа",
              );
            if ("ac" in patch) after.acSource = "manual";
            if (
              [
                "level",
                "stats",
                "skillRanks",
                "saveProficiencies",
                "rulesNote",
              ].some((key) => key in patch)
            )
              after.rulesConfigured = true;
            if (after.hp > after.maxHp)
              fail(400, "Здоровье не может превышать максимум");
            if (patch.status && before.status !== "submitted")
              fail(409, "Решение принимается только по отправленной анкете");
            if (patch.status === "draft" && !patch.feedback?.trim())
              fail(400, "Добавьте причину возврата");
            db.prepare(
              "UPDATE characters SET data=?,version=version+1 WHERE id=?",
            ).run(JSON.stringify(after), row.id);
            const event = {
              title: result?.title || b.title || "Персонаж изменён",
              detail: result?.detail || b.detail || "",
              time: new Date().toLocaleString("ru"),
              before,
            };
            db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,0)").run(
              randomUUID(),
              campaignId,
              row.id,
              u.id,
              JSON.stringify(event),
              row.version + 1,
            );
          }
          if (b.type === "note") {
            const d = z
              .object({
                scope: z.enum(["personal", "dm", "common"]),
                text: z.string().max(20000),
              })
              .parse(b.data);
            if (d.scope === "common") {
              master(u, campaignId);
              const c = db
                .prepare("SELECT version FROM campaigns WHERE id=?")
                .get(campaignId);
              version(b.version, c.version);
              db.prepare(
                "UPDATE campaigns SET common_note=?,version=version+1 WHERE id=?",
              ).run(d.text, campaignId);
            } else {
              const row = getChar(u, campaignId, b.id);
              if (d.scope === "dm") {
                master(u, campaignId);
                version(b.version, row.version);
                const v = JSON.parse(row.data);
                v.dmNote = d.text;
                db.prepare(
                  "UPDATE characters SET data=?,version=version+1 WHERE id=?",
                ).run(JSON.stringify(v), row.id);
              } else {
                if (row.owner_id !== u.id || m.role === "dm")
                  fail(403, "Личная заметка доступна владельцу-игроку");
                const n = db
                  .prepare(
                    "SELECT * FROM notes WHERE character_id=? AND user_id=?",
                  )
                  .get(row.id, u.id);
                version(b.version, n?.version || 0);
                db.prepare(
                  "INSERT INTO notes VALUES(?,?,?,1) ON CONFLICT(character_id,user_id) DO UPDATE SET text=excluded.text,version=notes.version+1",
                ).run(row.id, u.id, d.text);
              }
            }
          }
          if (b.type === "undo") {
            master(u, campaignId);
            const e = db
              .prepare("SELECT * FROM events WHERE id=? AND campaign_id=?")
              .get(b.id, campaignId);
            if (!e || e.undone) fail(409, "Это действие нельзя отменить");
            const row = getChar(u, campaignId, e.character_id);
            version(e.after_version, row.version);
            const previous = JSON.parse(e.data),
              now = JSON.parse(row.data);
            db.prepare(
              "UPDATE characters SET data=?,version=version+1 WHERE id=?",
            ).run(JSON.stringify(previous.before), row.id);
            db.prepare("UPDATE events SET undone=1 WHERE id=?").run(e.id);
            db.prepare("INSERT INTO events VALUES(?,?,?,?,?,?,1)").run(
              randomUUID(),
              campaignId,
              row.id,
              u.id,
              JSON.stringify({
                title: "Отмена: " + previous.title,
                detail: "Восстановлено предыдущее состояние",
                time: new Date().toLocaleString("ru"),
                before: now,
              }),
              row.version + 1,
            );
          }
          db.prepare("INSERT INTO operations VALUES(?,?,?)").run(
            u.id,
            b.operationId,
            key,
          );
        });
        notify();
        return snapshot(u, campaignId);
      },
    );
    app.get(
      "/api/updates",
      {
        websocket: true,
        preValidation: async (req) => {
          requireUser(req);
          if (!origins.includes(req.headers.origin))
            fail(403, "Недопустимый источник");
        },
      },
      (socket, req) => {
        sockets.set(socket, hash(req.cookies.ipl_session));
        socket.on("close", () => sockets.delete(socket));
      },
    );
    if (serveStatic && existsSync(path.resolve("dist/index.html"))) {
      await app.register(staticFiles, { root: path.resolve("dist") });
      app.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith("/api/"))
          return reply.code(404).send({ error: "Не найдено" });
        return reply.sendFile("index.html");
      });
    }
    app.addHook("onClose", async () => {
      for (const ws of sockets.keys()) ws.close();
      db.close();
      clearInterval(backupTimer);
      release();
    });
    return app;
  } catch (error) {
    clearInterval(backupTimer);
    db?.close();
    release();
    throw error;
  }
}
