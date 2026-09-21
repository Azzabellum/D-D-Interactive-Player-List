import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";

const tables = {
  users: "id,login,name,password,admin",
  sessions: "token,user_id,expires",
  campaigns: "id,name,description,common_note,version",
  members: "campaign_id,user_id,role",
  invites: "token,campaign_id,expires,used",
  characters: "id,campaign_id,owner_id,data,version",
  notes: "character_id,user_id,text,version",
  events: "id,campaign_id,character_id,user_id,data,after_version,undone",
  operations: "user_id,id,payload",
  library_items: "campaign_id,id,data",
  ability_templates: "campaign_id,id,data",
};
export const backupDir = (dbPath) =>
  path.join(path.dirname(path.resolve(dbPath)), "backups");

export function lockDatabase(dbPath) {
  const file = `${path.resolve(dbPath)}.lock`;
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0)
      throw new Error(`Некорректный файл блокировки: ${file}`);
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") rmSync(file);
      else throw error;
    }
  }
  try {
    writeFileSync(file, String(process.pid), { flag: "wx" });
  } catch {
    throw new Error(
      "База используется. Сначала остановите сервер и другие команды обслуживания.",
    );
  }
  return () => rmSync(file, { force: true });
}

export function inspectBackup(file) {
  if (!existsSync(file)) throw new Error("Файл копии не найден");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA trusted_schema=OFF");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (![3, 4].includes(version))
      throw new Error("Поддерживаются базы IPL версии 3 и 4");
    if (version === 4) {
      db.prepare(
        "SELECT campaign_id,id,data FROM character_options LIMIT 0",
      ).all();
      if (
        db
          .prepare(
            "SELECT 1 FROM character_options WHERE NOT json_valid(data) LIMIT 1",
          )
          .get()
      )
        throw new Error("Повреждён каталог персонажей");
    }
    if (
      db
        .prepare("PRAGMA integrity_check")
        .all()
        .some((r) => r.integrity_check !== "ok")
    )
      throw new Error("Нарушена целостность базы");
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Нарушены связи данных");
    if (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('trigger','view')",
        )
        .all().length
    )
      throw new Error("Копия содержит неподдерживаемые объекты");
    for (const [table, columns] of Object.entries(tables))
      db.prepare(`SELECT ${columns} FROM ${table} LIMIT 0`).all();
    for (const table of [
      "characters",
      "events",
      "library_items",
      "ability_templates",
    ]) {
      if (
        db
          .prepare(`SELECT 1 FROM ${table} WHERE NOT json_valid(data) LIMIT 1`)
          .get()
      )
        throw new Error("Повреждены игровые данные");
    }
    return {
      version,
      campaigns: db.prepare("SELECT COUNT(*) AS n FROM campaigns").get().n,
      characters: db.prepare("SELECT COUNT(*) AS n FROM characters").get().n,
    };
  } finally {
    db.close();
  }
}

export function listBackups(dbPath) {
  const dir = backupDir(dbPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) =>
      /^(auto|manual|before-restore|before-update)-.*\.sqlite$/.test(name),
    )
    .map((name) => ({
      name,
      file: path.join(dir, name),
      time: statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
}

export function createBackup(db, dbPath, kind = "manual", validate = true) {
  const dir = backupDir(dbPath);
  mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `${kind}-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.sqlite`,
  );
  const temp = `${file}.partial`;
  try {
    db.prepare("VACUUM INTO ?").run(temp);
    if (validate) inspectBackup(temp);
    renameSync(temp, file);
    if (kind === "auto")
      for (const old of listBackups(dbPath)
        .filter((b) => b.name.startsWith("auto-"))
        .slice(10))
        rmSync(old.file);
    return file;
  } finally {
    rmSync(temp, { force: true });
  }
}

export function automaticBackup(db, dbPath) {
  const latest = listBackups(dbPath).find((b) => b.name.startsWith("auto-"));
  if (!latest || Date.now() - latest.time >= 86400000)
    return createBackup(db, dbPath, "auto");
}

export function restoreBackup(source, dbPath) {
  const release = lockDatabase(dbPath);
  const staged = `${path.resolve(dbPath)}.${randomUUID()}.restore`;
  try {
    inspectBackup(source);
    const input = new DatabaseSync(source, { readOnly: true });
    try {
      input.prepare("VACUUM INTO ?").run(staged);
    } finally {
      input.close();
    }
    const next = new DatabaseSync(staged);
    try {
      next.exec("DELETE FROM sessions; DELETE FROM invites;");
    } finally {
      next.close();
    }
    inspectBackup(staged);
    let safety;
    if (existsSync(dbPath)) {
      const current = new DatabaseSync(dbPath);
      try {
        safety = createBackup(current, dbPath, "before-restore");
        const checkpoint = current
          .prepare("PRAGMA wal_checkpoint(TRUNCATE)")
          .get();
        if (checkpoint.busy) throw new Error("База занята другим процессом");
      } finally {
        current.close();
      }
    }
    renameSync(staged, path.resolve(dbPath));
    return { safety, ...inspectBackup(dbPath) };
  } finally {
    rmSync(staged, { force: true });
    release();
  }
}
