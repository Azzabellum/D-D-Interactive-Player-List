import { CombatEditor, CombatSummary } from "./Combat";
import { useState } from "react";
import { Item } from "./model";
import effectTargets from "../shared/effect-targets.json";
import { WeightField, formatWeight } from "./Weight";

export function InventoryStatus({ item }: { item: Item }) {
  return (
    <div className="inventory-status">
      <CombatSummary item={item} />
      <span>Количество: {item.quantity ?? 1}</span>
      <span>{item.equipped ? "Экипировано" : "В сумке"}</span>
      <span>
        {item.weightGrams === undefined
          ? "Вес не указан"
          : `Вес: ${formatWeight(item.weightGrams * (item.quantity ?? 1))} (${formatWeight(item.weightGrams)} за единицу)`}
      </span>
      {item.requiresAttunement && (
        <span>{item.attuned ? "Настроено" : "Требует настройки"}</span>
      )}
      {!!item.maxCharges && (
        <span>
          Заряды: {item.charges ?? 0} / {item.maxCharges}
        </span>
      )}
      {!!item.effects?.length && (
        <div>
          <span>
            {item.equipped && (!item.requiresAttunement || item.attuned)
              ? "Эффекты действуют"
              : "Эффекты не действуют"}
          </span>
          {item.effects.map((effect) => (
            <small className="adjustment-source" key={effect.target}>
              {effect.value > 0 ? "+" : ""}
              {effect.value} ·{" "}
              {effectTargets.find((t) => t.id === effect.target)?.name}
            </small>
          ))}
        </div>
      )}
    </div>
  );
}

export function InventoryEditor({
  item,
  busy,
  save,
}: {
  item: Item;
  busy: boolean;
  save: (item: Item, split?: boolean) => Promise<boolean>;
}) {
  const [value, setValue] = useState({
    ...item,
    quantity: item.quantity ?? 1,
    equipped: item.equipped ?? false,
    attuned: item.attuned ?? false,
    charges: item.charges ?? 0,
  });
  const [error, setError] = useState("");
  async function commit(split = false) {
    setError("");
    if (!(await save(value, split)))
      setError(
        "Изменения не сохранены. При конфликте закройте форму и откройте её заново; введённые значения пока остаются здесь.",
      );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await commit();
      }}
    >
      <span className="eyebrow">Инвентарь персонажа</span>
      <h2>{item.name}</h2>
      <CombatEditor
        item={value}
        change={(next) => setValue({ ...value, ...next })}
      />
      <WeightField
        value={value.weightGrams}
        change={(weightGrams) => setValue({ ...value, weightGrams })}
      />
      <label>
        Количество
        <input
          required
          type="number"
          min={1}
          max={
            value.equipped || value.requiresAttunement || value.maxCharges
              ? 1
              : 9999
          }
          step={1}
          value={value.quantity}
          onChange={(e) =>
            setValue({ ...value, quantity: Number(e.target.value) })
          }
        />
      </label>
      <div className="ability-checks">
        <label>
          <input
            type="checkbox"
            disabled={value.quantity !== 1}
            checked={value.equipped}
            onChange={(e) => setValue({ ...value, equipped: e.target.checked })}
          />
          Экипировано
        </label>
        {value.requiresAttunement && (
          <label>
            <input
              type="checkbox"
              checked={value.attuned}
              onChange={(e) =>
                setValue({ ...value, attuned: e.target.checked })
              }
            />
            Настроено на персонажа
          </label>
        )}
      </div>
      {item.quantity && item.quantity > 1 && (
        <>
          <p className="muted">
            Для отдельной экипировки отделите одну единицу от исходной стопки.
            Это действие сохранится сразу.
          </p>
          <button
            disabled={busy}
            type="button"
            onClick={async () => {
              setError("");
              if (!(await save(item, true)))
                setError(
                  "Не удалось разделить стопку. Обновите данные и повторите действие.",
                );
            }}
          >
            Отделить одну единицу
          </button>
        </>
      )}
      {!!value.maxCharges && (
        <>
          <label>
            Текущие заряды
            <input
              required
              type="number"
              min={0}
              max={value.maxCharges}
              step={1}
              value={value.charges}
              onChange={(e) =>
                setValue({ ...value, charges: Number(e.target.value) })
              }
            />
          </label>
          <p className="muted">
            Максимум: {value.maxCharges}. Восстановление учитывает мастер
            вручную.
          </p>
        </>
      )}
      <p className="muted">
        Настроенные числовые эффекты действуют при экипировке и необходимой
        настройке. Для полного изъятия используйте «Забрать» в инвентаре.
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy} type="submit">
        {busy ? "Сохранение…" : "Сохранить состояние"}
      </button>
    </form>
  );
}
