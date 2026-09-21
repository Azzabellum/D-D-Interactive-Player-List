import { z } from "zod";
import catalog from "../shared/starter.json" with { type: "json" };
const unique = (list) => new Set(list).size === list.length;
export const creationSchema = z
  .object({
    pack: z.literal(catalog.id),
    boosts: z
      .array(z.number().int().min(0).max(2))
      .length(3)
      .refine(
        (v) => v.reduce((a, b) => a + b, 0) === 3,
        "Распределите +2/+1 или +1/+1/+1 между Силой, Ловкостью и Телосложением",
      ),
    skills: z
      .array(z.enum(catalog.skills.map((s) => s.id)))
      .length(2)
      .refine(unique, "Выберите два разных навыка"),
    languages: z
      .array(z.enum(catalog.languages))
      .length(2)
      .refine(unique, "Выберите два разных языка"),
    gamingSet: z.enum(catalog.gamingSets),
    weapons: z
      .array(z.enum(catalog.weapons))
      .length(3)
      .refine(unique, "Выберите три разных вида оружия"),
  })
  .strict();

export function buildStarter(draft, previous = {}) {
  if (
    draft.species !== "Дварф" ||
    draft.cls !== "Воин" ||
    draft.background !== "Солдат"
  )
    throw Object.assign(
      new Error("Выборы не соответствуют стартовому шаблону"),
      { statusCode: 400 },
    );
  const choice = creationSchema.parse(draft.creation);
  const stats = draft.stats.map((score, i) => score + (choice.boosts[i] || 0));
  const maxHp = 11 + Math.floor((stats[2] - 10) / 2);
  const prefix = `starter:${draft.id}:`;
  const feature = (key, name, description, page, tags = []) => ({
    id: prefix + key,
    kind: "feature",
    name,
    description,
    source: `SRD 5.2.1, с. ${page}. Стартовый шаблон, уровень 1. Применение учитывает мастер.`,
    tags,
  });
  const abilities = [
    feature(
      "dwarf",
      "Дварф: основные свойства",
      "Гуманоид, средний размер; скорость 30 футов. Тёмное зрение 120 футов. Сопротивление урону ядом; преимущество на спасброски против получения или прекращения состояния «Отравлен».",
      84,
    ),
    feature(
      "toughness",
      "Дварфская стойкость",
      "Максимум хитов увеличен на 1 за уровень. При создании +1 уже учтён. При дальнейшем повышении уровня изменение вносит мастер.",
      84,
      ["con"],
    ),
    feature(
      "stone",
      "Чувство камня",
      "Бонусным действием: чувство вибрации 60 футов на 10 минут при нахождении на камне или касании каменной поверхности. Число применений равно бонусу мастерства (на первом уровне 2); восстановление после продолжительного отдыха.",
      84,
    ),
    feature(
      "wind",
      "Второе дыхание",
      "Бонусным действием восстановите 1к10 + уровень воина хитов. На первом уровне 2 применения. Короткий отдых восстанавливает одно применение, продолжительный — все.",
      48,
      ["con"],
    ),
    feature(
      "defense",
      "Боевой стиль: Оборона",
      "+1 к КД при ношении лёгкого, среднего или тяжёлого доспеха. Бонус не включён в стартовую защиту без доспехов; после экипировки его учитывает мастер.",
      88,
    ),
    feature(
      "savage",
      "Свирепый атакующий",
      "Один раз за ход при попадании оружием можно дважды бросить кости урона оружия и выбрать один из результатов.",
      87,
    ),
    feature(
      "mastery",
      "Мастерство оружия",
      `Выбраны: ${choice.weapons.join(", ")}. Доступны свойства мастерства этих видов оружия. После продолжительного отдыха можно заменить один выбор. Изменение и применение учитывает мастер.`,
      48,
    ),
    feature(
      "training",
      "Владения и языки",
      `Простое и воинское оружие; лёгкие, средние и тяжёлые доспехи, щиты. Инструмент: ${choice.gamingSet}. Языки: Общий, ${choice.languages.join(", ")}. Кость хитов: к10.`,
      "20, 47, 83",
    ),
  ];
  return {
    creation: choice,
    baseStats: [...draft.stats],
    stats,
    level: 1,
    hp: maxHp,
    maxHp,
    ac: 10 + Math.floor((stats[1] - 10) / 2),
    acSource: "starter",
    skillRanks: Object.fromEntries(
      ["athletics", "intimidation", ...choice.skills].map((s) => [s, 1]),
    ),
    saveProficiencies: ["str", "con"],
    rulesConfigured: true,
    rulesNote:
      "Старт SRD 5.2.1: хиты 10 + модификатор Телосложения + 1 (дварф); КД 10 + модификатор Ловкости без доспехов. Эффекты особенностей учитывает мастер.",
    items: [
      ...(previous.items || []).filter((i) => !i.id.startsWith(prefix)),
      {
        id: prefix + "gold",
        name: "Золотые монеты",
        type: "Валюта",
        description:
          "Стартовый выбор деньгами: 155 зм от воина и 50 зм от солдата. Покупки согласуйте с мастером.",
        revealed: true,
        quantity: 205,
      },
    ],
    abilities: [
      ...(previous.abilities || []).filter((a) => !a.id.startsWith(prefix)),
      ...abilities,
    ],
  };
}
