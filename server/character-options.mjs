import { combatSchema } from "./combat.mjs";
import skills from "../shared/skills.json" with { type: "json" };
import { z } from "zod";
import defaults from "../shared/character-options.json" with { type: "json" };
const names = (max) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .refine((v) => new Set(v).size === v.length);
export const equipmentSchema = z
  .object({
    weapons: names(20),
    armor: names(20),
    tools: names(20),
    toolChoice: z
      .object({ count: z.number().int().min(1).max(3), options: names(40) })
      .strict()
      .refine((v) => v.options.length >= v.count)
      .optional(),
  })
  .strict();
export const kinds = ["species", "class", "background"];
export const optionSchema = z
  .object({
    id: z.string().min(1).max(100),
    kind: z.enum(kinds),
    name: z.string().trim().min(1).max(60),
    summary: z.string().trim().min(1).max(250),
    description: z.string().trim().min(1).max(12000),
    source: z.string().trim().max(300),
    archived: z.boolean(),
    hitDie: z
      .union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)])
      .optional(),
    firstLevelHpBonus: z.number().int().min(0).max(20).optional(),
    startingGold: z.number().int().min(0).max(10000).optional(),
    startingPacks: z
      .array(
        z
          .object({
            id: z
              .string()
              .min(1)
              .max(80)
              .refine((v) => v !== "gold"),
            name: z.string().trim().min(1).max(80),
            gold: z.number().int().min(0).max(10000),
            items: z
              .array(
                z
                  .object({
                    name: z.string().trim().min(1).max(80),
                    combat: combatSchema.optional(),
                    weightGrams: z
                      .number()
                      .int()
                      .min(0)
                      .max(1000000000)
                      .optional(),
                    quantity: z.number().int().min(1).max(1000),
                  })
                  .strict(),
              )
              .max(30),
            toolOptions: names(40).optional(),
            useClassTool: z.boolean().optional(),
            useBackgroundTool: z.boolean().optional(),
          })
          .strict(),
      )
      .max(5)
      .refine((v) => new Set(v.map((p) => p.id)).size === v.length)
      .optional(),
    classRules: z
      .object({
        equipment: equipmentSchema.optional(),
        count: z.number().int().min(1).max(4),
        expertiseCount: z.number().int().min(0).max(2).optional(),
        skills: z
          .array(z.enum(skills.map((s) => s.id)))
          .min(1)
          .max(18)
          .refine((v) => new Set(v).size === v.length),
        saves: z
          .array(z.enum(["str", "dex", "con", "int", "wis", "cha"]))
          .length(2)
          .refine((v) => new Set(v).size === 2),
      })
      .strict()
      .refine((v) => v.skills.length >= v.count)
      .optional(),
    trainedSkills: z
      .array(z.enum(skills.map((s) => s.id)))
      .length(2)
      .refine((v) => new Set(v).size === 2)
      .optional(),
    toolOptions: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(20)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    boostAbilities: z
      .array(z.number().int().min(0).max(5))
      .length(3)
      .refine((v) => new Set(v).size === 3)
      .optional(),
  })
  .strict()
  .refine(
    (c) => !c.startingPacks || c.kind !== "species",
    "Наборы доступны классам и происхождениям",
  )
  .refine(
    (c) =>
      !c.startingPacks?.some(
        (p) =>
          (p.useBackgroundTool && c.kind !== "background") ||
          (p.useClassTool && c.kind !== "class") ||
          (c.kind === "background" && !!p.toolOptions?.length),
      ),
    "Неверный источник инструмента набора",
  )
  .refine(
    (c) => c.hitDie === undefined || c.kind === "class",
    "Кость хитов доступна классам",
  )
  .refine(
    (c) => c.startingGold === undefined || c.kind !== "species",
    "Золото доступно классам и происхождениям",
  )
  .refine(
    (c) => !c.classRules || c.kind === "class",
    "Классовые владения доступны только классам",
  )
  .refine(
    (c) =>
      (!c.boostAbilities && !c.trainedSkills && !c.toolOptions) ||
      c.kind === "background",
    "Прибавки доступны только происхождениям",
  );
export const choicesSchema = z
  .object({
    species: z.string().max(100),
    class: z.string().max(100),
    background: z.string().max(100),
  })
  .strict();
export function mergeOptions(custom) {
  return [...new Map([...defaults, ...custom].map((c) => [c.id, c])).values()];
}
export function resolveChoices(choices, cards, previous) {
  const selected = {};
  for (const kind of kinds) {
    const card = cards.find((c) => c.id === choices[kind] && c.kind === kind);
    if (!card || (card.archived && previous?.originChoices?.[kind] !== card.id))
      throw Object.assign(
        new Error("Выбранная карточка недоступна. Проверьте выбор в каталоге."),
        { statusCode: 400 },
      );
    selected[kind] =
      previous?.originChoices?.[kind] === card.id
        ? (previous.originCards?.[kind] ?? card)
        : card;
  }
  return {
    species: selected.species.name,
    cls: selected.class.name,
    background: selected.background.name,
    originCards: selected,
  };
}
