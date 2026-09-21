import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp } from "../server/app.mjs";
import {
  createBackup,
  inspectBackup,
  listBackups,
  restoreBackup,
  automaticBackup,
} from "../server/backups.mjs";

test("backup from WAL, retention, offline restore and session revocation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ipl-backup-"));
  const file = path.join(dir, "database.sqlite");
  let app;
  let db;
  try {
    app = await buildApp({ dbPath: file });
    await app.ready();
    db = new DatabaseSync(file);
    db.exec(
      "INSERT INTO users VALUES ('u','master','Master','hash',1); INSERT INTO campaigns VALUES ('c','Original','','',0); INSERT INTO sessions VALUES ('session','u',9999999999999); INSERT INTO invites VALUES ('invite','c',9999999999999,0)",
    );
    db.prepare("INSERT INTO characters VALUES ('hero','c','u',?,7)").run(
      JSON.stringify({ name: "Hero", hp: 17, dmNote: "Secret" }),
    );
    db.exec("INSERT INTO notes VALUES ('hero','u','Private note',4)");
    const manual = createBackup(db, file);
    assert.deepEqual(inspectBackup(manual), {
      version: 4,
      campaigns: 1,
      characters: 1,
    });
    assert.throws(() => restoreBackup(manual, file), /остановите сервер/);
    for (let i = 0; i < 12; i++) createBackup(db, file, "auto");
    assert.equal(
      listBackups(file).filter((b) => b.name.startsWith("auto-")).length,
      10,
    );
    assert.equal(
      listBackups(file).filter((b) => b.name.startsWith("manual-")).length,
      1,
    );
    assert.equal(automaticBackup(db, file), undefined);
    db.exec(
      "UPDATE campaigns SET name='Changed'; UPDATE characters SET data='{}'; UPDATE notes SET text='Changed'",
    );
    db.close();
    db = undefined;
    await app.close();
    app = undefined;
    const result = restoreBackup(manual, file);
    assert.ok(result.safety);
    db = new DatabaseSync(file);
    assert.equal(
      db.prepare("SELECT name FROM campaigns").get().name,
      "Original",
    );
    assert.equal(db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM invites").get().n, 0);
    assert.deepEqual(
      JSON.parse(db.prepare("SELECT data FROM characters").get().data),
      { name: "Hero", hp: 17, dmNote: "Secret" },
    );
    assert.equal(
      db.prepare("SELECT text FROM notes").get().text,
      "Private note",
    );
    const safety = new DatabaseSync(result.safety, { readOnly: true });
    try {
      assert.equal(
        safety.prepare("SELECT name FROM campaigns").get().name,
        "Changed",
      );
    } finally {
      safety.close();
    }
    db.close();
    db = undefined;
    app = await buildApp({ dbPath: file });
    await app.ready();
    assert.equal((await app.inject({ url: "/api/session" })).statusCode, 200);
  } finally {
    db?.close();
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("invalid and incompatible backups leave current data untouched", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ipl-backup-"));
  const file = path.join(dir, "database.sqlite");
  try {
    const app = await buildApp({ dbPath: file });
    await app.close();
    const invalid = path.join(dir, "invalid.sqlite");
    writeFileSync(invalid, "not a database");
    assert.throws(() => restoreBackup(invalid, file));
    const future = path.join(dir, "future.sqlite");
    const db = new DatabaseSync(future);
    db.exec("PRAGMA user_version=99");
    db.close();
    assert.throws(() => restoreBackup(future, file), /версии 3/);
    assert.deepEqual(inspectBackup(file), {
      version: 4,
      campaigns: 0,
      characters: 0,
    });
    const reopened = await buildApp({ dbPath: file });
    await reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("schema 3 backup restores and migrates without changing existing data", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ipl-migration-"));
  const file = path.join(dir, "database.sqlite");
  let app;
  let db;
  try {
    app = await buildApp({ dbPath: file });
    await app.close();
    app = undefined;
    db = new DatabaseSync(file);
    db.exec(
      "INSERT INTO campaigns VALUES ('legacy','Legacy','','',2); DROP TABLE character_options; PRAGMA user_version=3",
    );
    const old = createBackup(db, file);
    assert.equal(inspectBackup(old).version, 3);
    db.close();
    db = undefined;
    app = await buildApp({ dbPath: file });
    await app.close();
    app = undefined;
    assert.equal(inspectBackup(file).version, 4);
    assert.ok(
      listBackups(file).some((b) => b.name.startsWith("before-update-")),
    );
    db = new DatabaseSync(file);
    db.prepare(
      "INSERT INTO character_options VALUES ('legacy','custom',?)",
    ).run(JSON.stringify({ name: "Custom" }));
    const current = createBackup(db, file);
    db.close();
    db = undefined;
    restoreBackup(current, file);
    db = new DatabaseSync(file);
    assert.equal(
      JSON.parse(db.prepare("SELECT data FROM character_options").get().data)
        .name,
      "Custom",
    );
    db.close();
    db = undefined;
    restoreBackup(old, file);
    app = await buildApp({ dbPath: file });
    await app.close();
    app = undefined;
    db = new DatabaseSync(file);
    assert.equal(
      db.prepare("SELECT name FROM campaigns WHERE id='legacy'").get().name,
      "Legacy",
    );
    assert.equal(
      db.prepare("SELECT count(*) n FROM character_options").get().n,
      0,
    );
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 4);
  } finally {
    db?.close();
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
