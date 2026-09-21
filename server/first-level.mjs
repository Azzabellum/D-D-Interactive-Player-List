import { buildInitialAssets } from "./initial-assets.mjs";
import skills from "../shared/skills.json" with { type: "json" };
import { z } from "zod";
import starter from "../shared/starter.json" with { type: "json" };
export const firstLevelSchema = z
  .object({
    calculateHp: z.boolean().optional(),
    classEquipment: z.string().min(1).max(80).optional(),
    equipmentTool: z.string().trim().min(1).max(80).optional(),
    backgroundGold: z.boolean().optional(),
    backgroundEquipment: z.string().min(1).max(80).optional(),
    expertise: z
      .array(z.enum(skills.map((s) => s.id)))
      .max(2)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    classSkills: z
      .array(z.enum(skills.map((s) => s.id)))
      .max(4)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    classTools: z
      .array(z.string().trim().min(1).max(80))
      .max(3)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    tool: z.string().trim().max(80).optional(),
    boosts: z
      .array(z.number().int().min(0).max(2))
      .length(6)
      .refine(
        (v) => v.reduce((a, b) => a + b, 0) === 3,
        "Нужны прибавки +2/+1 или +1/+1/+1",
      ),
    languages: z
      .array(z.enum(starter.languages))
      .length(2)
      .refine((v) => new Set(v).size === 2, "Выберите два разных языка"),
  })
  .strict();
export function buildFirstLevel(draft, previous = {}) {
  const choice = firstLevelSchema.parse(draft.firstLevel);
  const allowed = draft.originCards?.background?.boostAbilities;
  if (
    !draft.originChoices ||
    !allowed ||
    choice.boosts.some((v, i) => v && !allowed.includes(i))
  )
    throw Object.assign(
      new Error("Прибавки не соответствуют выбранному происхождению"),
      { statusCode: 400 },
    );
  const stats = draft.stats.map((v, i) => v + choice.boosts[i]);
  if (stats.some((v) => v > 20))
    throw Object.assign(new Error("Характеристика не может превысить 20"), {
      statusCode: 400,
    });
  const background = draft.originCards.background;
  const options = background.toolOptions || [];
  const tool = options.length === 1 ? options[0] : choice.tool;
  if (
    (options.length > 0 && !options.includes(tool)) ||
    (!options.length && choice.tool)
  )
    throw Object.assign(
      new Error("Выберите инструмент из списка происхождения"),
      { statusCode: 400 },
    );
  if (choice.classSkills === undefined && choice.expertise?.length)
    throw Object.assign(
      new Error("Экспертиза требует включённых владений класса"),
      { statusCode: 400 },
    );
  if (choice.classSkills === undefined && choice.classTools?.length)
    throw Object.assign(
      new Error("Инструменты требуют включённых владений класса"),
      { statusCode: 400 },
    );
  let classTraining;
  if (choice.classSkills !== undefined) {
    const card = draft.originCards.class,
      rules = card?.classRules;
    if (
      !rules ||
      choice.classSkills.length !== rules.count ||
      choice.classSkills.some(
        (id) =>
          !rules.skills.includes(id) || background.trainedSkills?.includes(id),
      )
    )
      throw Object.assign(
        new Error(
          "Выберите нужное число разных навыков класса, без повторов происхождения",
        ),
        { statusCode: 400 },
      );
    const expertise = choice.expertise || [];
    const trained = new Set([
      ...choice.classSkills,
      ...(background.trainedSkills || []),
    ]);
    if (
      expertise.length !== (rules.expertiseCount || 0) ||
      expertise.some((id) => !trained.has(id))
    )
      throw Object.assign(
        new Error(
          "Выберите экспертизу в нужном числе разных освоенных навыков",
        ),
        { statusCode: 400 },
      );
    const selectedTools = choice.classTools || [],
      equipment = rules.equipment;
    if (
      selectedTools.length !== (equipment?.toolChoice?.count || 0) ||
      selectedTools.some((t) => !equipment?.toolChoice?.options.includes(t))
    )
      throw Object.assign(
        new Error("Выберите нужное число разных инструментов класса из списка"),
        { statusCode: 400 },
      );
    classTraining = {
      ...(equipment
        ? {
            equipment: {
              weapons: equipment.weapons,
              armor: equipment.armor,
              tools: [...new Set([...equipment.tools, ...selectedTools])],
            },
          }
        : {}),
      expertise,
      skills: choice.classSkills,
      saves: rules.saves,
      source: card.name,
    };
  }
  return {
    ...buildInitialAssets(draft, choice, stats, previous),
    classTraining,
    firstLevel: { ...choice, tool },
    baseStats: [...draft.stats],
    stats,
    backgroundTraining: {
      skills: background.trainedSkills || [],
      tools: options.length ? [tool] : [],
      source: background.name,
    },
  };
}
