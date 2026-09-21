import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../server/app.mjs";
import { once } from "node:events";

const origin = "http://127.0.0.1:5173";
export async function fixture(dbPath = ":memory:") {
  const app = await buildApp({ dbPath });
  await app.ready();
  const call = (url, body, cookie) =>
    app.inject({
      url,
      method: body === undefined ? "GET" : "POST",
      headers: { origin, "x-ipl-request": "1", ...(cookie ? { cookie } : {}) },
      payload: body,
    });
  const setup = await call("/api/setup", {
    login: "master",
    name: "Мастер",
    password: "test-password-123",
  });
  assert.equal(setup.statusCode, 200, setup.body);
  const dm = setup.headers["set-cookie"].split(";")[0];
  const campaign = (
    await call(
      "/api/campaigns",
      { name: "Проверочная кампания", description: "Только тестовые данные" },
      dm,
    )
  ).json().id;
  const invitation = (
    await call(`/api/campaigns/${campaign}/invites`, {}, dm)
  ).json().invitation;
  const registered = await call("/api/auth/register", {
    login: "player",
    name: "Игрок",
    password: "test-password-456",
    invitation,
  });
  assert.equal(registered.statusCode, 200, registered.body);
  const player = registered.headers["set-cookie"].split(";")[0];
  const draft = {
    id: randomUUID(),
    name: "Ариа",
    species: "Эльф",
    cls: "Воин",
    background: "Страж",
    bio: "В поисках маяка",
    stats: [15, 14, 13, 12, 10, 8],
    status: "draft",
  };
  const action = (who, type, id, version, data, extra = {}) =>
    call(
      `/api/campaigns/${campaign}/action`,
      { operationId: randomUUID(), type, id, version, data, ...extra },
      who,
    );
  assert.equal(
    (await action(player, "draft", undefined, undefined, draft)).statusCode,
    200,
  );
  const read = (who) => call(`/api/campaigns/${campaign}`, undefined, who);
  return { app, call, dm, player, campaign, draft, action, read, invitation };
}

test("Первичная настройка, сессии, CSRF и отсутствие стандартного аккаунта", async () => {
  const app = await buildApp({ dbPath: ":memory:" });
  try {
    assert.equal((await app.inject("/api/session")).json().setupRequired, true);
    assert.equal((await app.inject("/api/campaigns")).statusCode, 401);
    const payload = {
      login: "master",
      name: "Мастер",
      password: "long-test-password",
    };
    assert.equal(
      (await app.inject({ method: "POST", url: "/api/setup", payload }))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload,
          headers: { origin, "x-ipl-request": "1" },
          remoteAddress: "192.0.2.1",
        })
      ).statusCode,
      403,
    );
    const r = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload,
      headers: { origin, "x-ipl-request": "1" },
    });
    assert.equal(r.statusCode, 200);
    assert.match(r.headers["set-cookie"], /HttpOnly/);
    assert.match(r.headers["set-cookie"], /SameSite=Strict/);
    assert.equal(r.json().user.password, undefined);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/setup",
          payload,
          headers: { origin, "x-ipl-request": "1" },
        })
      ).statusCode,
      409,
    );
  } finally {
    await app.close();
  }
});
test("Логин, неверный пароль и выход с отзывом сессии", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.call("/api/auth/login", { login: "player", password: "wrong" }))
        .statusCode,
      401,
    );
    const login = await f.call("/api/auth/login", {
      login: "player",
      password: "test-password-456",
    });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers["set-cookie"].split(";")[0];
    await f.call("/api/auth/logout", {}, cookie);
    assert.equal(
      (await f.call("/api/campaigns", undefined, cookie)).statusCode,
      401,
    );
  } finally {
    await f.app.close();
  }
});
test("Игрок не меняет здоровье, роль, кампанию и утверждённый лист", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.action(f.player, "character", f.draft.id, 0, { hp: 1 }))
        .statusCode,
      403,
    );
    assert.equal(
      (await f.call("/api/campaigns", { name: "Чужая" }, f.player)).statusCode,
      403,
    );
    assert.equal(
      (await f.call(`/api/campaigns/${f.campaign}/invites`, {}, f.player))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 0, {
          ...f.draft,
          status: "approved",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 0, {
          ...f.draft,
          status: "submitted",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(
          f.dm,
          "character",
          f.draft.id,
          1,
          { status: "approved" },
          { title: "Утверждён" },
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.action(f.player, "draft", undefined, 2, f.draft)).statusCode,
      403,
    );
    assert.equal(
      (await f.action(f.dm, "character", f.draft.id, 2, { owner: "Подмена" }))
        .statusCode,
      400,
    );
  } finally {
    await f.app.close();
  }
});
test("Скрытые свойства, мастерские и личные заметки не утекают в API", async () => {
  const f = await fixture();
  try {
    const items = [
      {
        id: randomUUID(),
        name: "Компас",
        description: "Латунный",
        type: "Предмет",
        secret: "СЕКРЕТ_ПРЕДМЕТА",
        revealed: false,
      },
    ];
    await f.action(f.dm, "character", f.draft.id, 0, { items });
    await f.action(f.dm, "note", f.draft.id, 1, {
      scope: "dm",
      text: "СЕКРЕТ_МАСТЕРА",
    });
    await f.action(f.player, "note", f.draft.id, 0, {
      scope: "personal",
      text: "СЕКРЕТ_ИГРОКА",
    });
    const p = await f.read(f.player),
      m = await f.read(f.dm);
    assert.ok(!p.body.includes("СЕКРЕТ_ПРЕДМЕТА"));
    assert.ok(!p.body.includes("СЕКРЕТ_МАСТЕРА"));
    assert.ok(!m.body.includes("СЕКРЕТ_ИГРОКА"));
    assert.equal(p.json().events.length, 0);
    assert.equal(
      (
        await f.action(f.player, "note", f.draft.id, 2, {
          scope: "dm",
          text: "Подмена",
        })
      ).statusCode,
      403,
    );
    await f.action(f.dm, "character", f.draft.id, 2, {
      items: items.map((i) => ({ ...i, revealed: true })),
    });
    assert.ok((await f.read(f.player)).body.includes("СЕКРЕТ_ПРЕДМЕТА"));
  } finally {
    await f.app.close();
  }
});
test("Кампании и чужие персонажи изолированы, отзыв доступа немедленный", async () => {
  const f = await fixture();
  try {
    const other = (
      await f.call("/api/campaigns", { name: "Другая" }, f.dm)
    ).json().id;
    assert.equal(
      (await f.call(`/api/campaigns/${other}`, undefined, f.player)).statusCode,
      403,
    );
    const d = { ...f.draft, id: randomUUID(), name: "Секретный персонаж" };
    await f.action(f.dm, "draft", undefined, undefined, d);
    assert.ok(!(await f.read(f.player)).body.includes(d.id));
    assert.equal(
      (await f.action(f.player, "draft", undefined, 0, { ...d, name: "Взлом" }))
        .statusCode,
      404,
    );
    const members = (await f.read(f.dm)).json().members;
    const pid = members.find((m) => m.role === "player").id;
    await f.call(`/api/campaigns/${f.campaign}/revoke`, { userId: pid }, f.dm);
    assert.equal((await f.read(f.player)).statusCode, 403);
  } finally {
    await f.app.close();
  }
});
test("Приглашение одноразовое; неизвестное и отсутствующее не принимаются", async () => {
  const f = await fixture();
  try {
    const body = {
      login: "other",
      name: "Другой",
      password: "test-password-789",
    };
    assert.equal(
      (
        await f.call("/api/auth/register", {
          ...body,
          invitation: f.invitation,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.call("/api/auth/register", {
          ...body,
          invitation: "no-such-invite",
        })
      ).statusCode,
      400,
    );
    assert.equal((await f.call("/api/auth/register", body)).statusCode, 400);
  } finally {
    await f.app.close();
  }
});
test("Версии защищают от потери правок; повторы операций не дублируются", async () => {
  const f = await fixture();
  try {
    const body = {
      operationId: randomUUID(),
      type: "character",
      id: f.draft.id,
      version: 0,
      data: { hp: 7 },
      title: "Урон",
    };
    assert.equal(
      (await f.call(`/api/campaigns/${f.campaign}/action`, body, f.dm))
        .statusCode,
      200,
    );
    assert.equal(
      (await f.call(`/api/campaigns/${f.campaign}/action`, body, f.dm))
        .statusCode,
      200,
    );
    const s = (await f.read(f.dm)).json();
    assert.equal(s.events.length, 1);
    assert.equal(s.characters[0].hp, 7);
    assert.equal(
      (await f.action(f.dm, "character", f.draft.id, 0, { hp: 4 })).statusCode,
      409,
    );
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${f.campaign}/action`,
          { ...body, data: { hp: 2 } },
          f.dm,
        )
      ).statusCode,
      409,
    );
  } finally {
    await f.app.close();
  }
});
test("Отмена — отдельное событие; последующие правки блокируют старую отмену", async () => {
  const f = await fixture();
  try {
    const a = (
      await f.action(f.dm, "character", f.draft.id, 0, { hp: 7 })
    ).json();
    assert.equal(a.events[0].canUndo, true);
    const b = (
      await f.action(f.dm, "undo", a.events[0].id, undefined, {})
    ).json();
    assert.equal(b.characters[0].hp, 12);
    assert.equal(b.events.length, 2);
    assert.equal(
      (await f.action(f.dm, "undo", a.events[0].id, undefined, {})).statusCode,
      409,
    );
    const c = (
      await f.action(f.dm, "character", f.draft.id, 2, { hp: 8 })
    ).json();
    await f.action(f.player, "draft", undefined, 3, {
      ...f.draft,
      bio: "Новое",
    });
    assert.equal(
      (await f.action(f.dm, "undo", c.events[0].id, undefined, {})).statusCode,
      409,
    );
  } finally {
    await f.app.close();
  }
});
test("SQLite сохраняет кампанию, аккаунт и здоровье после перезапуска", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ipl-test-")),
    dbPath = path.join(dir, "db.sqlite");
  let f;
  try {
    f = await fixture(dbPath);
    await f.action(f.dm, "character", f.draft.id, 0, { hp: 6 });
    const ability = {
      id: randomUUID(),
      kind: "feature",
      name: "Память",
      description: "Проверка сохранения способности",
      source: "Тест",
      tags: [],
    };
    assert.equal(
      (await f.action(f.dm, "abilityLibrary", undefined, 0, ability))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", f.draft.id, 1, {
          abilities: [ability],
          concentration: {
            name: "Проверка концентрации",
            duration: "1 минута",
            note: "",
          },
        })
      ).statusCode,
      200,
    );
    await f.app.close();
    const next = await buildApp({ dbPath });
    try {
      const r = await next.inject({
        url: `/api/campaigns/${f.campaign}`,
        headers: { cookie: f.dm },
      });
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().characters[0].hp, 6);
      assert.deepEqual(r.json().abilityLibrary, [ability]);
      assert.deepEqual(r.json().characters[0].abilities, [ability]);
      assert.equal(
        r.json().characters[0].concentration.name,
        "Проверка концентрации",
      );
    } finally {
      await next.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("WebSocket требует сессию и правильный Origin, отправляет только уведомление", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.app.injectWS("/api/updates", { headers: { origin } }),
    );
    await assert.rejects(
      f.app.injectWS("/api/updates", {
        headers: { origin: "https://foreign.example", cookie: f.player },
      }),
    );
    const ws = await f.app.injectWS("/api/updates", {
      headers: { origin, cookie: f.player },
    });
    const changed = once(ws, "message");
    await f.action(f.dm, "character", f.draft.id, 0, { hp: 9 });
    const [message] = await changed;
    assert.deepEqual(JSON.parse(message.toString()), { type: "changed" });
    const closed = once(ws, "close");
    await f.call("/api/auth/logout", {}, f.player);
    await closed;
  } finally {
    await f.app.close();
  }
});
test("Ограничение попыток входа возвращает 429", async () => {
  const app = await buildApp({ dbPath: ":memory:" });
  try {
    for (let i = 0; i < 12; i++)
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: { origin, "x-ipl-request": "1" },
            payload: { login: "unknown", password: "invalid" },
          })
        ).statusCode,
        401,
      );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin, "x-ipl-request": "1" },
          payload: { login: "unknown", password: "invalid" },
        })
      ).statusCode,
      429,
    );
  } finally {
    await app.close();
  }
});
test("Заметки отклоняют устаревшую версию без потери данных", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (
        await f.action(f.player, "note", f.draft.id, 0, {
          scope: "personal",
          text: "Первая запись",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(f.player, "note", f.draft.id, 0, {
          scope: "personal",
          text: "Устаревшая запись",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.read(f.player)).json().characters[0].note,
      "Первая запись",
    );
  } finally {
    await f.app.close();
  }
});

test("Библиотека: права, конфликт, выдача независимой копии и изоляция кампаний", async () => {
  const f = await fixture();
  try {
    const item = {
      id: randomUUID(),
      name: "Меч рассвета",
      type: "Оружие",
      description: "Светлый клинок",
      secret: "Тайна клинка",
      revealed: false,
      tags: ["str"],
    };
    assert.equal(
      (await f.action(f.player, "library", undefined, 0, item)).statusCode,
      403,
    );
    const created = await f.action(f.dm, "library", undefined, 0, item);
    assert.equal(created.statusCode, 200, created.body);
    assert.deepEqual(created.json().library, [item]);
    assert.deepEqual((await f.read(f.player)).json().library, []);
    const other = (
      await f.call("/api/campaigns", { name: "Другая" }, f.dm)
    ).json().id;
    assert.deepEqual(
      (await f.call(`/api/campaigns/${other}`, undefined, f.dm)).json().library,
      [],
    );
    assert.equal(
      (
        await f.action(f.dm, "library", undefined, 0, {
          ...item,
          name: "Устаревшая версия",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.action(f.dm, "library", undefined, 1, {
          ...item,
          tags: ["invalid"],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", f.draft.id, 0, {
          items: [{ ...item, id: randomUUID() }],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(f.dm, "library", undefined, 1, {
          ...item,
          name: "Новая версия шаблона",
        })
      ).statusCode,
      200,
    );
    const player = (await f.read(f.player)).json();
    assert.equal(player.characters[0].items[0].name, item.name);
    assert.equal(player.characters[0].items[0].secret, undefined);
    assert.equal(
      (await f.read(f.dm)).json().library[0].name,
      "Новая версия шаблона",
    );
  } finally {
    await f.app.close();
  }
});

test("Способности: права, версии, валидация и независимость шаблонов", async () => {
  const f = await fixture();
  try {
    const spell = {
      id: randomUUID(),
      kind: "spell",
      name: "Свет маяка",
      description: "Домашнее заклинание для проверки.",
      source: "Тест",
      tags: ["int"],
      spell: {
        level: 1,
        castingTime: "Действие",
        range: "30 футов",
        duration: "1 минута",
        components: "В, С",
        concentration: true,
        ritual: false,
      },
    };
    assert.equal(
      (await f.action(f.player, "abilityLibrary", undefined, 0, spell))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await f.action(f.dm, "abilityLibrary", undefined, 0, {
          ...spell,
          spell: { ...spell.spell, level: 10 },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "abilityLibrary", undefined, 0, {
          ...spell,
          tags: ["invalid"],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "abilityLibrary", undefined, 0, {
          ...spell,
          kind: "feature",
        })
      ).statusCode,
      400,
    );
    const created = await f.action(f.dm, "abilityLibrary", undefined, 0, spell);
    assert.equal(created.statusCode, 200, created.body);
    assert.deepEqual(created.json().abilityLibrary, [spell]);
    assert.deepEqual((await f.read(f.player)).json().abilityLibrary, []);
    assert.equal(
      (
        await f.action(f.dm, "abilityLibrary", undefined, 0, {
          ...spell,
          name: "Устаревшая",
        })
      ).statusCode,
      409,
    );
    const other = (
      await f.call("/api/campaigns", { name: "Без заклинаний" }, f.dm)
    ).json().id;
    assert.deepEqual(
      (await f.call(`/api/campaigns/${other}`, undefined, f.dm)).json()
        .abilityLibrary,
      [],
    );
    const feature = {
      id: randomUUID(),
      kind: "feature",
      name: "Морская память",
      description: "Помнит путь домой",
      source: "Домашнее правило",
      tags: ["wis"],
    };
    assert.equal(
      (await f.action(f.dm, "abilityLibrary", undefined, 1, feature))
        .statusCode,
      200,
    );
    const issued = [
      { ...spell, id: randomUUID() },
      { ...feature, id: randomUUID() },
    ];
    assert.equal(
      (
        await f.action(f.player, "character", f.draft.id, 0, {
          abilities: issued,
        })
      ).statusCode,
      403,
    );
    const operationId = randomUUID();
    const first = await f.action(
      f.dm,
      "character",
      f.draft.id,
      0,
      { abilities: issued },
      { operationId, title: "Способность выдана" },
    );
    const retry = await f.action(
      f.dm,
      "character",
      f.draft.id,
      0,
      { abilities: issued },
      { operationId, title: "Способность выдана" },
    );
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().events.length, 1);
    assert.equal(retry.json().characters[0].abilities.length, 2);
    assert.equal(
      (
        await f.action(f.dm, "abilityLibrary", undefined, 2, {
          ...spell,
          name: "Новый шаблон",
        })
      ).statusCode,
      200,
    );
    const view = (await f.read(f.player)).json();
    assert.deepEqual(view.characters[0].abilities, issued);
    assert.equal(view.characters[0].items.length, 0);
    const removed = await f.action(
      f.dm,
      "character",
      f.draft.id,
      1,
      { abilities: [] },
      { title: "Способности убраны" },
    );
    assert.equal(removed.statusCode, 200, removed.body);
    const undone = await f.action(
      f.dm,
      "undo",
      removed.json().events[0].id,
      undefined,
      {},
    );
    assert.equal(undone.statusCode, 200, undone.body);
    assert.deepEqual(undone.json().characters[0].abilities, issued);
    assert.deepEqual(
      (await f.read(f.player)).json().characters[0].abilities,
      issued,
    );
  } finally {
    await f.app.close();
  }
});

test("Инвентарь: количество, настройка, заряды, права и отмена", async () => {
  const f = await fixture();
  try {
    const item = {
      id: randomUUID(),
      name: "Посох",
      type: "Снаряжение",
      description: "Проверка",
      revealed: false,
      secret: "Тайна",
      quantity: 1,
      equipped: true,
      requiresAttunement: true,
      attuned: true,
      maxCharges: 5,
      charges: 3,
    };
    assert.equal(
      (await f.action(f.player, "character", f.draft.id, 0, { items: [item] }))
        .statusCode,
      403,
    );
    for (const patch of [
      { quantity: 0 },
      { quantity: 1.5 },
      { quantity: 2 },
      { charges: -1 },
      { charges: 6 },
      { maxCharges: 0 },
      { requiresAttunement: false },
    ]) {
      assert.equal(
        (
          await f.action(f.dm, "character", f.draft.id, 0, {
            items: [{ ...item, ...patch }],
          })
        ).statusCode,
        400,
      );
    }
    const saved = await f.action(f.dm, "character", f.draft.id, 0, {
      items: [item],
    });
    assert.equal(saved.statusCode, 200, saved.body);
    const playerItem = (await f.read(f.player)).json().characters[0].items[0];
    assert.equal(playerItem.charges, 3);
    assert.equal(playerItem.equipped, true);
    assert.equal(playerItem.attuned, true);
    assert.equal(playerItem.secret, undefined);
    const spent = await f.action(f.dm, "character", f.draft.id, 1, {
      items: [{ ...item, charges: 0, equipped: false, attuned: false }],
    });
    assert.equal(spent.statusCode, 200, spent.body);
    assert.equal(
      (await f.action(f.dm, "character", f.draft.id, 1, { items: [item] }))
        .statusCode,
      409,
    );
    const undo = await f.action(
      f.dm,
      "undo",
      spent.json().events[0].id,
      undefined,
      {},
    );
    assert.equal(undo.statusCode, 200, undo.body);
    assert.deepEqual(undo.json().characters[0].items, [item]);
    const stack = {
      id: randomUUID(),
      name: "Зелье",
      type: "Расходуемое",
      description: "Стопка",
      revealed: true,
      quantity: 5,
    };
    const stacked = await f.action(f.dm, "character", f.draft.id, 3, {
      items: [item, stack],
    });
    assert.equal(stacked.statusCode, 200, stacked.body);
    const split = [
      { ...stack, quantity: 4 },
      { ...stack, id: randomUUID(), quantity: 1 },
    ];
    const operationId = randomUUID();
    for (let n = 0; n < 2; n++) {
      const result = await f.action(
        f.dm,
        "character",
        f.draft.id,
        4,
        { items: [item, ...split] },
        { operationId },
      );
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(result.json().characters[0].items.length, 3);
      assert.equal(
        result
          .json()
          .characters[0].items.reduce((sum, i) => sum + (i.quantity ?? 1), 0),
        6,
      );
    }
  } finally {
    await f.app.close();
  }
});

test("Параметры: серверный пересчёт, права, валидация и отмена", async () => {
  const f = await fixture();
  try {
    const data = {
      level: 5,
      stats: [14, 16, 12, 10, 18, 8],
      skillRanks: { athletics: 1, perception: 2 },
      saveProficiencies: ["dex", "wis"],
      rulesNote: "Проверено мастером",
      maxHp: 30,
      hp: 12,
      ac: 16,
    };
    assert.equal(
      (await f.action(f.player, "character", f.draft.id, 0, data)).statusCode,
      403,
    );
    for (const patch of [
      { level: 21 },
      { stats: [0, 10, 10, 10, 10, 10] },
      { stats: [10, 10] },
      { skillRanks: { unknown: 1 } },
      { skillRanks: { athletics: 3 } },
      { saveProficiencies: ["str", "str"] },
      { derived: { proficiency: 99 } },
      { maxHp: 1 },
    ]) {
      assert.equal(
        (await f.action(f.dm, "character", f.draft.id, 0, patch)).statusCode,
        400,
      );
    }
    const changed = await f.action(f.dm, "character", f.draft.id, 0, data);
    assert.equal(changed.statusCode, 200, changed.body);
    const c = changed.json().characters[0];
    assert.equal(c.derived.proficiency, 3);
    assert.equal(c.derived.passivePerception, 20);
    assert.equal(c.hp, 12);
    assert.equal(c.rulesConfigured, true);
    assert.equal(
      (await f.read(f.player)).json().characters[0].derived.passivePerception,
      20,
    );
    assert.equal(
      (await f.action(f.dm, "character", f.draft.id, 0, data)).statusCode,
      409,
    );
    const undone = await f.action(
      f.dm,
      "undo",
      changed.json().events[0].id,
      undefined,
      {},
    );
    assert.equal(undone.statusCode, 200, undone.body);
    assert.equal(undone.json().characters[0].derived.proficiency, 2);
    assert.equal(undone.json().characters[0].derived.passivePerception, 10);
  } finally {
    await f.app.close();
  }
});

test("Старт SRD: выборы, пересчёт без дублей, отправка и утверждение", async () => {
  const f = await fixture();
  try {
    const draft = {
      id: randomUUID(),
      name: "Борин",
      species: "Дварф",
      cls: "Воин",
      background: "Солдат",
      bio: "",
      stats: [15, 14, 13, 12, 10, 8],
      status: "draft",
      creation: {
        pack: "srd-5.2.1-dwarf-fighter-soldier-1",
        boosts: [2, 0, 1],
        skills: ["perception", "survival"],
        languages: ["Дварфский", "Орочий"],
        gamingSet: "Игральные кости",
        weapons: ["Длинный меч", "Короткий лук", "Копьё"],
      },
    };
    for (const data of [
      { ...draft, species: "Эльф" },
      { ...draft, creation: { ...draft.creation, boosts: [2, 2, 2] } },
      {
        ...draft,
        creation: { ...draft.creation, skills: ["perception", "perception"] },
      },
      {
        ...draft,
        creation: { ...draft.creation, languages: ["Дварфский", "Дварфский"] },
      },
      {
        ...draft,
        creation: { ...draft.creation, weapons: ["Копьё", "Копьё", "Копьё"] },
      },
      { ...draft, creation: { ...draft.creation, pack: "unknown" } },
      { ...draft, stats: [17, 14, 14, 12, 10, 8] },
    ])
      assert.equal(
        (await f.action(f.player, "draft", undefined, undefined, data))
          .statusCode,
        400,
      );
    const created = await f.action(f.player, "draft", undefined, undefined, {
      ...draft,
      hp: 999,
      skillRanks: { arcana: 2 },
      items: [{ name: "Подмена" }],
    });
    assert.equal(created.statusCode, 200, created.body);
    const c = created.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(c.stats, [17, 14, 14, 12, 10, 8]);
    assert.deepEqual(c.baseStats, draft.stats);
    assert.equal(c.hp, 13);
    assert.equal(c.maxHp, 13);
    assert.equal(c.ac, 12);
    assert.deepEqual(c.saveProficiencies, ["str", "con"]);
    assert.deepEqual(c.skillRanks, {
      athletics: 1,
      intimidation: 1,
      perception: 1,
      survival: 1,
    });
    assert.equal(c.items.length, 1);
    assert.equal(c.items[0].quantity, 205);
    assert.equal(c.abilities.length, 8);
    const resaved = await f.action(f.player, "draft", undefined, 0, draft);
    assert.equal(resaved.statusCode, 200, resaved.body);
    const repeated = resaved.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(repeated.stats, c.stats);
    assert.deepEqual(repeated.items, c.items);
    assert.deepEqual(repeated.abilities, c.abilities);
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 1, {
          ...draft,
          creation: undefined,
        })
      ).statusCode,
      409,
    );
    const submitted = await f.action(f.player, "draft", undefined, 1, {
      ...draft,
      status: "submitted",
      creation: { ...draft.creation, boosts: [1, 1, 1] },
    });
    assert.equal(submitted.statusCode, 200, submitted.body);
    assert.deepEqual(
      submitted.json().characters.find((c) => c.id === draft.id).stats,
      [16, 15, 14, 12, 10, 8],
    );
    assert.equal(
      (await f.action(f.player, "draft", undefined, 2, draft)).statusCode,
      403,
    );
    const approved = await f.action(f.dm, "character", draft.id, 2, {
      status: "approved",
    });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(
      approved.json().characters.find((c) => c.id === draft.id).status,
      "approved",
    );
    assert.equal(
      (await f.action(f.player, "draft", undefined, 3, draft)).statusCode,
      403,
    );
  } finally {
    await f.app.close();
  }
});

test("Перенос и архив библиотек: права, атомарность, новые ID и независимость инвентаря", async () => {
  const f = await fixture();
  try {
    const item = {
      id: randomUUID(),
      name: "Личный амулет",
      type: "Чудесный предмет",
      description: "Амулет",
      secret: "Тайна",
      revealed: false,
    };
    const ability = {
      id: randomUUID(),
      kind: "feature",
      name: "Свойство",
      description: "Текст",
      source: "Домашнее",
      tags: [],
    };
    assert.equal(
      (await f.action(f.dm, "library", undefined, 0, item)).statusCode,
      200,
    );
    assert.equal(
      (await f.action(f.dm, "abilityLibrary", undefined, 1, ability))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", f.draft.id, 0, {
          items: [{ ...item, id: randomUUID() }],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${f.campaign}/library-export`,
          undefined,
          f.player,
        )
      ).statusCode,
      403,
    );
    const data = (
      await f.call(
        `/api/campaigns/${f.campaign}/library-export`,
        undefined,
        f.dm,
      )
    ).json();
    assert.equal(data.items.find((i) => i.id === item.id).secret, "Тайна");
    assert.equal(data.characters, undefined);
    const arch = { kind: "item", id: item.id, archived: true };
    assert.equal(
      (await f.action(f.player, "libraryArchive", undefined, 2, arch))
        .statusCode,
      403,
    );
    assert.equal(
      (await f.action(f.dm, "libraryArchive", undefined, 2, arch)).statusCode,
      200,
    );
    assert.equal(
      (await f.action(f.dm, "library", undefined, 3, item)).statusCode,
      409,
    );
    assert.equal(
      (await f.read(f.dm)).json().characters[0].items[0].name,
      item.name,
    );
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${f.campaign}/library-export`,
          undefined,
          f.dm,
        )
      )
        .json()
        .items.some((i) => i.id === item.id),
      false,
    );
    assert.equal(
      (
        await f.action(f.dm, "libraryArchive", undefined, 2, {
          ...arch,
          archived: false,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.action(f.dm, "libraryArchive", undefined, 3, {
          ...arch,
          archived: false,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.action(f.dm, "libraryArchive", undefined, 4, {
          kind: "ability",
          id: ability.id,
          archived: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${f.campaign}/library-export`,
          undefined,
          f.dm,
        )
      ).json().abilities.length,
      0,
    );
    assert.equal(
      (
        await f.action(f.dm, "libraryArchive", undefined, 5, {
          kind: "item",
          id: "sword",
          archived: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${f.campaign}/library-export`,
          undefined,
          f.dm,
        )
      )
        .json()
        .items.some((i) => i.id === "sword"),
      false,
    );
    const other = (
      await f.call("/api/campaigns", { name: "Получатель" }, f.dm)
    ).json().id;
    const importCall = (body, who = f.dm) =>
      f.call(`/api/campaigns/${other}/action`, body, who);
    const payload = {
      operationId: randomUUID(),
      type: "libraryImport",
      version: 0,
      data,
    };
    assert.equal(
      (await f.action(f.player, "libraryImport", undefined, 6, data))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await importCall({
          ...payload,
          data: { ...data, abilities: [{ ...ability, kind: "invalid" }] },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await f.call(`/api/campaigns/${other}`, undefined, f.dm)).json().library
        .length,
      0,
    );
    for (let n = 0; n < 2; n++) {
      const r = await importCall(payload);
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(r.json().library.length, data.items.length);
      assert.equal(r.json().abilityLibrary.length, 1);
      assert.equal(
        r.json().library.some((i) => data.items.some((old) => old.id === i.id)),
        false,
      );
    }
    assert.equal(
      (
        await f.call(
          `/api/campaigns/${other}/action`,
          {
            operationId: randomUUID(),
            type: "libraryArchive",
            version: 1,
            data: arch,
          },
          f.dm,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (await importCall({ ...payload, operationId: randomUUID() })).statusCode,
      409,
    );
    assert.deepEqual((await f.read(f.player)).json().libraryArchive, {
      items: [],
      abilities: [],
    });
  } finally {
    await f.app.close();
  }
});

test("Ресурсы: права, границы, отдых, конфликт и отмена", async () => {
  const f = await fixture();
  try {
    const id = f.draft.id;
    const resources = [
      {
        id: randomUUID(),
        name: "Ячейки",
        kind: "slot",
        level: 1,
        max: 3,
        current: 2,
        shortRest: 0,
        longRest: 3,
      },
      {
        id: randomUUID(),
        name: "Способность",
        kind: "feature",
        max: 3,
        current: 0,
        shortRest: 1,
        longRest: 3,
      },
    ];
    assert.equal(
      (await f.action(f.player, "character", id, 0, { resources })).statusCode,
      403,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", id, 0, {
          resources: [{ ...resources[0], current: 4 }],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", id, 0, {
          resources: [resources[0], resources[0]],
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "character", id, 0, {
          resources: [{ ...resources[0], level: 0 }],
        })
      ).statusCode,
      400,
    );
    let r = await f.action(f.dm, "character", id, 0, { resources });
    assert.equal(r.statusCode, 200, r.body);
    const hp = r.json().characters[0].hp;
    const adjust = { action: "adjust", resourceId: resources[0].id, delta: -1 };
    assert.equal(
      (await f.action(f.player, "resource", id, 1, adjust)).statusCode,
      403,
    );
    r = await f.action(f.dm, "resource", id, 1, adjust);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().characters[0].resources[0].current, 1);
    assert.equal(
      (await f.action(f.dm, "resource", id, 1, adjust)).statusCode,
      409,
    );
    assert.equal(
      (
        await f.action(f.dm, "resource", id, 2, {
          ...adjust,
          resourceId: resources[1].id,
        })
      ).statusCode,
      400,
    );
    r = await f.action(f.dm, "resource", id, 2, {
      action: "rest",
      rest: "short",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      r.json().characters[0].resources.map((v) => v.current),
      [1, 1],
    );
    const operationId = randomUUID();
    for (let n = 0; n < 2; n++) {
      r = await f.action(
        f.dm,
        "resource",
        id,
        3,
        { action: "rest", rest: "long" },
        { operationId },
      );
      assert.equal(r.statusCode, 200, r.body);
      assert.deepEqual(
        r.json().characters[0].resources.map((v) => v.current),
        [3, 3],
      );
      assert.equal(r.json().characters[0].hp, hp);
    }
    assert.equal(
      (
        await f.action(f.dm, "resource", id, 4, {
          action: "rest",
          rest: "long",
        })
      ).statusCode,
      400,
    );
    const event = r.json().events[0];
    r = await f.action(f.dm, "undo", event.id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      r.json().characters[0].resources.map((v) => v.current),
      [1, 1],
    );
    const player = (await f.read(f.player)).json().characters[0];
    assert.deepEqual(
      player.resources.map((v) => v.current),
      [1, 1],
    );
  } finally {
    await f.app.close();
  }
});

test("Поправки: права, валидация, пересчёт игроку и отмена", async () => {
  const f = await fixture();
  try {
    const adjustments = [
      {
        id: randomUUID(),
        source: "Защитное кольцо",
        target: "ac",
        value: 2,
        enabled: true,
      },
    ];
    const id = f.draft.id;
    assert.equal(
      (await f.action(f.player, "character", id, 0, { adjustments }))
        .statusCode,
      403,
    );
    for (const patch of [
      { value: 0 },
      { value: 31 },
      { value: 1.5 },
      { target: "hp" },
      { source: " " },
    ])
      assert.equal(
        (
          await f.action(f.dm, "character", id, 0, {
            adjustments: [{ ...adjustments[0], ...patch }],
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (
        await f.action(f.dm, "character", id, 0, {
          adjustments: [adjustments[0], adjustments[0]],
        })
      ).statusCode,
      400,
    );
    let r = await f.action(f.dm, "character", id, 0, { adjustments });
    assert.equal(r.statusCode, 200, r.body);
    const before = r.json().characters[0];
    assert.equal(before.derived.ac, before.ac + 2);
    assert.equal(
      (await f.read(f.player)).json().characters[0].derived.ac,
      before.ac + 2,
    );
    assert.equal(
      (await f.action(f.dm, "character", id, 0, { adjustments: [] }))
        .statusCode,
      409,
    );
    r = await f.action(f.dm, "character", id, 1, {
      adjustments: [{ ...adjustments[0], enabled: false }],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().characters[0].derived.ac, before.ac);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().characters[0].derived.ac, before.ac + 2);
  } finally {
    await f.app.close();
  }
});

test("Эффекты предметов: шаблоны, права, экипировка, секреты и отмена", async () => {
  const f = await fixture();
  try {
    const item = {
      id: randomUUID(),
      name: "Кольцо",
      type: "Чудесный предмет",
      description: "Открытое описание",
      secret: "Тайна",
      revealed: false,
      requiresAttunement: true,
      effects: [{ target: "ac", value: 2 }],
    };
    assert.equal(
      (await f.action(f.dm, "library", undefined, 0, item)).statusCode,
      200,
    );
    const stored = (await f.read(f.dm))
      .json()
      .library.find((i) => i.id === item.id);
    assert.deepEqual(stored.effects, item.effects);
    for (const effects of [
      [{ target: "hp", value: 2 }],
      [{ target: "ac", value: 0 }],
      [{ target: "ac", value: 31 }],
      [...item.effects, ...item.effects],
    ])
      assert.equal(
        (
          await f.action(f.dm, "character", f.draft.id, 0, {
            items: [{ ...item, effects }],
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (await f.action(f.player, "character", f.draft.id, 0, { items: [item] }))
        .statusCode,
      403,
    );
    let r = await f.action(f.dm, "character", f.draft.id, 0, {
      items: [{ ...item, equipped: true }],
    });
    assert.equal(r.statusCode, 200, r.body);
    const base = r.json().characters[0].ac;
    assert.equal(r.json().characters[0].derived.ac, base);
    r = await f.action(f.dm, "character", f.draft.id, 1, {
      items: [{ ...item, equipped: true, attuned: true }],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().characters[0].derived.ac, base + 2);
    const player = (await f.read(f.player)).json().characters[0];
    assert.equal(player.items[0].secret, undefined);
    assert.equal(player.derived.ac, base + 2);
    assert.equal(JSON.stringify(player.derived).includes("Тайна"), false);
    r = await f.action(f.dm, "character", f.draft.id, 2, {
      items: [{ ...item, equipped: false, attuned: true }],
    });
    assert.equal(r.json().characters[0].derived.ac, base);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.json().characters[0].derived.ac, base + 2);
    assert.equal(
      (
        await f.action(f.dm, "library", undefined, 1, {
          ...item,
          effects: [{ target: "ac", value: 5 }],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.read(f.dm)).json().characters[0].derived.ac,
      base + 2,
    );
  } finally {
    await f.app.close();
  }
});

test("Состояния: права, валидация, концентрация, конфликт и отмена", async () => {
  const f = await fixture();
  try {
    const id = f.draft.id;
    const conditions = [
      {
        id: randomUUID(),
        name: "Отравлен",
        source: "Ловушка",
        duration: "До конца хода",
        note: "Проверяет мастер",
      },
    ];
    const concentration = {
      name: "Защитное заклинание",
      duration: "1 минута",
      note: "Следить за уроном",
    };
    assert.equal(
      (
        await f.action(f.player, "character", id, 0, {
          conditions,
          concentration,
        })
      ).statusCode,
      403,
    );
    for (const invalid of [
      { conditions: [{ ...conditions[0], name: " " }] },
      { conditions: [conditions[0], conditions[0]] },
      { concentration: [concentration] },
      { concentration: { ...concentration, secret: "x" } },
      { conditions: [{ ...conditions[0], duration: "x".repeat(201) }] },
    ])
      assert.equal(
        (await f.action(f.dm, "character", id, 0, invalid)).statusCode,
        400,
      );
    let r = await f.action(f.dm, "character", id, 0, {
      conditions,
      concentration,
    });
    assert.equal(r.statusCode, 200, r.body);
    const before = r.json().characters[0];
    assert.deepEqual(
      (await f.read(f.player)).json().characters[0].conditions,
      conditions,
    );
    assert.deepEqual(
      (await f.read(f.player)).json().characters[0].concentration,
      concentration,
    );
    assert.equal(
      (await f.action(f.dm, "character", id, 0, { conditions: [] })).statusCode,
      409,
    );
    r = await f.action(f.dm, "character", id, 1, {
      conditions: [],
      concentration: null,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().characters[0].conditions, []);
    assert.equal(r.json().characters[0].concentration, null);
    assert.equal(r.json().characters[0].hp, before.hp);
    assert.deepEqual(r.json().characters[0].derived, before.derived);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().characters[0].conditions, conditions);
    assert.deepEqual(r.json().characters[0].concentration, concentration);
  } finally {
    await f.app.close();
  }
});

test("Вес предметов: валидация, права, неизвестный вес и отмена", async () => {
  const f = await fixture();
  try {
    const item = {
      id: randomUUID(),
      name: "Камни",
      type: "Снаряжение",
      description: "Тест",
      revealed: false,
      quantity: 3,
      weightGrams: 125,
    };
    for (const weightGrams of [-1, 0.5, 1000000001, null])
      assert.equal(
        (
          await f.action(f.dm, "character", f.draft.id, 0, {
            items: [{ ...item, weightGrams }],
          })
        ).statusCode,
        400,
      );
    assert.equal(
      (await f.action(f.player, "character", f.draft.id, 0, { items: [item] }))
        .statusCode,
      403,
    );
    let r = await f.action(f.dm, "character", f.draft.id, 0, { items: [item] });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().characters[0].derived.inventoryWeight, {
      knownGrams: 375,
      unknownItems: 0,
      unknownUnits: 0,
    });
    assert.equal(
      (await f.read(f.player)).json().characters[0].derived.inventoryWeight
        .knownGrams,
      375,
    );
    const { weightGrams, ...unknown } = item;
    r = await f.action(f.dm, "character", f.draft.id, 1, { items: [unknown] });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().characters[0].derived.inventoryWeight, {
      knownGrams: 0,
      unknownItems: 1,
      unknownUnits: 3,
    });
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      r.json().characters[0].derived.inventoryWeight.knownGrams,
      375,
    );
    assert.equal(
      (await f.action(f.dm, "library", undefined, 0, item)).statusCode,
      200,
    );
    assert.equal(
      (await f.read(f.dm)).json().library.find((i) => i.id === item.id)
        .weightGrams,
      125,
    );
  } finally {
    await f.app.close();
  }
});

test("Каталог персонажей: карточки, изоляция, архив, снимки и серверный выбор", async () => {
  const f = await fixture();
  try {
    const initial = (await f.read(f.player)).json();
    assert.equal(
      initial.characterOptions.filter((c) => c.kind === "species").length,
      10,
    );
    assert.equal(
      initial.characterOptions.filter((c) => c.kind === "class").length,
      12,
    );
    assert.equal(
      initial.characterOptions.filter((c) => c.kind === "background").length,
      16,
    );
    const card = {
      id: randomUUID(),
      kind: "species",
      name: "Лунный народ",
      summary: "Авторский вид",
      description: "Описание мастера",
      source: "Кампания",
      archived: false,
    };
    assert.equal(
      (await f.action(f.player, "characterOption", undefined, 0, card))
        .statusCode,
      403,
    );
    assert.equal(
      (await f.action(f.dm, "characterOption", undefined, 0, card)).statusCode,
      200,
    );
    assert.equal(
      (await f.action(f.dm, "characterOption", undefined, 0, card)).statusCode,
      409,
    );
    const choices = {
      species: card.id,
      class: "core2024-class-wizard",
      background: "core2024-background-sage",
    };
    const draft = {
      ...f.draft,
      originChoices: choices,
      species: "Подмена",
      cls: "Подмена",
      background: "Подмена",
    };
    let r = await f.action(f.player, "draft", undefined, 0, draft);
    assert.equal(r.statusCode, 200, r.body);
    let c = r.json().characters[0];
    assert.equal(c.species, card.name);
    assert.equal(c.cls, "Волшебник");
    assert.equal(c.background, "Мудрец");
    assert.equal(c.originCards.species.description, card.description);
    assert.equal(
      (
        await f.action(f.dm, "characterOption", undefined, 1, {
          ...card,
          description: "Изменено",
          archived: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await f.read(f.player)).json().characters[0].originCards.species
        .description,
      card.description,
    );
    r = await f.action(f.player, "draft", undefined, 1, draft); // already selected archive remains valid
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      r.json().characters[0].originCards.species.description,
      card.description,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, undefined, {
          ...draft,
          id: randomUUID(),
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 2, {
          ...draft,
          originChoices: { ...choices, class: card.id },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.dm, "characterOption", undefined, 2, {
          ...card,
          kind: "class",
        })
      ).statusCode,
      400,
    );
    const other = (
      await f.call("/api/campaigns", { name: "Другая", description: "" }, f.dm)
    ).json().id;
    const otherState = (
      await f.call(`/api/campaigns/${other}`, undefined, f.dm)
    ).json();
    assert.equal(
      otherState.characterOptions.some((c) => c.id === card.id),
      false,
    );
    assert.equal(
      (await f.call(`/api/campaigns/${other}`, undefined, f.player)).statusCode,
      403,
    );
  } finally {
    await f.app.close();
  }
});

test("First level: authoritative boosts, languages, resave, frozen rules and authorization", async () => {
  const f = await fixture();
  try {
    const originChoices = {
      species: "core2024-species-human",
      class: "core2024-class-wizard",
      background: "core2024-background-sage",
    };
    const firstLevel = {
      boosts: [0, 0, 1, 2, 0, 0],
      languages: ["Дварфский", "Эльфийский"],
    };
    const draft = { ...f.draft, id: randomUUID(), originChoices, firstLevel };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    let c = r.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(
      c.stats,
      draft.stats.map((v, i) => v + firstLevel.boosts[i]),
    );
    assert.deepEqual(c.baseStats, draft.stats);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      stats: c.baseStats,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      r.json().characters.find((c) => c.id === draft.id).stats,
      c.stats,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 1, {
          ...draft,
          firstLevel: { ...firstLevel, boosts: [2, 0, 1, 0, 0, 0] },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 1, {
          ...draft,
          firstLevel: { ...firstLevel, languages: ["Дварфский", "Дварфский"] },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, 1, {
          ...draft,
          firstLevel: undefined,
        })
      ).statusCode,
      409,
    );
    const card = r
      .json()
      .characterOptions.find((c) => c.id === originChoices.background);
    assert.equal(
      (
        await f.action(f.dm, "characterOption", undefined, 0, {
          ...card,
          boostAbilities: [0, 1, 5],
        })
      ).statusCode,
      200,
    );
    r = await f.action(f.player, "draft", undefined, 1, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      r.json().characters.find((c) => c.id === draft.id).stats,
      c.stats,
    );
    assert.equal(
      (await f.action(f.player, "draft", undefined, 2, draft)).statusCode,
      403,
    );
    assert.equal(
      (
        await f.action(f.player, "character", draft.id, 2, {
          stats: [20, 20, 20, 20, 20, 20],
        })
      ).statusCode,
      403,
    );
    r = await f.action(f.player, "draft", undefined, undefined, {
      ...draft,
      id: randomUUID(),
    });
    assert.equal(r.statusCode, 400); // new characters use updated rules
    assert.equal(
      (
        await f.action(f.dm, "characterOption", undefined, 1, {
          ...card,
          boostAbilities: [0, 0, 1],
        })
      ).statusCode,
      400,
    );
  } finally {
    await f.app.close();
  }
});

test("Background training: server snapshot, approval, master override and undo", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-human",
        class: "core2024-class-wizard",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
      },
      backgroundTraining: {
        skills: ["stealth"],
        tools: ["Fake"],
        source: "Fake",
      },
    };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (response) =>
      response.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(hero(r).backgroundTraining.skills, ["arcana", "history"]);
    assert.deepEqual(hero(r).backgroundTraining.tools, [
      "Принадлежности каллиграфа",
    ]);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.dm, "character", draft.id, 1, { status: "approved" });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (
        await f.action(f.player, "character", draft.id, 2, {
          backgroundTrainingEnabled: false,
        })
      ).statusCode,
      403,
    );
    r = await f.action(f.dm, "character", draft.id, 2, {
      backgroundTrainingEnabled: false,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.skills.find((s) => s.id === "arcana").rank, 0);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.skills.find((s) => s.id === "arcana").rank, 1);
  } finally {
    await f.app.close();
  }
});

test("Class training: forged source, frozen catalogue, master override and undo", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-human",
        class: "core2024-class-wizard",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
        classSkills: ["insight", "medicine"],
      },
      classTraining: { skills: ["athletics"], saves: ["str"], source: "Fake" },
    };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(hero(r).classTraining.saves, ["int", "wis"]);
    assert.deepEqual(hero(r).classTraining.skills, ["insight", "medicine"]);
    const card = r
      .json()
      .characterOptions.find((c) => c.id === draft.originChoices.class);
    r = await f.action(f.dm, "characterOption", undefined, 0, {
      ...card,
      classRules: {
        count: 2,
        skills: ["athletics", "stealth"],
        saves: ["str", "dex"],
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(hero(r).classTraining.saves, ["int", "wis"]);
    assert.equal(
      (
        await f.action(f.player, "draft", undefined, undefined, {
          ...draft,
          id: randomUUID(),
        })
      ).statusCode,
      400,
    );
    r = await f.action(f.dm, "character", draft.id, 1, { status: "approved" });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (
        await f.action(f.player, "character", draft.id, 2, {
          classTrainingEnabled: false,
        })
      ).statusCode,
      403,
    );
    r = await f.action(f.dm, "character", draft.id, 2, {
      classTrainingEnabled: false,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      hero(r).derived.saves.some((s) => s.trained),
      false,
    );
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      hero(r).derived.saves.find((s) => s.ability === "int").trained,
      true,
    );
  } finally {
    await f.app.close();
  }
});

test("Expertise: authoritative snapshot, approval and no player edits after submission", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-human",
        class: "core2024-class-rogue",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
        classSkills: ["acrobatics", "athletics", "deception", "insight"],
        expertise: ["arcana", "acrobatics"],
      },
      classTraining: { expertise: ["survival"] },
    };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(hero(r).classTraining.expertise, ["arcana", "acrobatics"]);
    assert.equal(hero(r).derived.skills.find((s) => s.id === "arcana").rank, 2);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      firstLevel: { ...draft.firstLevel, expertise: ["arcana", "survival"] },
    });
    assert.equal(r.statusCode, 400);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 1, draft);
    assert.equal(r.statusCode, 403);
    r = await f.action(f.dm, "character", draft.id, 1, { status: "approved" });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.dm, "character", draft.id, 2, {
      classTrainingEnabled: false,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.skills.find((s) => s.id === "arcana").rank, 1);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.skills.find((s) => s.id === "arcana").rank, 2);
  } finally {
    await f.app.close();
  }
});

test("Equipment grants: server authority, required tools and frozen snapshots", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-human",
        class: "core2024-class-bard",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
        classSkills: ["acrobatics", "athletics", "deception"],
        classTools: ["Лютня", "Лира", "Флейта"],
      },
      classTraining: {
        equipment: {
          weapons: ["Forged"],
          armor: ["Forged"],
          tools: ["Forged"],
        },
      },
    };
    let r = await f.action(f.player, "draft", undefined, undefined, {
      ...draft,
      firstLevel: { ...draft.firstLevel, classTools: ["Лютня"] },
    });
    assert.equal(r.statusCode, 400);
    r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === draft.id);
    assert.deepEqual(hero(r).classTraining.equipment, {
      weapons: ["Простое оружие"],
      armor: ["Лёгкие доспехи"],
      tools: ["Лютня", "Лира", "Флейта"],
    });
    const card = r
      .json()
      .characterOptions.find((c) => c.id === draft.originChoices.class);
    r = await f.action(f.dm, "characterOption", undefined, 0, {
      ...card,
      classRules: {
        ...card.classRules,
        equipment: { weapons: [], armor: [], tools: [] },
      },
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 0, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(hero(r).classTraining.equipment.tools, [
      "Лютня",
      "Лира",
      "Флейта",
    ]);
  } finally {
    await f.app.close();
  }
});

test("Initial assets: authoritative HP and inventory, resave, approval and master control", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-dwarf",
        class: "core2024-class-wizard",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
        calculateHp: true,
        classEquipment: "pack-a",
        backgroundGold: true,
      },
      hp: 999,
      maxHp: 999,
      items: [{ id: "forged", name: "Fake" }],
    };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === draft.id);
    assert.equal(hero(r).maxHp, 7 + Math.floor((draft.stats[2] + 1 - 10) / 2));
    assert.equal(
      hero(r).items.some((i) => i.id === "forged"),
      false,
    );
    const ids = hero(r).items.map((i) => i.id);
    r = await f.action(f.player, "draft", undefined, 0, draft);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      hero(r).items.map((i) => i.id),
      ids,
    );
    r = await f.action(f.player, "draft", undefined, 1, {
      ...draft,
      firstLevel: { ...draft.firstLevel, calculateHp: false },
    });
    assert.equal(r.statusCode, 409);
    r = await f.action(f.player, "draft", undefined, 1, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 2, draft);
    assert.equal(r.statusCode, 403);
    r = await f.action(f.dm, "character", draft.id, 2, {
      status: "approved",
      hp: 7,
      maxHp: 20,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).maxHp, 20);
    r = await f.action(f.dm, "character", draft.id, 3, {
      stats: [15, 14, 16, 12, 10, 8],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).hp, 7);
    assert.equal(hero(r).maxHp, 20);
  } finally {
    await f.app.close();
  }
});

test("Background pack API: saved snapshot, no forged items, resave and submission lock", async () => {
  const f = await fixture();
  try {
    const draft = {
      ...f.draft,
      id: randomUUID(),
      originChoices: {
        species: "core2024-species-human",
        class: "core2024-class-wizard",
        background: "core2024-background-sage",
      },
      firstLevel: {
        boosts: [0, 0, 1, 2, 0, 0],
        languages: ["Орочий", "Эльфийский"],
        backgroundEquipment: "pack-a",
        classEquipment: "gold",
      },
      items: [{ id: "forged", name: "Fake" }],
    };
    let r = await f.action(f.player, "draft", undefined, undefined, draft);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === draft.id);
    assert.equal(hero(r).initialEquipment.gold, 63);
    assert.equal(hero(r).items.length, 6);
    const savedItems = hero(r).items;
    const card = r
      .json()
      .characterOptions.find((c) => c.id === draft.originChoices.background);
    r = await f.action(f.dm, "characterOption", undefined, 0, {
      ...card,
      startingPacks: [],
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 0, draft);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(hero(r).items, savedItems);
    r = await f.action(f.player, "draft", undefined, undefined, {
      ...draft,
      id: randomUUID(),
    });
    assert.equal(r.statusCode, 400);
    r = await f.action(f.player, "draft", undefined, 1, {
      ...draft,
      status: "submitted",
    });
    assert.equal(r.statusCode, 200, r.body);
    r = await f.action(f.player, "draft", undefined, 2, draft);
    assert.equal(r.statusCode, 403);
  } finally {
    await f.app.close();
  }
});

test("Combat API: GM-only profiles and AC mode, derived updates and undo", async () => {
  const f = await fixture();
  try {
    const { default: catalog } = await import(
      "../shared/combat-equipment.json",
      { with: { type: "json" } }
    );
    const gear = (id) => ({
      ...catalog.find((i) => i.id === id),
      id: randomUUID(),
      type: "Тест",
      description: "Тест",
      revealed: true,
      equipped: true,
      combatProficiency: true,
    });
    const items = [gear("chain"), gear("shield"), gear("rapier")];
    let r = await f.action(f.player, "character", f.draft.id, 0, {
      items,
      acMode: "equipment",
    });
    assert.equal(r.statusCode, 403);
    r = await f.action(f.dm, "character", f.draft.id, 0, {
      items,
      acMode: "equipment",
      stats: [14, 18, 12, 10, 10, 10],
    });
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === f.draft.id);
    assert.equal(hero(r).derived.ac, 18);
    assert.equal(hero(r).derived.combat.attacks[0].attack, 6);
    r = await f.action(f.dm, "character", f.draft.id, 1, {
      items: items.map((i) => ({ ...i, equipped: false })),
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.ac, 14);
    assert.equal(hero(r).derived.combat.attacks.length, 0);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.ac, 18);
    const version = hero(r).version;
    r = await f.action(f.dm, "character", f.draft.id, version, {
      items: [{ ...items[2], combat: { ...items[2].combat, damage: "1d999" } }],
    });
    assert.equal(r.statusCode, 400);
  } finally {
    await f.app.close();
  }
});

test("Combat features API: master authorization, bounded levels, validation and undo", async () => {
  const f = await fixture();
  try {
    const data = {
      level: 5,
      acMode: "equipment",
      stats: [14, 18, 14, 10, 16, 10],
      combatFeatures: { defense: "monk", styles: ["archery"], monkLevel: 5 },
    };
    let r = await f.action(f.player, "character", f.draft.id, 0, data);
    assert.equal(r.statusCode, 403);
    r = await f.action(f.dm, "character", f.draft.id, 0, data);
    assert.equal(r.statusCode, 200, r.body);
    const hero = (r) => r.json().characters.find((c) => c.id === f.draft.id);
    assert.equal(hero(r).derived.ac, 17);
    assert.equal(hero(r).derived.combat.attacks[0].damage, "1d8");
    r = await f.action(f.dm, "character", f.draft.id, 1, { level: 4 });
    assert.equal(r.statusCode, 400);
    r = await f.action(f.dm, "character", f.draft.id, 1, {
      combatFeatures: {
        ...data.combatFeatures,
        styles: ["archery", "archery"],
      },
    });
    assert.equal(r.statusCode, 400);
    r = await f.action(f.dm, "character", f.draft.id, 1, {
      combatFeatures: { defense: "standard", styles: [], monkLevel: 0 },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.ac, 14);
    r = await f.action(f.dm, "undo", r.json().events[0].id, undefined, {});
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(hero(r).derived.ac, 17);
  } finally {
    await f.app.close();
  }
});
