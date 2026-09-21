import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRules, skills } from "../server/rules.mjs";

test("Правила: границы бонуса мастерства уровней 1–20", () => {
  const expected = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
  expected.forEach((bonus, i) =>
    assert.equal(
      calculateRules({ level: i + 1, stats: [10, 10, 10, 10, 10, 10] })
        .proficiency,
      bonus,
    ),
  );
});
test("Правила: округление вниз, крайние характеристики и 18 навыков", () => {
  const r = calculateRules({ stats: [1, 9, 10, 11, 20, 30] });
  assert.deepEqual(r.modifiers, {
    str: -5,
    dex: -1,
    con: 0,
    int: 0,
    wis: 5,
    cha: 10,
  });
  assert.equal(r.skills.length, 18);
  assert.equal(new Set(skills.map((s) => s.id)).size, 18);
  assert.equal(r.initiative, -1);
  assert.equal(r.passivePerception, 15);
});
test("Правила: владение, экспертиза и спасброски без повторного бонуса", () => {
  const r = calculateRules({
    level: 5,
    stats: [14, 16, 12, 10, 18, 8],
    skillRanks: { athletics: 1, perception: 2 },
    saveProficiencies: ["dex", "wis"],
  });
  assert.equal(r.skills.find((s) => s.id === "athletics").total, 5);
  assert.equal(r.skills.find((s) => s.id === "perception").total, 10);
  assert.equal(r.skills.find((s) => s.id === "stealth").total, 3);
  assert.equal(r.saves.find((s) => s.ability === "dex").total, 6);
  assert.equal(r.saves.find((s) => s.ability === "cha").total, -1);
  assert.equal(r.passivePerception, 20);
});

test("Поправки: сложение, отключение, источники и пересчёт", () => {
  const c = {
    ac: 14,
    stats: [10, 14, 10, 10, 12, 10],
    adjustments: [
      { id: "a", target: "ac", value: 2, enabled: true, source: "Щит" },
      { id: "b", target: "ac", value: -1, enabled: true, source: "Штраф" },
      { id: "c", target: "ac", value: 20, enabled: false, source: "Выключено" },
      {
        id: "d",
        target: "initiative",
        value: 3,
        enabled: true,
        source: "Бдительность",
      },
      {
        id: "e",
        target: "skill:perception",
        value: 2,
        enabled: true,
        source: "Зрение",
      },
      {
        id: "f",
        target: "save:dex",
        value: -2,
        enabled: true,
        source: "Помеха числом",
      },
    ],
  };
  const r = calculateRules(c);
  assert.equal(r.ac, 15);
  assert.equal(r.initiative, 5);
  assert.equal(r.passivePerception, 13);
  assert.equal(r.saves.find((s) => s.ability === "dex").total, 0);
  assert.equal(r.skills.find((s) => s.id === "stealth").total, 2);
  assert.equal(r.adjustments.length, 5);
  assert.equal(c.ac, 14);
  assert.equal(calculateRules({ ...c, ac: 16 }).ac, 17);
  assert.equal(calculateRules({ ...c, adjustments: [] }).ac, 14);
});

test("Предметные эффекты: экипировка, настройка и независимость от количества", () => {
  const item = {
    id: "ring",
    name: "Кольцо",
    effects: [
      { target: "ac", value: 2 },
      { target: "skill:perception", value: 1 },
    ],
    requiresAttunement: true,
  };
  const c = {
    ac: 14,
    stats: [10, 10, 10, 10, 10, 10],
    adjustments: [
      { id: "manual", source: "Штраф", target: "ac", value: -1, enabled: true },
    ],
  };
  assert.equal(calculateRules({ ...c, items: [item] }).ac, 13);
  assert.equal(
    calculateRules({ ...c, items: [{ ...item, equipped: true }] }).ac,
    13,
  );
  const r = calculateRules({
    ...c,
    items: [{ ...item, equipped: true, attuned: true }],
  });
  assert.equal(r.ac, 15);
  assert.equal(r.passivePerception, 11);
  assert.equal(
    r.adjustments.find((a) => a.target === "skill:perception").source,
    "Предмет: Кольцо",
  );
  assert.equal(
    calculateRules({
      ...c,
      items: [{ ...item, attuned: true, equipped: false }],
    }).ac,
    13,
  );
  assert.equal(
    calculateRules({
      ...c,
      items: [{ ...item, requiresAttunement: false, equipped: true }],
    }).ac,
    15,
  );
});
