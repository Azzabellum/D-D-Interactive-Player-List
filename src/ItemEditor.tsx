import { CombatEditor } from "./Combat";
import { useState } from "react";
import { Item, statNames } from "./model";
import { StatTags, statKeys } from "./Appearance";
import effectTargets from "../shared/effect-targets.json";
import { WeightField } from "./Weight";

export function ItemEditor({
  item,
  busy,
  save,
}: {
  item: Item;
  busy: boolean;
  save: (item: Item) => Promise<boolean>;
}) {
  const [value, setValue] = useState(item);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const next = {
          ...value,
          name: value.name.trim(),
          type: value.type.trim(),
        };
        if (!next.name || !next.type) {
          setError("Заполните название и тип предмета.");
          return;
        }
        if (!(await save(next)))
          setError(
            "Не удалось сохранить. Проверьте уведомление. Введённый текст сохранён в форме; при конфликте скопируйте его и откройте редактор заново.",
          );
      }}
    >
      <span className="eyebrow">Библиотека мастера</span>
      <h2>Редактор предмета</h2>
      <p className="muted">
        Изменения шаблона не затронут уже выданные предметы.
      </p>
      <label>
        Название
        <input
          required
          maxLength={200}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <label>
        Тип
        <input
          required
          list="item-types"
          maxLength={200}
          value={value.type}
          onChange={(e) => setValue({ ...value, type: e.target.value })}
        />
      </label>
      <datalist id="item-types">
        {[
          "Оружие",
          "Доспех",
          "Расходуемое",
          "Чудесный предмет",
          "Снаряжение",
        ].map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      <label>
        Описание
        <textarea
          maxLength={4000}
          rows={4}
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Скрытое свойство
        <textarea
          maxLength={4000}
          rows={3}
          value={value.secret || ""}
          onChange={(e) => setValue({ ...value, secret: e.target.value })}
        />
      </label>
      <p className="muted">
        При выдаче скрытое свойство увидит только мастер. Раскрыть его можно в
        инвентаре персонажа.
      </p>
      <fieldset className="item-tags">
        <legend>Параметры экземпляра</legend>
        <label>
          <input
            type="checkbox"
            checked={value.requiresAttunement || false}
            onChange={(e) =>
              setValue({ ...value, requiresAttunement: e.target.checked })
            }
          />
          Требует настройки
        </label>
      </fieldset>
      <label>
        Максимум зарядов
        <input
          type="number"
          min={0}
          max={9999}
          step={1}
          required
          value={value.maxCharges || 0}
          onChange={(e) =>
            setValue({ ...value, maxCharges: Number(e.target.value) })
          }
        />
      </label>
      <CombatEditor
        item={value}
        change={(next) => setValue({ ...value, ...next })}
      />
      <WeightField
        value={value.weightGrams}
        change={(weightGrams) => setValue({ ...value, weightGrams })}
      />
      <p className="muted">
        0 — без зарядов. При выдаче предмет получает полный запас. Предметы с
        зарядами или настройкой выдаются по одному.
      </p>
      <fieldset className="item-tags">
        <legend>Связанные характеристики</legend>
        {statKeys.map((key, index) => (
          <label key={key}>
            <input
              type="checkbox"
              aria-label={statNames[index]}
              checked={value.tags?.includes(key) || false}
              onChange={(e) =>
                setValue({
                  ...value,
                  tags: e.target.checked
                    ? [...(value.tags || []), key]
                    : value.tags?.filter((tag) => tag !== key),
                })
              }
            />
            <StatTags tags={[key]} />
          </label>
        ))}
      </fieldset>
      <fieldset className="resource-fields" disabled={busy}>
        <legend>Числовые эффекты экипировки</legend>
        <p>
          Эффекты видны игроку. Они действуют при экипировке; если предмет
          требует настройки — только после неё. Значения складываются с базой и
          ручными поправками.
        </p>
        {(value.effects || []).map((effect, index) => (
          <div className="panel resource-edit" key={index}>
            <label>
              Цель эффекта
              <select
                value={effect.target}
                onChange={(e) =>
                  setValue({
                    ...value,
                    effects: value.effects!.map((v, i) =>
                      i === index ? { ...v, target: e.target.value } : v,
                    ),
                  })
                }
              >
                {effectTargets.map((t) => (
                  <option
                    key={t.id}
                    value={t.id}
                    disabled={value.effects?.some(
                      (v, i) => i !== index && v.target === t.id,
                    )}
                  >
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Значение эффекта
              <input
                required
                type="number"
                min={-30}
                max={30}
                step={1}
                value={effect.value}
                onChange={(e) =>
                  setValue({
                    ...value,
                    effects: value.effects!.map((v, i) =>
                      i === index ? { ...v, value: Number(e.target.value) } : v,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setValue({
                  ...value,
                  effects: value.effects!.filter((_, i) => i !== index),
                })
              }
            >
              Удалить эффект
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={(value.effects?.length || 0) >= effectTargets.length}
          onClick={() => {
            const target = effectTargets.find(
              (t) => !value.effects?.some((v) => v.target === t.id),
            );
            if (target)
              setValue({
                ...value,
                effects: [
                  ...(value.effects || []),
                  { target: target.id, value: 1 },
                ],
              });
          }}
        >
          Добавить эффект
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Сохранение…" : "Сохранить предмет"}
      </button>
    </form>
  );
}
