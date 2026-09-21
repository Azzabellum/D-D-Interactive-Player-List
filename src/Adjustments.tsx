import { useState } from "react";
import { Adjustment, Character, signed, statNames } from "./model";
import { statKeys } from "./Appearance";
import { useUnsavedChanges } from "./UnsavedChanges";

export function CharacterAdjustments({
  character,
  dm,
  busy,
  save,
}: {
  character: Character;
  dm: boolean;
  busy: boolean;
  save: (values: Adjustment[], version?: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{
    values: Adjustment[];
    version?: number;
  } | null>(null);
  const [values, setValues] = useState<Adjustment[]>([]);
  const [error, setError] = useState("");
  const requestLeave = useUnsavedChanges(
    !!editing && JSON.stringify(values) !== JSON.stringify(editing.values),
  );
  const targets = [
    { id: "ac", name: "Класс доспеха" },
    { id: "initiative", name: "Инициатива" },
    ...statKeys.map((key, i) => ({
      id: `save:${key}`,
      name: `Спасбросок: ${statNames[i]}`,
    })),
    ...(character.derived?.skills || []).map((s) => ({
      id: `skill:${s.id}`,
      name: s.name,
    })),
  ];
  const update = (id: string, patch: Partial<Adjustment>) =>
    setValues(values.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  return (
    <section className="panel resource-section">
      <div className="section-heading">
        <h2>Бонусы и штрафы</h2>
        {dm && !editing && (
          <button
            disabled={busy}
            onClick={() => {
              const next = structuredClone(character.adjustments || []);
              setValues(next);
              setEditing({ values: next, version: character.version });
              setError("");
            }}
          >
            Настроить поправки
          </button>
        )}
      </div>
      <p>
        Поправки суммируются с базовыми значениями. Мастер проверяет
        совместимость эффектов и включает их вручную. Названия источников видны
        игроку.
      </p>
      {!editing ? (
        <>
          {!character.adjustments?.length && (
            <p className="muted">Дополнительных поправок нет.</p>
          )}
          {character.adjustments?.map((a) => (
            <p key={a.id}>
              <strong>
                {signed(a.value)} ·{" "}
                {targets.find((t) => t.id === a.target)?.name}
              </strong>{" "}
              — {a.source} · {a.enabled ? "Действует" : "Выключено"}
            </p>
          ))}
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (await save(values, editing.version)) setEditing(null);
            else
              setError(
                "Не удалось сохранить. Правки остаются в форме. При конфликте скопируйте их и откройте актуальную версию заново.",
              );
          }}
        >
          <fieldset disabled={busy} className="resource-fields">
            {values.map((a) => (
              <div className="panel resource-edit" key={a.id}>
                <label>
                  Источник поправки
                  <input
                    required
                    maxLength={200}
                    value={a.source}
                    onChange={(e) => update(a.id, { source: e.target.value })}
                  />
                </label>
                <label>
                  К чему применяется
                  <select
                    value={a.target}
                    onChange={(e) => update(a.id, { target: e.target.value })}
                  >
                    {targets.map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Бонус или штраф
                  <input
                    required
                    type="number"
                    min={-30}
                    max={30}
                    step={1}
                    value={a.value}
                    onChange={(e) =>
                      update(a.id, { value: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) =>
                      update(a.id, { enabled: e.target.checked })
                    }
                  />{" "}
                  Поправка действует
                </label>
                <button
                  type="button"
                  onClick={() => setValues(values.filter((v) => v.id !== a.id))}
                >
                  Удалить поправку
                </button>
              </div>
            ))}
            <div className="actions">
              <button
                type="button"
                disabled={values.length >= 50}
                onClick={() =>
                  setValues([
                    ...values,
                    {
                      id: crypto.randomUUID(),
                      source: "",
                      target: "ac",
                      value: 1,
                      enabled: true,
                    },
                  ])
                }
              >
                Добавить поправку
              </button>
              <button className="primary" type="submit">
                Сохранить поправки
              </button>
              <button
                type="button"
                onClick={() => requestLeave(() => setEditing(null))}
              >
                Закрыть настройки
              </button>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}

export function AdjustmentSources({
  character,
  target,
}: {
  character: Character;
  target: string;
}) {
  const active =
    character.derived?.adjustments?.filter((a) => a.target === target) || [];
  return (
    <>
      {active.map((a) => (
        <small className="adjustment-source" key={a.id}>
          {signed(a.value)} · {a.source}
        </small>
      ))}
    </>
  );
}
