import { Character } from "./model";
export const formatWeight = (grams: number) =>
  `${new Intl.NumberFormat("ru", { maximumFractionDigits: 3 }).format(grams / 1000)} кг`;
export function WeightField({
  value,
  change,
}: {
  value?: number;
  change: (grams: number | undefined) => void;
}) {
  return (
    <label>
      Вес одной единицы, кг
      <input
        type="number"
        min={0}
        max={1000000}
        step={0.001}
        value={value === undefined ? "" : value / 1000}
        onInput={(e) =>
          change(
            e.currentTarget.value === ""
              ? undefined
              : Math.round(Number(e.currentTarget.value) * 1000),
          )
        }
        placeholder="Не указан"
      />
      <small>
        Пустое поле — вес неизвестен. 0 — невесомый предмет. Точность до 1 г.
      </small>
      {value !== undefined && (
        <button type="button" onClick={() => change(undefined)}>
          Очистить вес
        </button>
      )}
    </label>
  );
}
export function CarryWeight({ character }: { character: Character }) {
  const weight = character.derived?.inventoryWeight;
  if (!weight) return null;
  return (
    <div className="panel resource-section">
      <h3>
        {weight.unknownItems
          ? "Известный вес инвентаря"
          : "Общий вес инвентаря"}
        : {formatWeight(weight.knownGrams)}
      </h3>
      {weight.unknownItems > 0 && (
        <p>
          Сумма неполная. Без указанного веса: позиций — {weight.unknownItems},
          единиц — {weight.unknownUnits}.
        </p>
      )}
      <p className="muted">
        Учтено количество всех предметов, включая экипированные. Предел
        переноски, вес содержимого контейнеров и особые свойства сумок мастер
        проверяет отдельно.
      </p>
    </div>
  );
}
