import { z } from "zod";
const count = z.number().int().min(0).max(999);
export const resourceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["slot", "feature"]),
    level: z.number().int().min(1).max(9).optional(),
    max: count.refine((n) => n > 0),
    current: count,
    shortRest: count,
    longRest: count,
  })
  .strict()
  .refine(
    (r) => r.current <= r.max && r.shortRest <= r.max && r.longRest <= r.max,
    "Текущее значение и восстановление не могут превышать максимум",
  )
  .refine(
    (r) => (r.kind === "slot" ? r.level !== undefined : r.level === undefined),
    "Круг задаётся только для ячеек",
  );
export const resourcesSchema = z
  .array(resourceSchema)
  .max(50)
  .refine(
    (rs) => new Set(rs.map((r) => r.id)).size === rs.length,
    "Ресурсы повторяются",
  );
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("adjust"),
      resourceId: z.string().uuid(),
      delta: z.union([z.literal(-1), z.literal(1)]),
    })
    .strict(),
  z
    .object({ action: z.literal("rest"), rest: z.enum(["short", "long"]) })
    .strict(),
]);
export function applyResourceCommand(resources, input) {
  const values = resourcesSchema.parse(resources || []);
  const command = commandSchema.parse(input);
  if (command.action === "rest") {
    return {
      resources: values.map((r) => ({
        ...r,
        current: Math.min(
          r.max,
          r.current + (command.rest === "short" ? r.shortRest : r.longRest),
        ),
      })),
      title:
        command.rest === "short"
          ? "Короткий отдых: ресурсы"
          : "Долгий отдых: ресурсы",
      detail:
        "Восстановление по настройкам мастера; здоровье и другие показатели не менялись",
    };
  }
  const target = values.find((r) => r.id === command.resourceId);
  if (!target)
    throw Object.assign(new Error("Ресурс не найден"), { statusCode: 404 });
  if (
    target.current + command.delta < 0 ||
    target.current + command.delta > target.max
  )
    throw Object.assign(new Error("Достигнута граница ресурса"), {
      statusCode: 400,
    });
  return {
    resources: values.map((r) =>
      r.id === target.id ? { ...r, current: r.current + command.delta } : r,
    ),
    title: command.delta < 0 ? "Ресурс израсходован" : "Ресурс возвращён",
    detail: `${target.name}: ${target.current} → ${target.current + command.delta} / ${target.max}`,
  };
}
