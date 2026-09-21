import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateRules } from "../server/rules.mjs";
import { combatSchema } from "../server/combat.mjs";
import catalog from "../shared/combat-equipment.json" with { type: "json" };
import cards from "../shared/character-options.json" with { type: "json" };
const item = (id, patch = {}) => ({
  ...structuredClone(catalog.find((p) => p.id === id)),
  equipped: true,
  ...patch,
});
const base = {
  stats: [14, 18, 12, 10, 10, 10],
  level: 5,
  ac: 14,
  acMode: "equipment",
  classTraining: {
    skills: [],
    saves: [],
    source: "Воин",
    equipment: {
      weapons: ["Простое оружие", "Воинское оружие"],
      armor: ["Лёгкие доспехи", "Средние доспехи", "Тяжёлые доспехи", "Щиты"],
      tools: [],
    },
  },
};
const rules = (items, patch = {}) =>
  calculateRules({ ...base, items, ...patch });
test("Combat: validated catalogue and frozen starting profiles", () => {
  assert.equal(catalog.length, 48);
  for (const p of catalog)
    assert.ok(combatSchema.safeParse(p.combat).success, p.name);
  for (const c of cards)
    for (const p of c.startingPacks || [])
      for (const i of p.items)
        if (i.combat) assert.ok(combatSchema.safeParse(i.combat).success);
  const dagger = item("dagger").combat;
  for (const combat of [
    { ...dagger, damage: "99d99" },
    { ...dagger, properties: ["light", "light"] },
    { ...dagger, attackBonus: 99 },
    { ...dagger, kind: "spell" },
  ])
    assert.equal(combatSchema.safeParse(combat).success, false);
});
test("Combat AC: categories, negative Dex, shield training, adjustments and conflict fallback", () => {
  assert.equal(rules([]).ac, 14);
  assert.equal(rules([item("leather")]).ac, 15);
  assert.equal(rules([item("halfplate")]).ac, 17);
  assert.equal(
    rules([item("halfplate")], { stats: [14, 8, 12, 10, 10, 10] }).ac,
    14,
  );
  assert.equal(
    rules([item("chain")], { stats: [14, 8, 12, 10, 10, 10] }).ac,
    16,
  );
  assert.equal(rules([item("chain"), item("shield")]).ac, 18);
  assert.equal(
    rules([item("chain"), item("shield")], { classTrainingEnabled: false }).ac,
    16,
  );
  assert.equal(
    rules([item("chain"), item("shield", { combatProficiency: true })], {
      classTrainingEnabled: false,
    }).ac,
    18,
  );
  const conflict = rules([item("chain"), item("leather"), item("shield")]);
  assert.equal(conflict.ac, 14);
  assert.ok(conflict.combat.warnings.some((w) => w.includes("Конфликт")));
  assert.equal(
    rules([item("chain"), item("shield"), item("shield", { id: "shield2" })])
      .ac,
    14,
  );
  const adjusted = rules(
    [item("chain", { effects: [{ target: "ac", value: 1 }] })],
    {
      adjustments: [
        { id: "a", source: "test", target: "ac", value: 2, enabled: true },
      ],
    },
  );
  assert.equal(adjusted.ac, 19);
  assert.equal(rules([item("chain")], { acMode: "manual", ac: 21 }).ac, 21);
  assert.equal(rules([item("chain", { equipped: false })]).ac, 14);
  assert.ok(
    rules([item("chain")], {
      stats: [8, 18, 12, 10, 10, 10],
    }).combat.warnings.some((w) => w.includes("скорость")),
  );
});
test("Combat attacks: finesse, proficiency, thrown, damage, attunement, overrides and warnings", () => {
  const attack = (id, patch = {}, character = {}) =>
    rules([item(id, patch)], character).combat.attacks[0];
  assert.equal(attack("dagger").attack, 7);
  assert.equal(attack("dagger").damageModifier, 4);
  assert.equal(attack("dagger").ability, "dex");
  assert.equal(attack("javelin").attack, 5);
  assert.equal(attack("javelin").ability, "str");
  assert.equal(attack("longbow").attack, 7);
  assert.equal(attack("dagger", {}, { classTrainingEnabled: false }).attack, 4);
  assert.equal(attack("dagger", { combatProficiency: false }).attack, 4);
  assert.equal(
    attack(
      "dagger",
      { combatProficiency: true },
      { classTrainingEnabled: false },
    ).attack,
    7,
  );
  const weapon = { ...item("dagger").combat, attackBonus: 2, damageBonus: 2 };
  assert.equal(
    attack("dagger", {
      combat: weapon,
      requiresAttunement: true,
      attuned: false,
    }).attack,
    7,
  );
  assert.equal(
    attack("dagger", {
      combat: weapon,
      requiresAttunement: true,
      attuned: true,
    }).attack,
    9,
  );
  assert.equal(
    attack("dagger", {
      combat: weapon,
      requiresAttunement: true,
      attuned: true,
    }).damageModifier,
    6,
  );
  assert.equal(
    rules([item("dagger", { equipped: false })]).combat.attacks.length,
    0,
  );
  assert.ok(
    rules([item("greatsword"), item("shield")]).combat.attacks[0].notes.some(
      (n) => n.includes("две руки"),
    ),
  );
  assert.ok(
    attack("longbow", {}, { stats: [14, 12, 12, 10, 10, 10] }).notes.some((n) =>
      n.includes("Помеха"),
    ),
  );
  const rogue = {
    ...base,
    classTraining: {
      ...base.classTraining,
      equipment: {
        ...base.classTraining.equipment,
        weapons: [
          "Простое оружие",
          "Воинское оружие со свойством «Фехтовальное» или «Лёгкое»",
        ],
      },
    },
  };
  assert.equal(attack("rapier", {}, rogue).trained, true);
  assert.equal(attack("greatsword", {}, rogue).trained, false);
});

test("Class defense: exclusive formulas, equipment conditions and Defense style", () => {
  const features = (defense, styles = []) => ({
    combatFeatures: { defense, styles, monkLevel: 0 },
  });
  assert.equal(rules([], features("barbarian")).ac, 15); // Dex4 Con1
  assert.equal(
    rules([], { ...features("monk"), stats: [14, 18, 12, 10, 16, 10] }).ac,
    17,
  );
  assert.equal(rules([item("shield")], features("barbarian")).ac, 17);
  assert.equal(
    rules([item("shield")], {
      ...features("monk"),
      stats: [14, 18, 12, 10, 16, 10],
    }).ac,
    16,
  );
  assert.equal(
    rules([item("chain")], features("barbarian", ["defense"])).ac,
    17,
  );
  assert.equal(rules([], features("monk", ["defense"])).ac, 14);
  assert.equal(
    rules([item("chain")], {
      ...features("standard", ["defense"]),
      acMode: "manual",
      ac: 19,
    }).ac,
    19,
  );
});
test("Fighting styles: ranged vs thrown, two hands, Light extra damage and negative modifiers", () => {
  const patch = {
    combatFeatures: {
      defense: "standard",
      styles: ["archery", "greatWeapon", "twoWeapon"],
      monkLevel: 0,
    },
  };
  const result = rules(
    [
      item("longbow"),
      item("javelin"),
      item("staff", { combat: { ...item("staff").combat, grip: "two" } }),
    ],
    patch,
  ).combat.attacks;
  assert.equal(result[0].attack, 9);
  assert.equal(result[1].attack, 5);
  assert.equal(result[2].damage, "1d8");
  assert.equal(result[2].damageDieMinimum, 3);
  const pair = [item("dagger"), item("shortsword")];
  assert.equal(rules(pair).combat.attacks[0].extraLightDamageModifier, 0);
  assert.equal(
    rules(pair, patch).combat.attacks[0].extraLightDamageModifier,
    4,
  );
  assert.equal(
    rules(pair, { stats: [8, 8, 10, 10, 10, 10] }).combat.attacks[0]
      .extraLightDamageModifier,
    -1,
  );
  assert.equal(
    rules([item("dagger")], patch).combat.attacks[0].extraLightDamageModifier,
    undefined,
  );
  assert.equal(
    rules([...pair, item("shield")], patch).combat.attacks[0]
      .extraLightDamageModifier,
    undefined,
  );
});
test("Martial arts: class-level dice, weapon restrictions, unarmed fallback and source independence", () => {
  for (const [level, die] of [
    [1, "1d6"],
    [4, "1d6"],
    [5, "1d8"],
    [10, "1d8"],
    [11, "1d10"],
    [16, "1d10"],
    [17, "1d12"],
    [20, "1d12"],
  ]) {
    const features = {
      level,
      combatFeatures: { defense: "monk", styles: [], monkLevel: level },
    };
    const result = rules([item("staff")], features).combat.attacks;
    assert.equal(result[0].ability, "dex");
    assert.equal(result[0].monkDamage, die);
    assert.equal(result[1].damage, die);
    const disabled = rules([item("staff"), item("shield")], features).combat;
    assert.equal(disabled.attacks[0].monkDamage, undefined);
    assert.equal(disabled.attacks[0].ability, "str");
    assert.equal(disabled.attacks[1].damage, "1");
    assert.equal(
      rules([item("staff"), item("longsword")], features).combat.attacks[0]
        .monkDamage,
      undefined,
    );
    assert.equal(
      rules([item("shortsword")], features).combat.attacks[0].monkDamage,
      die,
    );
  }
});
