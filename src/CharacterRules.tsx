import { CombatFeaturesEditor } from "./CombatFeatures";
import { useState } from "react";
import { Character, signed, statNames } from "./model";
import { StatTags, statKeys } from "./Appearance";
import { AdjustmentSources } from "./Adjustments";

export function RuleResults({ character }: { character: Character }) {
  const rules = character.derived;
  if (!rules) return <p>Расчёты появятся после обновления данных с сервера.</p>;
  return (
    <section className="panel rules-results">
      <h2>Навыки и спасброски</h2>
      {!character.rulesConfigured && (
        <p className="notice warning">
          Мастер ещё не проверил характеристики и владения. Пока учтены только
          имеющиеся значения.
        </p>
      )}
      <p>
        Базовый расчёт по SRD 5.2.1 с включёнными мастером числовыми поправками.
      </p>
      <div className="inventory-status">
        <span>
          Инициатива: {signed(rules.initiative)} · база{" "}
          {signed(rules.modifiers.dex)} (Ловкость)
          <AdjustmentSources character={character} target="initiative" />
        </span>
        <span>Пассивная внимательность: {rules.passivePerception}</span>
      </div>
      <h3>Спасброски</h3>
      <div className="rules-grid">
        {rules.saves.map((save) => (
          <div className="rule-result" key={save.ability}>
            <StatTags tags={[save.ability]} />
            <strong>{signed(save.total)}</strong>
            <small>
              {signed(save.base)} характеристика{" "}
              {save.trained ? `+ ${save.bonus} мастерство` : "· без владения"}
            </small>
            <AdjustmentSources
              character={character}
              target={`save:${save.ability}`}
            />
          </div>
        ))}
      </div>
      <h3>Навыки</h3>
      <div className="rules-grid">
        {rules.skills.map((skill) => (
          <div className="rule-result" key={skill.id}>
            <span>{skill.name}</span>
            {character.classTrainingEnabled !== false &&
              character.classTraining?.skills.includes(skill.id) && (
                <small>Владение: {character.classTraining.source}</small>
              )}
            {character.backgroundTrainingEnabled !== false &&
              character.backgroundTraining?.skills.includes(skill.id) && (
                <small>Владение: {character.backgroundTraining.source}</small>
              )}
            <strong>{signed(skill.total)}</strong>
            <StatTags tags={[skill.ability]} />
            <small>
              {signed(skill.base)} характеристика{" "}
              {skill.rank
                ? `+ ${skill.bonus} ${skill.rank === 2 ? "экспертиза" : "мастерство"}`
                : "· без владения"}
            </small>
            <AdjustmentSources
              character={character}
              target={`skill:${skill.id}`}
            />
          </div>
        ))}
      </div>
      {character.rulesNote && (
        <p className="ability-description">
          Пояснение мастера: {character.rulesNote}
        </p>
      )}
      <p className="muted">
        Преимущества и помехи не автоматизированы. Пассивная внимательность: 10
        + итоговый навык с включёнными поправками. Ситуативную поправку мастер
        включает только на время её применения.
      </p>
      <a
        href="https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf"
        target="_blank"
        rel="noreferrer"
      >
        Источник: SRD 5.2.1
      </a>
      <details>
        <summary>Лицензия и адаптация</summary>
        <p>
          This work includes material from the System Reference Document 5.2.1
          (“SRD 5.2.1”) by Wizards of the Coast LLC, available at
          https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the
          Creative Commons Attribution 4.0 International License, available at
          https://creativecommons.org/licenses/by/4.0/legalcode.
        </p>
        <p>
          Русские названия и программные расчёты адаптированы для D&D IPL. Это
          ограниченный набор механик.
        </p>
      </details>
    </section>
  );
}

export function CharacterRulesEditor({
  character,
  busy,
  save,
}: {
  character: Character;
  busy: boolean;
  save: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [values, setValues] = useState({
    level: character.level ?? 1,
    stats: [...character.stats],
    hp: character.hp,
    maxHp: character.maxHp,
    ac: character.ac,
    acMode: character.acMode || "manual",
    combatFeatures: character.combatFeatures || {
      defense: "standard" as const,
      styles: [],
      monkLevel: 0,
    },
    skillRanks: { ...character.skillRanks },
    backgroundTrainingEnabled: character.backgroundTrainingEnabled !== false,
    classTrainingEnabled: character.classTrainingEnabled !== false,
    saveProficiencies: [...(character.saveProficiencies || [])],
    rulesNote: character.rulesNote || "",
  });
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (values.hp > values.maxHp) {
          setError(
            "Текущие хиты выше нового максимума. Укажите оба значения явно.",
          );
          return;
        }
        if (!(await save(values)))
          setError(
            "Изменения не сохранены. Значения остаются в форме. При конфликте скопируйте их и откройте форму заново.",
          );
      }}
    >
      <span className="eyebrow">{character.name}</span>
      <h2>Параметры персонажа</h2>
      <p className="muted">
        Выборы проверяет мастер. Изменение уровня не выдаёт классовые
        способности и не повышает здоровье автоматически. Все поля и пояснение
        видны игроку.
      </p>
      <label>
        Уровень
        <input
          required
          type="number"
          min={1}
          max={20}
          step={1}
          value={values.level}
          onChange={(e) =>
            setValues({ ...values, level: Number(e.target.value) })
          }
        />
      </label>
      <h3>Характеристики</h3>
      <div className="rules-grid">
        {statNames.map((name, index) => (
          <label key={name} className={`stat-${statKeys[index]}`}>
            {name}
            <input
              required
              type="number"
              min={1}
              max={30}
              step={1}
              value={values.stats[index]}
              onChange={(e) =>
                setValues({
                  ...values,
                  stats: values.stats.map((n, i) =>
                    i === index ? Number(e.target.value) : n,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
      <h3>Здоровье и базовая защита</h3>
      {(
        [
          ["hp", "Текущие хиты", 0, 10000],
          ["maxHp", "Максимальные хиты", 1, 10000],
          ["ac", "Базовый класс доспеха (без поправок)", 0, 100],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            required
            type="number"
            min={min}
            max={max}
            step={1}
            value={values[key]}
            onChange={(e) =>
              setValues({ ...values, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <p className="muted">
        Изменение Телосложения не пересчитывает хиты: укажите новый максимум и
        текущее значение самостоятельно.
      </p>
      <label>
        Расчёт КД
        <select
          value={values.acMode}
          onChange={(e) =>
            setValues({
              ...values,
              acMode: e.target.value as "manual" | "equipment",
            })
          }
        >
          <option value="manual">Ручная база мастера</option>
          <option value="equipment">По экипировке: доспех и щит</option>
        </select>
      </label>
      <p>
        Без доспеха: 10 + Ловкость. Классовую формулу выберите ниже; магические
        формулы пока задаются вручную. Числовые поправки к КД добавляются в
        обоих режимах.
      </p>
      <CombatFeaturesEditor
        value={values.combatFeatures}
        change={(combatFeatures) => setValues({ ...values, combatFeatures })}
      />
      <fieldset className="item-tags">
        <legend>Владение спасбросками</legend>
        {statKeys.map((key, i) => (
          <label key={key}>
            <input
              type="checkbox"
              aria-label={`Спасбросок: ${statNames[i]}`}
              checked={values.saveProficiencies.includes(key)}
              onChange={(e) =>
                setValues({
                  ...values,
                  saveProficiencies: e.target.checked
                    ? [...values.saveProficiencies, key]
                    : values.saveProficiencies.filter((k) => k !== key),
                })
              }
            />
            {statNames[i]}
          </label>
        ))}
      </fieldset>
      {character.classTraining && (
        <>
          <label>
            <input
              type="checkbox"
              checked={values.classTrainingEnabled}
              onChange={(e) =>
                setValues({ ...values, classTrainingEnabled: e.target.checked })
              }
            />{" "}
            Учитывать владения и экспертизу класса «
            {character.classTraining.source}»
          </label>
          <p>
            Источник добавляется к ручным владениям без удвоения бонуса. Для
            полного ручного управления отключите источник класса.
          </p>
        </>
      )}
      <h3>Владение навыками</h3>
      {character.backgroundTraining && (
        <label>
          <input
            type="checkbox"
            checked={values.backgroundTrainingEnabled}
            onChange={(e) =>
              setValues({
                ...values,
                backgroundTrainingEnabled: e.target.checked,
              })
            }
          />{" "}
          Учитывать владения происхождения «
          {character.backgroundTraining.source}»
        </label>
      )}
      {character.backgroundTraining && (
        <p>
          Поля ниже задают владения вручную. Активное происхождение добавляет
          свои навыки, но не повышает их до экспертизы. Для полного ручного
          управления снимите отметку выше.
        </p>
      )}

      <div className="rules-grid">
        {character.derived?.skills.map((skill) => (
          <label key={skill.id}>
            {skill.name}
            {character.backgroundTraining?.skills.includes(skill.id) &&
              values.backgroundTrainingEnabled &&
              " · есть владение от происхождения"}
            <select
              value={values.skillRanks[skill.id] ?? 0}
              onChange={(e) =>
                setValues({
                  ...values,
                  skillRanks: {
                    ...values.skillRanks,
                    [skill.id]: Number(e.target.value),
                  },
                })
              }
            >
              <option value={0}>Без владения</option>
              <option value={1}>Владение</option>
              <option value={2}>Экспертиза</option>
            </select>
          </label>
        ))}
      </div>
      <label>
        Пояснение мастера
        <textarea
          maxLength={1000}
          rows={3}
          value={values.rulesNote}
          onChange={(e) => setValues({ ...values, rulesNote: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Сохранение…" : "Сохранить параметры"}
      </button>
    </form>
  );
}
