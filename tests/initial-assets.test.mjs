import { test } from "node:test";
import assert from "node:assert/strict";
import cards from "../shared/character-options.json" with { type: "json" };
import { buildFirstLevel } from "../server/first-level.mjs";
import { optionSchema } from "../server/character-options.mjs";
const draftFor = (name) => ({
  id: "hero",
  stats: [15, 14, 13, 12, 10, 8],
  originChoices: {
    class: `core2024-class-${name}`,
    species: "core2024-species-dwarf",
    background: "core2024-background-sage",
  },
  originCards: {
    class: cards.find((c) => c.id === `core2024-class-${name}`),
    species: cards.find((c) => c.id === "core2024-species-dwarf"),
    background: cards.find((c) => c.id === "core2024-background-sage"),
  },
  firstLevel: {
    boosts: [0, 0, 1, 2, 0, 0],
    languages: ["Орочий", "Эльфийский"],
    calculateHp: true,
    classEquipment: "gold",
    backgroundGold: true,
  },
});
test("Initial assets: all classes HP, gold and every equipment package", () => {
  const dice = [12, 8, 8, 8, 10, 8, 10, 10, 8, 6, 8, 6],
    gold = [75, 90, 110, 50, 155, 50, 150, 150, 100, 50, 100, 55];
  const names = [
    "barbarian",
    "bard",
    "cleric",
    "druid",
    "fighter",
    "monk",
    "paladin",
    "ranger",
    "rogue",
    "sorcerer",
    "warlock",
    "wizard",
  ];
  names.forEach((name, i) => {
    const draft = draftFor(name),
      built = buildFirstLevel(draft);
    assert.equal(built.maxHp, dice[i] + 3, name);
    assert.equal(built.hp, built.maxHp);
    assert.equal(
      built.items.find((i) => i.type === "Валюта").quantity,
      gold[i] + 50,
      name,
    );
    assert.ok(optionSchema.safeParse(draft.originCards.class).success);
    for (const pack of draft.originCards.class.startingPacks) {
      const choice = {
        ...draft.firstLevel,
        classEquipment: pack.id,
        equipmentTool: pack.toolOptions?.[0],
      };
      if (pack.useClassTool) {
        choice.classTools = [pack.toolOptions[0]];
        choice.classSkills = ["acrobatics", "athletics"];
      }
      const packed = buildFirstLevel({ ...draft, firstLevel: choice });
      assert.equal(
        packed.items.length,
        pack.items.length + (pack.toolOptions ? 1 : 0) + 1,
      );
      assert.equal(
        packed.items.find((i) => i.type === "Валюта").quantity,
        pack.gold + 50,
      );
      assert.equal(packed.items.filter((i) => i.equipped).length, 0);
    }
  });
});
test("Initial assets: idempotence, replacement, mode lock, legacy and invalid inputs", () => {
  const draft = draftFor("wizard"),
    first = buildFirstLevel(draft);
  const previous = {
    ...first,
    items: [...first.items, { id: "manual", name: "Gift" }],
  };
  const again = buildFirstLevel(draft, previous);
  assert.equal(again.items.length, 2);
  assert.equal(again.maxHp, first.maxHp);
  const switched = buildFirstLevel(
    { ...draft, firstLevel: { ...draft.firstLevel, classEquipment: "pack-a" } },
    previous,
  );
  assert.equal(
    switched.items.filter((i) => i.name === "Золотые монеты").length,
    1,
  );
  assert.equal(switched.items.find((i) => i.id === "manual").name, "Gift");
  const cleared = buildFirstLevel(
    {
      ...draft,
      firstLevel: {
        ...draft.firstLevel,
        classEquipment: undefined,
        backgroundGold: false,
      },
    },
    previous,
  );
  assert.deepEqual(cleared.items, [{ id: "manual", name: "Gift" }]);
  assert.equal(cleared.initialEquipment, undefined);
  assert.throws(
    () =>
      buildFirstLevel(
        { ...draft, firstLevel: { ...draft.firstLevel, calculateHp: false } },
        previous,
      ),
    /закреплён/,
  );
  for (const patch of [
    { classEquipment: "invalid" },
    { equipmentTool: "Лира" },
  ])
    assert.throws(() =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, ...patch },
      }),
    );
  const legacy = buildFirstLevel({
    ...draft,
    firstLevel: {
      ...draft.firstLevel,
      calculateHp: undefined,
      classEquipment: undefined,
      backgroundGold: undefined,
    },
  });
  assert.equal(legacy.maxHp, undefined);
  assert.equal(legacy.items, undefined);
  const low = buildFirstLevel({
    ...draft,
    stats: [15, 14, 8, 12, 10, 13],
    firstLevel: { ...draft.firstLevel, boosts: [0, 0, 0, 2, 1, 0] },
  });
  assert.equal(low.maxHp, 6); // d6 -1 Con +1 dwarf
  const bard = draftFor("bard");
  assert.throws(
    () =>
      buildFirstLevel({
        ...bard,
        firstLevel: { ...bard.firstLevel, classEquipment: "pack-a" },
      }),
    /инструмент/,
  );
  assert.throws(
    () =>
      buildFirstLevel({
        ...draft,
        originCards: {
          ...draft.originCards,
          class: { ...draft.originCards.class, hitDie: undefined },
        },
      }),
    /кость/,
  );
});

test("Background packs: four origins, independent grants, replacement and legacy gold", () => {
  for (const name of ["acolyte", "criminal", "sage", "soldier"]) {
    const bg = cards.find((c) => c.id === `core2024-background-${name}`);
    assert.ok(optionSchema.safeParse(bg).success);
    const draft = draftFor("wizard");
    draft.originCards.background = bg;
    draft.firstLevel = {
      ...draft.firstLevel,
      boosts: [0, 0, 0, 0, 0, 0],
      backgroundGold: false,
      backgroundEquipment: "pack-a",
      classEquipment: "pack-a",
      tool: bg.toolOptions[0],
    };
    draft.firstLevel.boosts[bg.boostAbilities[0]] = 2;
    draft.firstLevel.boosts[bg.boostAbilities[1]] = 1;
    const built = buildFirstLevel(draft),
      pack = bg.startingPacks[0];
    assert.equal(built.initialEquipment.gold, 5 + pack.gold);
    assert.equal(
      built.items.filter((i) => i.id.includes(":background:")).length,
      pack.items.length + (name === "soldier" ? 1 : 0),
    );
    if (name === "soldier")
      assert.ok(built.items.some((i) => i.name === draft.firstLevel.tool));
    assert.equal(
      new Set(built.items.map((i) => i.id)).size,
      built.items.length,
    );
    const previous = {
      ...built,
      items: [...built.items, { id: "gift", name: "Gift" }],
    };
    const again = buildFirstLevel(draft, previous);
    assert.equal(again.items.length, previous.items.length);
    const cash = buildFirstLevel(
      {
        ...draft,
        firstLevel: { ...draft.firstLevel, backgroundEquipment: "gold" },
      },
      previous,
    );
    assert.equal(
      cash.items.some((i) => i.id.includes(":background:")),
      false,
    );
    assert.equal(cash.initialEquipment.gold, 55);
    assert.ok(cash.items.some((i) => i.id === "gift"));
    const legacy = buildFirstLevel({
      ...draft,
      firstLevel: {
        ...draft.firstLevel,
        backgroundEquipment: undefined,
        backgroundGold: true,
      },
    });
    assert.deepEqual(
      legacy.items,
      cash.items.filter((i) => i.id !== "gift"),
    );
    assert.throws(
      () =>
        buildFirstLevel({
          ...draft,
          firstLevel: { ...draft.firstLevel, backgroundGold: true },
        }),
      /одновременно/,
    );
    assert.throws(
      () =>
        buildFirstLevel({
          ...draft,
          firstLevel: { ...draft.firstLevel, backgroundEquipment: "missing" },
        }),
      /доступный/,
    );
    assert.throws(
      () =>
        buildFirstLevel({
          ...draft,
          originCards: {
            ...draft.originCards,
            background: { ...bg, startingPacks: undefined },
          },
        }),
      /доступный/,
    );
  }
});
