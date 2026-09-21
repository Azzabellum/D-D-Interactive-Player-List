// SRD 5.2.1, pp. 5–9, 13, 22. See docs/RULES.md for scope and attribution.
import { calculateCombat } from "./combat.mjs";
import { inventoryWeight } from "./inventory.mjs";
export const abilities = ["str", "dex", "con", "int", "wis", "cha"];
import skillCatalog from "../shared/skills.json" with { type: "json" };
export const skills = skillCatalog;
export function calculateRules(character) {
  const adjustments = [
    ...(character.adjustments || []).filter((a) => a.enabled),
    ...(character.items || [])
      .filter(
        (item) => item.equipped && (!item.requiresAttunement || item.attuned),
      )
      .flatMap((item) =>
        (item.effects || []).map((effect) => ({
          id: `item:${item.id}:${effect.target}`,
          source: `Предмет: ${item.name}`,
          target: effect.target,
          value: effect.value,
          enabled: true,
        })),
      ),
  ];
  const extra = (target) =>
    adjustments
      .filter((a) => a.target === target)
      .reduce((sum, a) => sum + a.value, 0);
  const level = character.level ?? 1;
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const modifiers = Object.fromEntries(
    abilities.map((key, i) => [key, Math.floor((character.stats[i] - 10) / 2)]),
  );
  const combat = calculateCombat(character, modifiers, proficiency);
  const skillResults = skills.map((skill) => {
    const backgroundTrained =
      character.backgroundTrainingEnabled !== false &&
      character.backgroundTraining?.skills.includes(skill.id);
    const classTrained =
      character.classTrainingEnabled !== false &&
      character.classTraining?.skills.includes(skill.id);
    const expert =
      character.classTrainingEnabled !== false &&
      character.classTraining?.expertise?.includes(skill.id) &&
      (classTrained ||
        backgroundTrained ||
        (character.skillRanks?.[skill.id] ?? 0) > 0);
    const rank = Math.max(
      expert ? 2 : 0,
      character.skillRanks?.[skill.id] ?? 0,
      backgroundTrained ? 1 : 0,
      character.classTrainingEnabled !== false &&
        character.classTraining?.skills.includes(skill.id)
        ? 1
        : 0,
    );
    const base = modifiers[skill.ability];
    const bonus = rank * proficiency;
    return {
      ...skill,
      rank,
      base,
      bonus,
      adjustment: extra(`skill:${skill.id}`),
      total: base + bonus + extra(`skill:${skill.id}`),
    };
  });
  return {
    version: "srd-5.2.1-core-1",
    proficiency,
    modifiers,
    inventoryWeight: inventoryWeight(character.items),
    adjustments,
    combat,
    ac: combat.baseAc + extra("ac"),
    skills: skillResults,
    saves: abilities.map((ability) => {
      const trained =
        !!character.saveProficiencies?.includes(ability) ||
        (character.classTrainingEnabled !== false &&
          !!character.classTraining?.saves.includes(ability));
      const base = modifiers[ability];
      const bonus = trained ? proficiency : 0;
      return {
        ability,
        trained,
        base,
        bonus,
        adjustment: extra(`save:${ability}`),
        total: base + bonus + extra(`save:${ability}`),
      };
    }),
    initiative: modifiers.dex + extra("initiative"),
    passivePerception:
      10 + skillResults.find((s) => s.id === "perception").total,
  };
}
