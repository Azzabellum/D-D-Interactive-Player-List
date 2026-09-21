import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFirstLevel, firstLevelSchema } from "../server/first-level.mjs";
const base = {
  stats: [15, 14, 13, 12, 10, 8],
  originChoices: { background: "sage" },
  originCards: { background: { boostAbilities: [2, 3, 4] } },
  firstLevel: {
    boosts: [0, 0, 1, 1, 1, 0],
    languages: ["Орочий", "Эльфийский"],
  },
};
test("First level: valid distributions and invalid boundaries", () => {
  assert.deepEqual(buildFirstLevel(base).stats, [15, 14, 14, 13, 11, 8]);
  for (const boosts of [
    [0, 0, 3, 0, 0, 0],
    [0, 0, 2, 2, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ])
    assert.equal(
      firstLevelSchema.safeParse({ ...base.firstLevel, boosts }).success,
      false,
    );
  assert.throws(
    () => buildFirstLevel({ ...base, stats: [15, 14, 20, 12, 10, 8] }),
    /20/,
  );
  assert.throws(
    () => buildFirstLevel({ ...base, originCards: undefined }),
    /происхождению/,
  );
  assert.equal(
    firstLevelSchema.safeParse({
      ...base.firstLevel,
      languages: ["Общий", "Орочий"],
    }).success,
    false,
  );
});

test("Background training: tools, skills, no stacking and manual override", async () => {
  const { calculateRules } = await import("../server/rules.mjs");
  const { optionSchema } = await import("../server/character-options.mjs");
  const background = {
    id: "custom",
    kind: "background",
    name: "Test",
    summary: "Test",
    description: "Test",
    source: "",
    archived: false,
    boostAbilities: [2, 3, 4],
    trainedSkills: ["arcana", "history"],
    toolOptions: ["A", "B"],
  };
  assert.ok(optionSchema.safeParse(background).success);
  assert.equal(
    optionSchema.safeParse({
      ...background,
      trainedSkills: ["arcana", "arcana"],
    }).success,
    false,
  );
  assert.equal(
    optionSchema.safeParse({ ...background, kind: "class" }).success,
    false,
  );
  assert.equal(
    optionSchema.safeParse({ ...background, toolOptions: ["A", "A"] }).success,
    false,
  );
  assert.equal(
    optionSchema.safeParse({
      ...background,
      trainedSkills: ["unknown", "history"],
    }).success,
    false,
  );
  const draft = { ...base, originCards: { background } };
  assert.throws(() => buildFirstLevel(draft), /инструмент/);
  assert.throws(
    () =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...base.firstLevel, tool: "X" },
      }),
    /инструмент/,
  );
  const built = buildFirstLevel({
    ...draft,
    firstLevel: { ...base.firstLevel, tool: "B" },
  });
  assert.deepEqual(built.backgroundTraining, {
    skills: ["arcana", "history"],
    tools: ["B"],
    source: "Test",
  });
  const rules = (patch = {}) =>
    calculateRules({ ...built, ...patch }).skills.find(
      (s) => s.id === "arcana",
    );
  assert.equal(rules().rank, 1);
  assert.equal(rules({ skillRanks: { arcana: 1 } }).bonus, 2);
  assert.equal(rules({ skillRanks: { arcana: 2 } }).bonus, 4);
  assert.equal(rules({ backgroundTrainingEnabled: false }).rank, 0);
  assert.equal(
    rules({ backgroundTrainingEnabled: false, skillRanks: { arcana: 2 } }).rank,
    2,
  );
  const fixed = buildFirstLevel({
    ...draft,
    originCards: { background: { ...background, toolOptions: ["A"] } },
  });
  assert.deepEqual(fixed.backgroundTraining.tools, ["A"]);
  const changed = buildFirstLevel({
    ...draft,
    originCards: {
      background: {
        ...background,
        trainedSkills: ["insight", "religion"],
        toolOptions: ["A"],
      },
    },
  });
  assert.equal(
    calculateRules(changed).skills.find((s) => s.id === "arcana").rank,
    0,
  );
  assert.equal(
    calculateRules(changed).skills.find((s) => s.id === "insight").rank,
    1,
  );
});

test("All 12 classes: choices, background overlap, saves and independent source", async () => {
  const { default: cards } = await import("../shared/character-options.json", {
    with: { type: "json" },
  });
  const { calculateRules } = await import("../server/rules.mjs");
  const { optionSchema } = await import("../server/character-options.mjs");
  const classes = cards.filter((c) => c.kind === "class");
  assert.equal(classes.length, 12);
  for (const card of classes) {
    assert.ok(optionSchema.safeParse(card).success, card.name);
    const bg = cards.find((c) => c.id === "core2024-background-sage");
    const selected = card.classRules.skills
      .filter((id) => !bg.trainedSkills.includes(id))
      .slice(0, card.classRules.count);
    const draft = {
      ...base,
      originCards: { background: bg, class: card },
      firstLevel: {
        ...base.firstLevel,
        classSkills: selected,
        classTools: card.classRules.equipment?.toolChoice?.options.slice(
          0,
          card.classRules.equipment.toolChoice.count,
        ),
        expertise: bg.trainedSkills.slice(
          0,
          card.classRules.expertiseCount || 0,
        ),
      },
    };
    const built = buildFirstLevel(draft),
      rules = calculateRules(built);
    assert.equal(built.classTraining.skills.length, card.classRules.count);
    for (const id of selected)
      assert.equal(rules.skills.find((s) => s.id === id).rank, 1);
    assert.deepEqual(
      rules.saves
        .filter((s) => s.trained)
        .map((s) => s.ability)
        .sort(),
      [...card.classRules.saves].sort(),
    );
    assert.equal(
      calculateRules({ ...built, classTrainingEnabled: false }).saves.some(
        (s) => s.trained,
      ),
      false,
    );
    assert.throws(
      () =>
        buildFirstLevel({
          ...draft,
          firstLevel: { ...draft.firstLevel, classSkills: selected.slice(1) },
        }),
      /навыков/,
    );
  }
  const wizard = classes.find((c) => c.id === "core2024-class-wizard");
  const bg = cards.find((c) => c.id === "core2024-background-sage");
  const draft = {
    ...base,
    originCards: { background: bg, class: wizard },
    firstLevel: { ...base.firstLevel, classSkills: ["insight", "medicine"] },
  };
  for (const selection of [
    ["arcana", "medicine"],
    ["athletics", "medicine"],
    ["medicine", "medicine"],
  ])
    assert.throws(() =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, classSkills: selection },
      }),
    );
  const built = buildFirstLevel(draft);
  const combined = calculateRules({
    ...built,
    skillRanks: { insight: 2 },
    saveProficiencies: ["int", "con"],
  });
  assert.equal(combined.skills.find((s) => s.id === "insight").bonus, 4);
  assert.equal(combined.saves.find((s) => s.ability === "int").bonus, 2);
  assert.equal(combined.saves.find((s) => s.ability === "con").trained, true);
  assert.equal(
    optionSchema.safeParse({ ...wizard, kind: "species" }).success,
    false,
  );
});

test("Rogue expertise: trained skills only, two unique choices, source controls", async () => {
  const { default: cards } = await import("../shared/character-options.json", {
    with: { type: "json" },
  });
  const { calculateRules } = await import("../server/rules.mjs");
  const rogue = cards.find((c) => c.id === "core2024-class-rogue"),
    bg = cards.find((c) => c.id === "core2024-background-sage");
  const draft = {
    ...base,
    originCards: { background: bg, class: rogue },
    firstLevel: {
      ...base.firstLevel,
      classSkills: ["acrobatics", "athletics", "deception", "insight"],
      expertise: ["arcana", "acrobatics"],
    },
  };
  const built = buildFirstLevel(draft),
    result = (patch = {}) => calculateRules({ ...built, ...patch }).skills;
  assert.equal(result().find((s) => s.id === "arcana").rank, 2);
  assert.equal(result().find((s) => s.id === "acrobatics").bonus, 4);
  assert.equal(
    result({ level: 5 }).find((s) => s.id === "acrobatics").bonus,
    6,
  );
  assert.equal(
    result({ skillRanks: { acrobatics: 2 } }).find((s) => s.id === "acrobatics")
      .bonus,
    4,
  );
  assert.equal(
    result({ backgroundTrainingEnabled: false }).find((s) => s.id === "arcana")
      .rank,
    0,
  );
  assert.equal(
    result({
      backgroundTrainingEnabled: false,
      skillRanks: { arcana: 1 },
    }).find((s) => s.id === "arcana").rank,
    2,
  );
  assert.equal(
    result({ classTrainingEnabled: false }).find((s) => s.id === "arcana").rank,
    1,
  );
  for (const expertise of [
    [],
    ["arcana"],
    ["arcana", "arcana"],
    ["arcana", "survival"],
  ])
    assert.throws(() =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, expertise },
      }),
    );
  assert.throws(
    () =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, classSkills: undefined },
      }),
    /Экспертиза/,
  );
  assert.throws(
    () =>
      buildFirstLevel({
        ...draft,
        originCards: {
          ...draft.originCards,
          class: {
            ...rogue,
            classRules: { ...rogue.classRules, expertiseCount: 0 },
          },
        },
      }),
    /экспертизу/,
  );
  const legacy = buildFirstLevel({
    ...draft,
    originCards: {
      ...draft.originCards,
      class: {
        ...rogue,
        classRules: { ...rogue.classRules, expertiseCount: undefined },
      },
    },
    firstLevel: { ...draft.firstLevel, expertise: undefined },
  });
  assert.deepEqual(legacy.classTraining.expertise, []);
});

test("Class equipment: choices, fixed grants, legacy snapshots and validation", async () => {
  const { default: cards } = await import("../shared/character-options.json", {
    with: { type: "json" },
  });
  const { optionSchema } = await import("../server/character-options.mjs");
  const bard = cards.find((c) => c.id === "core2024-class-bard");
  const draft = {
    ...base,
    originCards: { ...base.originCards, class: bard },
    firstLevel: {
      ...base.firstLevel,
      classSkills: ["acrobatics", "athletics", "deception"],
      classTools: ["Лютня", "Лира", "Флейта"],
    },
  };
  const built = buildFirstLevel(draft);
  assert.deepEqual(built.classTraining.equipment.tools, [
    "Лютня",
    "Лира",
    "Флейта",
  ]);
  assert.deepEqual(built.classTraining.equipment.armor, ["Лёгкие доспехи"]);
  for (const classTools of [
    [],
    ["Лютня"],
    ["Лютня", "Лютня", "Лира"],
    ["Лютня", "Лира", "Воровские инструменты"],
  ])
    assert.throws(() =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, classTools },
      }),
    );
  assert.throws(
    () =>
      buildFirstLevel({
        ...draft,
        firstLevel: { ...draft.firstLevel, classSkills: undefined },
      }),
    /Инструменты/,
  );
  const legacy = {
    ...bard,
    classRules: { ...bard.classRules, equipment: undefined },
  };
  assert.equal(
    buildFirstLevel({
      ...draft,
      originCards: { ...draft.originCards, class: legacy },
      firstLevel: { ...draft.firstLevel, classTools: undefined },
    }).classTraining.equipment,
    undefined,
  );
  for (const name of ["druid", "monk", "rogue", "fighter"]) {
    const card = cards.find((c) => c.id === `core2024-class-${name}`);
    const rules = card.classRules;
    const result = buildFirstLevel({
      ...draft,
      originCards: { ...draft.originCards, class: card },
      firstLevel: {
        ...draft.firstLevel,
        classSkills: rules.skills.slice(0, rules.count),
        expertise: rules.skills.slice(0, rules.expertiseCount || 0),
        classTools: rules.equipment.toolChoice?.options.slice(
          0,
          rules.equipment.toolChoice.count,
        ),
      },
    });
    assert.deepEqual(
      result.classTraining.equipment.weapons,
      rules.equipment.weapons,
    );
    assert.equal(
      result.classTraining.equipment.tools.length,
      name === "fighter" ? 0 : 1,
    );
  }
  for (const equipment of [
    { ...bard.classRules.equipment, tools: ["A", "A"] },
    { ...bard.classRules.equipment, toolChoice: { count: 3, options: ["A"] } },
    { ...bard.classRules.equipment, armor: [""] },
  ])
    assert.equal(
      optionSchema.safeParse({
        ...bard,
        classRules: { ...bard.classRules, equipment },
      }).success,
      false,
    );
});
