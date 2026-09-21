import { z } from "zod";
export const combatFeaturesSchema = z
  .object({
    defense: z.enum(["standard", "barbarian", "monk"]),
    styles: z
      .array(z.enum(["archery", "defense", "greatWeapon", "twoWeapon"]))
      .max(4)
      .refine((v) => new Set(v).size === v.length),
    monkLevel: z.number().int().min(0).max(20),
  })
  .strict();
const bonus = z.number().int().min(-10).max(10);
const dice = z.string().regex(/^(?:[1-9]|[1-9][0-9]?d(?:4|6|8|10|12|20))$/);
export const combatSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("weapon"),
      category: z.enum(["simple", "martial"]),
      mode: z.enum(["melee", "ranged"]),
      grip: z.enum(["one", "two"]).optional(),
      damage: dice,
      damageType: z.enum(["bludgeoning", "piercing", "slashing"]),
      properties: z
        .array(
          z.enum([
            "finesse",
            "light",
            "heavy",
            "twoHanded",
            "thrown",
            "ammunition",
            "loading",
            "reach",
          ]),
        )
        .max(8)
        .refine((v) => new Set(v).size === v.length),
      versatile: dice.optional(),
      range: z.string().max(30).optional(),
      mastery: z.string().max(40).optional(),
      attackBonus: bonus.optional(),
      damageBonus: bonus.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("armor"),
      category: z.enum(["light", "medium", "heavy", "shield"]),
      base: z.number().int().min(0).max(30),
      strength: z.number().int().min(0).max(30).optional(),
      stealth: z.boolean().optional(),
      bonus: bonus.optional(),
    })
    .strict(),
]);
const armorNames = {
  light: "Лёгкие доспехи",
  medium: "Средние доспехи",
  heavy: "Тяжёлые доспехи",
  shield: "Щиты",
};
export function trainedWith(character, item) {
  if (item.combatProficiency !== undefined) return item.combatProficiency;
  const c = item.combat;
  const training =
    character.classTrainingEnabled !== false
      ? character.classTraining?.equipment
      : undefined;
  if (c.kind === "armor")
    return (
      !!training?.armor.includes(armorNames[c.category]) || !!character.creation
    );
  const weapons = training?.weapons || [];
  if (character.creation) return true; // Existing single-class Fighter starter.
  return (
    weapons.includes(
      c.category === "simple" ? "Простое оружие" : "Воинское оружие",
    ) ||
    (c.category === "martial" &&
      ((weapons.includes("Воинское оружие со свойством «Лёгкое»") &&
        c.properties.includes("light")) ||
        (weapons.includes(
          "Воинское оружие со свойством «Фехтовальное» или «Лёгкое»",
        ) &&
          c.properties.some((p) => ["finesse", "light"].includes(p)))))
  );
}
export function calculateCombat(character, modifiers, proficiency) {
  const equipped = (character.items || []).filter(
    (i) => i.equipped && i.combat,
  );
  const warnings = [];
  const armor = equipped.filter(
    (i) => i.combat.kind === "armor" && i.combat.category !== "shield",
  );
  const shields = equipped.filter(
    (i) => i.combat.kind === "armor" && i.combat.category === "shield",
  );
  const features = character.combatFeatures || {
    defense: "standard",
    styles: [],
    monkLevel: 0,
  };
  const style = (id) => features.styles.includes(id);
  const weapons = equipped.filter((i) => i.combat.kind === "weapon");
  const monkWeapon = (w) =>
    w.mode === "melee" &&
    (w.category === "simple" || w.properties.includes("light"));
  const monkActive =
    features.monkLevel > 0 &&
    !armor.length &&
    !shields.length &&
    weapons.every((i) => monkWeapon(i.combat));
  const monkDie =
    features.monkLevel >= 17
      ? "1d12"
      : features.monkLevel >= 11
        ? "1d10"
        : features.monkLevel >= 5
          ? "1d8"
          : "1d6";
  if (features.monkLevel > 0 && !monkActive)
    warnings.push(
      "Боевые искусства не действуют: снимите доспех и щит, оставьте только оружие монаха.",
    );
  if (style("defense") && character.acMode !== "equipment")
    warnings.push(
      "Стиль «Оборона» не добавлен к ручному КД: учтите его в базе или включите расчёт по экипировке.",
    );
  const magic = (i) => !i.requiresAttunement || i.attuned;
  const automatic = character.acMode === "equipment";
  let baseAc = character.ac ?? 0,
    acFormula = "Ручная база мастера";
  if (automatic) {
    const unknown = (character.items || []).filter(
      (i) => i.equipped && !i.combat,
    );
    if (unknown.length)
      warnings.push(
        "У части экипировки нет боевого профиля: проверьте защиту вручную.",
      );
    if (armor.length > 1 || shields.length > 1)
      warnings.push(
        "Конфликт: надето несколько доспехов или щитов. КД использует ручную базу.",
      );
    else {
      const item = armor[0],
        a = item?.combat;
      const dex =
        a?.category === "heavy"
          ? 0
          : a?.category === "medium"
            ? Math.min(2, modifiers.dex)
            : modifiers.dex;
      baseAc = (a?.base ?? 10) + dex + (item && magic(item) ? a.bonus || 0 : 0);
      acFormula = `${item?.name || "Без доспеха"}: ${a?.base ?? 10} + (${dex}) Ловкость`;
      if (item && magic(item) && a.bonus)
        acFormula += ` + (${a.bonus}) бонус доспеха`;
      if (!armor.length && features.defense !== "standard") {
        if (features.defense === "monk" && shields.length)
          warnings.push(
            "Бездоспешная защита монаха не действует со щитом; используется обычная защита.",
          );
        else {
          const key = features.defense === "barbarian" ? "con" : "wis";
          baseAc += modifiers[key];
          acFormula += ` + (${modifiers[key]}) ${key === "con" ? "Телосложение" : "Мудрость"}`;
        }
      }
      if (armor.length && style("defense")) {
        baseAc += 1;
        acFormula += " + 1 Оборона";
      }
      if (shields[0]) {
        if (trainedWith(character, shields[0])) {
          const shield = shields[0],
            value =
              shield.combat.base +
              (magic(shield) ? shield.combat.bonus || 0 : 0);
          baseAc += value;
          acFormula += ` + ${value} щит`;
        } else
          warnings.push(
            "Нет владения щитом: его прибавка к КД не применяется.",
          );
      }
    }
  }
  for (const item of armor) {
    if (!trainedWith(character, item))
      warnings.push(
        `${item.name}: нет владения — помеха проверкам d20 Силы/Ловкости, нельзя накладывать заклинания.`,
      );
    if (item.combat.stealth) warnings.push(`${item.name}: помеха Скрытности.`);
    if (character.stats[0] < (item.combat.strength || 0))
      warnings.push(
        `${item.name}: недостаточно Силы, скорость снижена на 10 футов.`,
      );
  }
  const attacks = equipped
    .filter((i) => i.combat.kind === "weapon")
    .map((item) => {
      const w = item.combat;
      const ability =
        w.properties.includes("finesse") || (monkActive && monkWeapon(w))
          ? modifiers.dex > modifiers.str
            ? "dex"
            : "str"
          : w.mode === "ranged"
            ? "dex"
            : "str";
      const trained = trainedWith(character, item);
      const attackBonus = magic(item) ? w.attackBonus || 0 : 0,
        damageBonus = magic(item) ? w.damageBonus || 0 : 0;
      const notes = [];
      const styleAttack = style("archery") && w.mode === "ranged" ? 2 : 0;
      const twoHands = w.properties.includes("twoHanded") || w.grip === "two";
      const damage = twoHands && w.versatile ? w.versatile : w.damage;
      const greatWeapon =
        style("greatWeapon") &&
        w.mode === "melee" &&
        twoHands &&
        (w.properties.includes("twoHanded") || !!w.versatile);
      if (greatWeapon)
        notes.push(
          "Бой большим оружием: при броске урона значения 1 и 2 на костях можно считать за 3.",
        );
      const extraLight =
        w.properties.includes("light") &&
        !twoHands &&
        !shields.length &&
        weapons.some(
          (other) =>
            other.id !== item.id &&
            other.combat.properties.includes("light") &&
            !other.combat.properties.includes("twoHanded") &&
            other.combat.grip !== "two",
        );
      if (extraLight)
        notes.push(
          "Дополнительная атака лёгким оружием требует атаки другим лёгким оружием в свой ход; действие и порядок контролирует мастер.",
        );
      if (monkActive && monkWeapon(w))
        notes.push(
          `Боевые искусства: можно заменить кости урона на ${monkDie}.`,
        );
      if (
        w.properties.includes("heavy") &&
        character.stats[w.mode === "ranged" ? 1 : 0] < 13
      )
        notes.push(
          "Помеха: тяжёлое оружие требует 13 в " +
            (w.mode === "ranged" ? "Ловкости" : "Силе") +
            ".",
        );
      if (twoHands && shields.length)
        notes.push("Для атаки нужны две руки: щит мешает.");
      if (w.properties.includes("loading"))
        notes.push(
          "Перезарядка: ограничение числа выстрелов проверяет мастер.",
        );
      if (w.properties.includes("ammunition"))
        notes.push("Боеприпасы учитываются вручную.");
      if (item.requiresAttunement && !item.attuned)
        notes.push("Без настройки: магические прибавки не действуют.");
      return {
        id: item.id,
        name: item.name,
        ability,
        trained,
        abilityModifier: modifiers[ability],
        proficiencyBonus: trained ? proficiency : 0,
        attackBonus,
        styleAttack,
        attack:
          modifiers[ability] +
          (trained ? proficiency : 0) +
          attackBonus +
          styleAttack,
        damage,
        extraLightDamageModifier: extraLight
          ? (style("twoWeapon")
              ? modifiers[ability]
              : Math.min(0, modifiers[ability])) + damageBonus
          : undefined,
        monkDamage: monkActive && monkWeapon(w) ? monkDie : undefined,
        damageDieMinimum: greatWeapon ? 3 : undefined,
        damageModifier: modifiers[ability] + damageBonus,
        damageType: w.damageType,
        versatile: twoHands ? undefined : w.versatile,
        range: w.range,
        mastery: w.mastery,
        notes,
      };
    });
  if (features.monkLevel > 0) {
    const ability = monkActive && modifiers.dex > modifiers.str ? "dex" : "str";
    attacks.push({
      id: "unarmed",
      name: "Безоружный удар",
      ability,
      trained: true,
      abilityModifier: modifiers[ability],
      proficiencyBonus: proficiency,
      attackBonus: 0,
      styleAttack: 0,
      attack: modifiers[ability] + proficiency,
      damage: monkActive ? monkDie : "1",
      damageModifier: modifiers[ability],
      damageType: "bludgeoning",
      notes: [
        monkActive
          ? "Боевые искусства активны. Захват и толчок: Сл " +
            (8 + proficiency + modifiers[ability]) +
            "."
          : "Боевые искусства не действуют; обычный безоружный удар.",
      ],
    });
  }
  return { baseAc, acFormula, automatic, warnings, attacks };
}
