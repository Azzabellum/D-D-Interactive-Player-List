import { useState } from "react";
import { Character, Condition, Concentration } from "./model";
import { useUnsavedChanges } from "./UnsavedChanges";

type Values = { conditions: Condition[]; concentration: Concentration | null };
export function CharacterConditions({
  character,
  dm,
  busy,
  save,
}: {
  character: Character;
  dm: boolean;
  busy: boolean;
  save: (values: Values, version?: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<{
    values: Values;
    version?: number;
  } | null>(null);
  const [values, setValues] = useState<Values>({
    conditions: [],
    concentration: null,
  });
  const [error, setError] = useState("");
  const requestLeave = useUnsavedChanges(
    !!editing && JSON.stringify(values) !== JSON.stringify(editing.values),
  );
  function open() {
    const next = structuredClone({
      conditions: character.conditions || [],
      concentration: character.concentration || null,
    });
    setValues(next);
    setEditing({ values: next, version: character.version });
    setError("");
  }
  const update = (id: string, patch: Partial<Condition>) =>
    setValues({
      ...values,
      conditions: values.conditions.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  return (
    <section className="panel resource-section">
      <div className="section-heading">
        <h2>Состояния и концентрация</h2>
        {dm && !editing && (
          <button disabled={busy} onClick={open}>
            Изменить состояния
          </button>
        )}
      </div>
      <p className="muted">
        Все записи видны игроку. Длительность — отметка мастера, без
        автоматического отсчёта. Состояния не меняют расчёты и не снимаются сами
        после урона или отдыха.
      </p>
      {!editing ? (
        <>
          {!character.conditions?.length && (
            <p>Активные состояния не отмечены.</p>
          )}
          <div className="library-grid">
            {character.conditions?.map((c) => (
              <article className="condition-card" key={c.id}>
                <h3>{c.name}</h3>
                {c.source && <p>Источник: {c.source}</p>}
                <p>Длительность: {c.duration || "Не указана"}</p>
                {c.note && <p className="ability-description">{c.note}</p>}
              </article>
            ))}
          </div>
          <div className="condition-card">
            <h3>Концентрация</h3>
            {character.concentration ? (
              <>
                <p>
                  <strong>{character.concentration.name}</strong>
                </p>
                <p>
                  Длительность:{" "}
                  {character.concentration.duration || "Не указана"}
                </p>
                {character.concentration.note && (
                  <p className="ability-description">
                    {character.concentration.note}
                  </p>
                )}
              </>
            ) : (
              <p>Не отмечена.</p>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (await save(values, editing.version)) setEditing(null);
            else
              setError(
                "Не удалось сохранить. Ваши записи остаются в форме. При конфликте скопируйте их и откройте актуальную версию заново.",
              );
          }}
        >
          <fieldset disabled={busy} className="resource-fields">
            {values.conditions.map((c) => (
              <div className="panel resource-edit" key={c.id}>
                <label>
                  Название состояния
                  <input
                    required
                    maxLength={120}
                    value={c.name}
                    onChange={(e) => update(c.id, { name: e.target.value })}
                    placeholder="Например, отравлен"
                  />
                </label>
                <label>
                  Источник состояния
                  <input
                    maxLength={200}
                    value={c.source}
                    onChange={(e) => update(c.id, { source: e.target.value })}
                  />
                </label>
                <label>
                  Длительность состояния
                  <input
                    maxLength={200}
                    value={c.duration}
                    onChange={(e) => update(c.id, { duration: e.target.value })}
                    placeholder="Например, до конца следующего хода"
                  />
                </label>
                <label>
                  Пояснение состояния
                  <textarea
                    maxLength={1000}
                    value={c.note}
                    onChange={(e) => update(c.id, { note: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setValues({
                      ...values,
                      conditions: values.conditions.filter(
                        (v) => v.id !== c.id,
                      ),
                    })
                  }
                >
                  Снять состояние
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={values.conditions.length >= 20}
              onClick={() =>
                setValues({
                  ...values,
                  conditions: [
                    ...values.conditions,
                    {
                      id: crypto.randomUUID(),
                      name: "",
                      source: "",
                      duration: "",
                      note: "",
                    },
                  ],
                })
              }
            >
              Добавить состояние
            </button>
            <h3>Концентрация</h3>
            <p>
              Одна запись на персонажа. Замена названия заменяет текущую
              отметку; расход ячейки отмечается отдельно.
            </p>
            <label>
              <input
                type="checkbox"
                checked={!!values.concentration}
                onChange={(e) =>
                  setValues({
                    ...values,
                    concentration: e.target.checked
                      ? { name: "", duration: "", note: "" }
                      : null,
                  })
                }
              />{" "}
              Поддерживает концентрацию
            </label>
            {values.concentration && (
              <>
                <label>
                  На чём концентрация
                  <input
                    required
                    maxLength={120}
                    list="concentration-abilities"
                    value={values.concentration.name}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        concentration: {
                          ...values.concentration!,
                          name: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <datalist id="concentration-abilities">
                  {character.abilities
                    ?.filter((a) => a.spell?.concentration)
                    .map((a) => (
                      <option key={a.id} value={a.name} />
                    ))}
                </datalist>
                <label>
                  Длительность концентрации
                  <input
                    maxLength={200}
                    value={values.concentration.duration}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        concentration: {
                          ...values.concentration!,
                          duration: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Пояснение концентрации
                  <textarea
                    maxLength={1000}
                    value={values.concentration.note}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        concentration: {
                          ...values.concentration!,
                          note: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </>
            )}
            <div className="actions">
              <button className="primary" type="submit">
                Сохранить состояния
              </button>
              <button
                type="button"
                onClick={() => requestLeave(() => setEditing(null))}
              >
                Закрыть состояния
              </button>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  );
}
