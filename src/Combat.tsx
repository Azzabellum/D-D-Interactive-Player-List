import { Character, Item, CombatProfile, signed } from "./model";
import catalogue from "../shared/combat-equipment.json";
import { StatTags } from "./Appearance";
const properties: Record<string, string> = {
  finesse: "Фехтовальное",
  light: "Лёгкое",
  heavy: "Тяжёлое",
  twoHanded: "Двуручное",
  thrown: "Метательное",
  ammunition: "Боеприпасы",
  loading: "Перезарядка",
  reach: "Досягаемость",
};
const damageTypes: Record<string, string> = {
  bludgeoning: "дробящий",
  piercing: "колющий",
  slashing: "рубящий",
};
const categories: Record<string, string> = {
  simple: "Простое",
  martial: "Воинское",
  light: "Лёгкий доспех",
  medium: "Средний доспех",
  heavy: "Тяжёлый доспех",
  shield: "Щит",
};
export function CombatSummary({ item }: { item: Item }) {
  const c = item.combat;
  if (!c) return null;
  return (
    <div className="ability-description">
      {c.kind === "weapon" ? (
        <>
          <p>
            {categories[c.category]} оружие · {c.damage}{" "}
            {damageTypes[c.damageType]} ·{" "}
            {c.mode === "melee" ? "ближний бой" : "дальний бой"}.
          </p>
          <p>
            {c.properties.map((p) => properties[p]).join(", ")}
            {c.versatile ? ` · Универсальное: ${c.versatile}` : ""}
            {c.range ? ` · Дальность: ${c.range} футов` : ""}
          </p>
          {c.mastery && (
            <p>
              Свойство мастерства: {c.mastery} (доступ и применение проверяет
              мастер).
            </p>
          )}
        </>
      ) : (
        <p>
          {categories[c.category]} ·{" "}
          {c.category === "shield" ? "Прибавка к КД" : "База КД"}: {c.base}
          {c.category === "light"
            ? " + Ловкость"
            : c.category === "medium"
              ? " + Ловкость (максимум +2)"
              : ""}
          {c.bonus ? `; магическая прибавка ${signed(c.bonus)}` : ""}
          {c.stealth ? "; помеха Скрытности" : ""}
          {c.strength ? `; Сила ${c.strength}` : ""}.
        </p>
      )}
    </div>
  );
}
export function CombatEditor({
  item,
  change,
}: {
  item: Item;
  change: (i: Item) => void;
}) {
  const c = item.combat;
  const update = (patch: Record<string, unknown>) =>
    change({ ...item, combat: { ...c, ...patch } as CombatProfile });
  const number = (
    label: string,
    key: string,
    value: number,
    min = -10,
    max = 10,
  ) => (
    <label>
      {label}
      <input
        required
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <fieldset>
      <legend>Боевые свойства</legend>
      <label>
        Взять профиль из справочника
        <select
          value=""
          onChange={(e) => {
            const profile = catalogue.find((p) => p.id === e.target.value);
            if (profile)
              change({
                ...item,
                combat: structuredClone(profile.combat) as CombatProfile,
                weightGrams: profile.weightGrams,
              });
          }}
        >
          <option value="">Выберите оружие или доспех</option>
          {catalogue.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Профиль заменяет боевые поля и вес. Название, описание и числовые
        эффекты сохраняются. Не повторяйте бонус доспеха или щита в эффектах КД.
      </p>
      <label>
        Вид боевого профиля
        <select
          value={c?.kind || ""}
          onChange={(e) =>
            change({
              ...item,
              combat:
                e.target.value === "weapon"
                  ? {
                      kind: "weapon",
                      category: "simple",
                      mode: "melee",
                      damage: "1d6",
                      damageType: "bludgeoning",
                      properties: [],
                    }
                  : e.target.value === "armor"
                    ? { kind: "armor", category: "light", base: 11 }
                    : undefined,
              combatProficiency: undefined,
            })
          }
        >
          <option value="">Без профиля</option>
          <option value="weapon">Оружие</option>
          <option value="armor">Доспех или щит</option>
        </select>
      </label>
      {c && (
        <>
          <label>
            Владение этим предметом
            <select
              value={
                item.combatProficiency === undefined
                  ? "auto"
                  : item.combatProficiency
                    ? "yes"
                    : "no"
              }
              onChange={(e) =>
                change({
                  ...item,
                  combatProficiency:
                    e.target.value === "auto"
                      ? undefined
                      : e.target.value === "yes",
                })
              }
            >
              <option value="auto">По классовым владениям</option>
              <option value="yes">Мастер подтверждает владение</option>
              <option value="no">Нет владения</option>
            </select>
          </label>
          <label>
            Категория
            <select
              value={c.category}
              onChange={(e) => update({ category: e.target.value })}
            >
              {(c.kind === "weapon"
                ? ["simple", "martial"]
                : ["light", "medium", "heavy", "shield"]
              ).map((k) => (
                <option key={k} value={k}>
                  {categories[k]}
                </option>
              ))}
            </select>
          </label>
          {c.kind === "weapon" ? (
            <>
              <label>
                Тип атаки
                <select
                  value={c.mode}
                  onChange={(e) => update({ mode: e.target.value })}
                >
                  <option value="melee">Ближний бой</option>
                  <option value="ranged">Дальний бой</option>
                </select>
              </label>
              <label>
                Хват оружия
                <select
                  value={
                    c.grip ||
                    (c.properties.includes("twoHanded") ? "two" : "one")
                  }
                  disabled={c.properties.includes("twoHanded")}
                  onChange={(e) => update({ grip: e.target.value })}
                >
                  <option value="one">Одна рука</option>
                  <option value="two">Две руки</option>
                </select>
              </label>
              <label>
                Кости урона
                <input
                  required
                  pattern="([1-9]|[1-9][0-9]?d(4|6|8|10|12|20))"
                  value={c.damage}
                  onChange={(e) => update({ damage: e.target.value })}
                />
              </label>
              <label>
                Тип урона
                <select
                  value={c.damageType}
                  onChange={(e) => update({ damageType: e.target.value })}
                >
                  {Object.entries(damageTypes).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Урон двумя руками (универсальное)
                <input
                  pattern="([1-9]|[1-9][0-9]?d(4|6|8|10|12|20))"
                  value={c.versatile || ""}
                  onChange={(e) =>
                    update({ versatile: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                Дальность, футы
                <input
                  maxLength={30}
                  placeholder="20/60"
                  value={c.range || ""}
                  onChange={(e) =>
                    update({ range: e.target.value || undefined })
                  }
                />
              </label>
              <label>
                Свойство мастерства
                <input
                  maxLength={40}
                  value={c.mastery || ""}
                  onChange={(e) =>
                    update({ mastery: e.target.value || undefined })
                  }
                />
              </label>
              <div className="form-grid">
                {Object.entries(properties).map(([key, name]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={c.properties.includes(key)}
                      onChange={(e) =>
                        update({
                          properties: e.target.checked
                            ? [...c.properties, key]
                            : c.properties.filter((p) => p !== key),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
              {number(
                "Магическая прибавка к атаке",
                "attackBonus",
                c.attackBonus || 0,
              )}
              {number(
                "Магическая прибавка к урону",
                "damageBonus",
                c.damageBonus || 0,
              )}
            </>
          ) : (
            <>
              {number(
                c.category === "shield"
                  ? "Прибавка щита к КД"
                  : "База доспеха без Ловкости",
                "base",
                c.base,
                0,
                30,
              )}
              {number("Магическая прибавка к КД", "bonus", c.bonus || 0)}
              {number(
                "Требование Силы (0 — нет)",
                "strength",
                c.strength || 0,
                0,
                30,
              )}
              <label>
                <input
                  type="checkbox"
                  checked={c.stealth || false}
                  onChange={(e) => update({ stealth: e.target.checked })}
                />
                Помеха Скрытности
              </label>
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
export function CombatResults({ character }: { character: Character }) {
  const combat = character.derived?.combat;
  if (!combat) return null;
  return (
    <section className="panel">
      <h2>Оружие и защита</h2>
      <p>
        {combat.automatic ? "КД по экипировке" : "Ручной КД"}:{" "}
        {combat.acFormula} = {combat.baseAc}. Итог с поправками:{" "}
        {character.derived?.ac}.
      </p>
      {combat.warnings.map((w, i) => (
        <p className="notice warning" key={i}>
          {w}
        </p>
      ))}
      {!combat.attacks.length && (
        <p>Экипируйте оружие с боевым профилем, чтобы увидеть атаки.</p>
      )}
      <div className="rules-grid">
        {combat.attacks.map((a) => (
          <article className="rule-result" key={a.id}>
            <h3>{a.name}</h3>
            <StatTags tags={[a.ability]} />
            <strong>Атака {signed(a.attack)}</strong>
            <p>
              {signed(a.abilityModifier)} характеристика + {a.proficiencyBonus}{" "}
              мастерство + ({a.attackBonus}) магия + {a.styleAttack || 0} стиль
              {a.trained ? "" : " · без владения"}.
            </p>
            <p>
              Урон: {a.damage} {signed(a.damageModifier)}{" "}
              {damageTypes[a.damageType]}.
            </p>
            {a.extraLightDamageModifier !== undefined && (
              <p>
                Дополнительная атака лёгким оружием: {a.damage}{" "}
                {signed(a.extraLightDamageModifier)}.
              </p>
            )}
            {a.monkDamage && (
              <p>
                Вариант боевых искусств: {a.monkDamage}{" "}
                {signed(a.damageModifier)}.
              </p>
            )}
            {a.versatile && (
              <p>
                Двумя руками: {a.versatile} {signed(a.damageModifier)}.
              </p>
            )}
            {a.range && (
              <p>
                Дальность: {a.range} футов; помеху на дальней дистанции
                проверяет мастер.
              </p>
            )}
            {a.mastery && (
              <p>
                Мастерство: {a.mastery}; требуется соответствующая особенность.
              </p>
            )}
            {a.notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </article>
        ))}
      </div>
      <p>
        Обычная атака оружием; для фехтовального выбирается больший модификатор
        Силы или Ловкости. Включённые мастером боевые искусства и стили
        учитываются по условиям экипировки. Критические попадания и свойства
        мастерства пока применяет мастер. Броски и расход боеприпасов
        выполняются вручную.
      </p>
    </section>
  );
}
