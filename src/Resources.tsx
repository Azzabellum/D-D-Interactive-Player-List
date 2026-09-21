import { useEffect, useRef, useState } from "react";
import { Character, Resource } from "./model";
import { useUnsavedChanges } from "./UnsavedChanges";

export function CharacterResources({
  character,
  dm,
  busy,
  mutate,
}: {
  character: Character;
  dm: boolean;
  busy: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const resources = character.resources || [];
  const [editing, setEditing] = useState<{
    values: Resource[];
    version?: number;
  } | null>(null);
  const [rest, setRest] = useState<"short" | "long" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const restDialog = useRef<HTMLDialogElement>(null);
  const requestLeave = useUnsavedChanges(false);
  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
  useEffect(() => {
    if (rest) restDialog.current?.showModal();
    else restDialog.current?.close();
  }, [rest]);
  const command = (data: Record<string, unknown>) =>
    mutate(
      { type: "resource", id: character.id, version: character.version, data },
      "Ресурсы обновлены",
    );
  const restored = resources.filter(
    (r) =>
      r.current < r.max && (rest === "short" ? r.shortRest : r.longRest) > 0,
  );
  return (
    <section className="resource-section">
      <div className="section-heading">
        <div>
          <h2>Игровые ресурсы</h2>
          <p>
            Лимиты и восстановление задаёт мастер. Расход отмечается отдельно от
            карточек способностей.
          </p>
        </div>
        {dm && (
          <button
            disabled={busy}
            onClick={() =>
              setEditing({
                values: structuredClone(resources),
                version: character.version,
              })
            }
          >
            Настроить ресурсы
          </button>
        )}
      </div>
      {!resources.length && (
        <p className="panel">
          Мастер ещё не настроил ячейки и расходуемые способности.
        </p>
      )}
      <div className="library-grid">
        {resources.map((r) => (
          <article className="panel" key={r.id}>
            <span className="eyebrow">
              {r.kind === "slot"
                ? `Ячейки · ${r.level} круг`
                : "Расходуемая способность"}
            </span>
            <h3>{r.name}</h3>
            <p>
              <strong>
                {r.current} / {r.max}
              </strong>{" "}
              доступно
            </p>
            <p className="muted">
              Короткий отдых: +{r.shortRest} · Долгий: +{r.longRest}, до
              максимума
            </p>
            {dm && (
              <div className="actions">
                <button
                  disabled={busy || r.current === 0}
                  onClick={() =>
                    void command({
                      action: "adjust",
                      resourceId: r.id,
                      delta: -1,
                    })
                  }
                >
                  Потратить 1
                </button>
                <button
                  disabled={busy || r.current === r.max}
                  onClick={() =>
                    void command({
                      action: "adjust",
                      resourceId: r.id,
                      delta: 1,
                    })
                  }
                >
                  Вернуть 1
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {dm && resources.length > 0 && (
        <div className="actions resource-rest">
          <button disabled={busy} onClick={() => setRest("short")}>
            Короткий отдых
          </button>
          <button disabled={busy} onClick={() => setRest("long")}>
            Долгий отдых
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="resource-editor-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) requestLeave(() => setEditing(null));
        }}
      >
        <div className="modal">
          <button
            className="close icon-button"
            aria-label="Закрыть редактор ресурсов"
            disabled={busy}
            onClick={() => requestLeave(() => setEditing(null))}
          >
            ×
          </button>
          {editing && (
            <ResourceEditor
              initial={editing.values}
              busy={busy}
              save={async (values) => {
                const ok = await mutate(
                  {
                    type: "character",
                    id: character.id,
                    version: editing.version,
                    data: { resources: values },
                    title: "Настройки ресурсов изменены",
                    detail: "Лимиты, остатки и восстановление после отдыха",
                  },
                  "Ресурсы сохранены",
                );
                if (ok) setEditing(null);
                return ok;
              }}
            />
          )}
        </div>
      </dialog>
      <dialog
        ref={restDialog}
        aria-labelledby="rest-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setRest(null);
        }}
      >
        <div className="modal">
          <h2 id="rest-title">
            {rest === "short" ? "Короткий отдых" : "Долгий отдых"}
          </h2>
          <p>
            Будут восстановлены только перечисленные ресурсы. Мастер проверяет
            условия отдыха; здоровье, кости хитов, заряды предметов и эффекты не
            изменятся.
          </p>
          {restored.length ? (
            <ul>
              {restored.map((r) => (
                <li key={r.id}>
                  {r.name}: {r.current} →{" "}
                  {Math.min(
                    r.max,
                    r.current + (rest === "short" ? r.shortRest : r.longRest),
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>Нет ресурсов для восстановления.</p>
          )}
          <div className="actions">
            <button disabled={busy} onClick={() => setRest(null)}>
              Отмена
            </button>
            <button
              className="primary"
              disabled={busy || !restored.length}
              onClick={async () => {
                if (await command({ action: "rest", rest })) setRest(null);
              }}
            >
              Восстановить ресурсы
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}

function ResourceEditor({
  initial,
  busy,
  save,
}: {
  initial: Resource[];
  busy: boolean;
  save: (values: Resource[]) => Promise<boolean>;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  useUnsavedChanges(JSON.stringify(values) !== JSON.stringify(initial));
  const update = (id: string, patch: Partial<Resource>) =>
    setValues(values.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (!(await save(values)))
          setError(
            "Не удалось сохранить. Правки остаются в форме; проверьте уведомление.",
          );
      }}
    >
      <h2 id="resource-editor-title">Настройка ресурсов</h2>
      <p>
        До 50 счётчиков. Класс и уровень не заполняют лимиты автоматически. Ноль
        в восстановлении означает ручной учёт.
      </p>
      <fieldset disabled={busy} className="resource-fields">
        {values.map((r) => (
          <div className="panel resource-edit" key={r.id}>
            <label>
              Название ресурса
              <input
                required
                maxLength={120}
                value={r.name}
                onChange={(e) => update(r.id, { name: e.target.value })}
              />
            </label>
            <label>
              Вид ресурса
              <select
                value={r.kind}
                onChange={(e) => {
                  const kind = e.target.value as Resource["kind"];
                  update(r.id, {
                    kind,
                    level: kind === "slot" ? 1 : undefined,
                  });
                }}
              >
                <option value="feature">Способность</option>
                <option value="slot">Ячейки заклинаний</option>
              </select>
            </label>
            {r.kind === "slot" && (
              <label>
                Круг ячейки
                <input
                  type="number"
                  required
                  min={1}
                  max={9}
                  value={r.level}
                  onChange={(e) =>
                    update(r.id, { level: Number(e.target.value) })
                  }
                />
              </label>
            )}
            {(
              [
                ["max", "Максимум"],
                ["current", "Доступно сейчас"],
                ["shortRest", "Возвращается за короткий отдых"],
                ["longRest", "Возвращается за долгий отдых"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={key === "max" ? 1 : 0}
                  max={key === "max" ? 999 : r.max}
                  step={1}
                  value={r[key]}
                  onChange={(e) =>
                    update(r.id, { [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => setValues(values.filter((v) => v.id !== r.id))}
            >
              Удалить ресурс из списка
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={values.length >= 50}
          onClick={() =>
            setValues([
              ...values,
              {
                id: crypto.randomUUID(),
                kind: "feature",
                name: "",
                max: 1,
                current: 1,
                shortRest: 0,
                longRest: 1,
              },
            ])
          }
        >
          Добавить ресурс
        </button>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary">
          Сохранить ресурсы
        </button>
      </fieldset>
    </form>
  );
}
