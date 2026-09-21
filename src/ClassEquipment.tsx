import { EquipmentTraining } from "./model";

export function EquipmentSummary({
  equipment,
}: {
  equipment: EquipmentTraining;
}) {
  return (
    <div>
      <p>Оружие: {equipment.weapons.join(", ") || "нет"}.</p>
      <p>Доспехи и щиты: {equipment.armor.join(", ") || "нет"}.</p>
      <p>Инструменты класса: {equipment.tools.join(", ") || "нет"}.</p>
    </div>
  );
}

export function ClassEquipmentChoices({
  rules,
  selected,
  change,
}: {
  rules?: EquipmentTraining;
  selected: string[];
  change: (v: string[]) => void;
}) {
  if (!rules)
    return (
      <p>Оружие, доспехи и инструменты в этой версии карточки не настроены.</p>
    );
  return (
    <section>
      <h3>Оружие, доспехи и инструменты</h3>
      <EquipmentSummary equipment={rules} />
      {rules.toolChoice && (
        <>
          <p>
            Выберите инструментов: {rules.toolChoice.count}. Выбрано:{" "}
            {selected.length}.
          </p>
          <div className="form-grid">
            {rules.toolChoice.options.map((tool) => (
              <label key={tool}>
                <input
                  type="checkbox"
                  checked={selected.includes(tool)}
                  onChange={(e) =>
                    change(
                      e.target.checked
                        ? [...selected, tool]
                        : selected.filter((t) => t !== tool),
                    )
                  }
                />
                Инструмент класса: {tool}
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function EquipmentEditor({
  value,
  change,
}: {
  value?: EquipmentTraining;
  change: (v: EquipmentTraining | undefined) => void;
}) {
  return (
    <section>
      <h3>Оружие, доспехи и инструменты</h3>
      <label>
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) =>
            change(
              e.target.checked
                ? { weapons: [], armor: [], tools: [] }
                : undefined,
            )
          }
        />
        Настроить владения снаряжением
      </label>
      {value && (
        <>
          <p>
            По одному названию на строку, без повторов. Пустое поле означает
            отсутствие владений. Инструменты здесь не добавляют предметы в
            инвентарь.
          </p>
          {(
            [
              ["weapons", "Оружие"],
              ["armor", "Доспехи и щиты"],
              ["tools", "Фиксированные инструменты"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                value={value[key].join("\n")}
                onChange={(e) =>
                  change({
                    ...value,
                    [key]: e.target.value ? e.target.value.split("\n") : [],
                  })
                }
              />
            </label>
          ))}
          <label>
            Инструментов на выбор
            <select
              value={value.toolChoice?.count || 0}
              onChange={(e) =>
                change({
                  ...value,
                  toolChoice: Number(e.target.value)
                    ? {
                        count: Number(e.target.value),
                        options: value.toolChoice?.options || [],
                      }
                    : undefined,
                })
              }
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {value.toolChoice && (
            <label>
              Допустимые инструменты на выбор
              <textarea
                value={value.toolChoice.options.join("\n")}
                onChange={(e) =>
                  change({
                    ...value,
                    toolChoice: {
                      ...value.toolChoice!,
                      options: e.target.value ? e.target.value.split("\n") : [],
                    },
                  })
                }
              />
            </label>
          )}
        </>
      )}
    </section>
  );
}
