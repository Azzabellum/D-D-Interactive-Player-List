import { useUnsavedChanges } from "./UnsavedChanges";
import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { Ability, Character, State, statNames } from "./model";
import { StatTags, statKeys } from "./Appearance";

const emptySpell = () => ({
  level: 0,
  castingTime: "",
  range: "",
  duration: "",
  components: "",
  concentration: false,
  ritual: false,
});
const kindLabel = (a: Ability) =>
  a.kind === "feature"
    ? "Особенность"
    : a.spell?.level === 0
      ? "Заговор"
      : `Заклинание · ${a.spell?.level} круг`;

export function AbilityContent({ ability }: { ability: Ability }) {
  return (
    <>
      <span className="eyebrow">{kindLabel(ability)}</span>
      <h3>{ability.name}</h3>
      {ability.spell && (
        <dl className="ability-details">
          {[
            ["Время накладывания", ability.spell.castingTime],
            ["Дистанция", ability.spell.range],
            ["Длительность", ability.spell.duration],
            ["Компоненты", ability.spell.components],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      )}
      {ability.spell &&
        (ability.spell.concentration || ability.spell.ritual) && (
          <p>
            {[
              ability.spell.concentration && "Концентрация",
              ability.spell.ritual && "Ритуал",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      <p className="ability-description">{ability.description}</p>
      <StatTags tags={ability.tags} />
      {ability.source && <p className="muted">Источник: {ability.source}</p>}
    </>
  );
}

export function CharacterAbilities({
  character,
  dm,
  busy,
  remove,
  openLibrary,
}: {
  character: Character;
  dm: boolean;
  busy: boolean;
  remove: (ability: Ability) => Promise<boolean>;
  openLibrary: () => void;
}) {
  const [error, setError] = useState("");
  const abilities = character.abilities || [];
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Заклинания и особенности</h2>
          <p>Применение и расход ресурсов учитывает мастер.</p>
        </div>
        {dm && (
          <button className="primary" onClick={openLibrary}>
            <Plus size={16} /> Добавить из библиотеки
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {!abilities.length && (
        <div className="empty">
          <Sparkles />
          <h3>Способности пока не добавлены</h3>
          <p>Здесь появятся заклинания и особенности, выданные мастером.</p>
        </div>
      )}
      {(["spell", "feature"] as const).map((kind) => {
        const list = abilities.filter((a) => a.kind === kind);
        return (
          list.length > 0 && (
            <section className="ability-section" key={kind}>
              <h2>{kind === "spell" ? "Заклинания" : "Особенности"}</h2>
              <div className="library-grid">
                {list.map((ability) => (
                  <article className="panel library-card" key={ability.id}>
                    <AbilityContent ability={ability} />
                    {dm && (
                      <button
                        className="danger-link"
                        disabled={busy}
                        onClick={async () => {
                          setError("");
                          if (!(await remove(ability)))
                            setError(
                              "Не удалось удалить способность. Проверьте уведомление и повторите действие.",
                            );
                        }}
                      >
                        Убрать у персонажа
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )
        );
      })}
    </>
  );
}

type Mutation = (
  body: Record<string, unknown>,
  message: string,
) => Promise<boolean>;
export function AbilityLibrary({
  state,
  busy,
  mutate,
  give,
}: {
  state: State;
  busy: boolean;
  mutate: Mutation;
  give: (characterId: string, ability: Ability) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [recipient, setRecipient] = useState(state.characters[0]?.id || "");
  const [editing, setEditing] = useState<{
    ability: Ability;
    version?: number;
  } | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const requestLeave = useUnsavedChanges(!!editing && editorDirty);
  const recipientId = state.characters.some((c) => c.id === recipient)
    ? recipient
    : state.characters[0]?.id || "";
  useEffect(() => {
    setEditorDirty(false);
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing?.ability.id]);
  const entries = (state.abilityLibrary || []).filter(
    (a) =>
      !state.libraryArchive?.abilities.includes(a.id) &&
      (kind === "all" || a.kind === kind) &&
      a.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  function edit(ability: Ability) {
    setEditing({ ability: structuredClone(ability), version: state.version });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Коллекция мастера</span>
          <h1>Заклинания и особенности</h1>
          <p>
            Карточки вашей кампании. Выдача создаёт отдельную копию в листе
            персонажа.
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            edit({
              id: crypto.randomUUID(),
              kind: "spell",
              name: "",
              description: "",
              source: "",
              tags: [],
              spell: emptySpell(),
            })
          }
        >
          <Plus size={16} /> Создать способность
        </button>
      </div>
      <div className="filters">
        <label>
          Поиск способностей
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название…"
          />
        </label>
        <label>
          Вид карточки
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Все</option>
            <option value="spell">Заклинания</option>
            <option value="feature">Особенности</option>
          </select>
        </label>
        <label>
          Получатель способности
          <select
            disabled={!state.characters.length}
            value={recipientId}
            onChange={(e) => setRecipient(e.target.value)}
          >
            {!state.characters.length && (
              <option value="">Сначала создайте персонажа</option>
            )}
            {state.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.owner}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {!entries.length && (
        <div className="empty">
          <Sparkles />
          <h2>
            {state.abilityLibrary?.length
              ? "Ничего не найдено"
              : "Ваша библиотека пока пуста"}
          </h2>
          <p>
            {state.abilityLibrary?.length
              ? "Измените запрос или вид карточки."
              : "Создайте первое заклинание или особенность для своей кампании."}
          </p>
        </div>
      )}
      <div className="library-grid">
        {entries.map((ability) => (
          <article className="panel library-card" key={ability.id}>
            <AbilityContent ability={ability} />
            <div className="ability-actions">
              <button
                disabled={busy}
                onClick={() =>
                  mutate(
                    {
                      type: "libraryArchive",
                      version: state.version,
                      data: { kind: "ability", id: ability.id, archived: true },
                    },
                    "Карточка перемещена в архив",
                  )
                }
              >
                В архив
              </button>
              <button onClick={() => edit(ability)}>Редактировать</button>
              <button
                onClick={() =>
                  edit({
                    ...ability,
                    id: crypto.randomUUID(),
                    name: `${ability.name.slice(0, 190)} (копия)`,
                  })
                }
              >
                Создать копию
              </button>
              <button
                disabled={busy || !recipientId}
                onClick={async () => {
                  setError("");
                  if (!(await give(recipientId, ability)))
                    setError(
                      "Способность не выдана. Проверьте уведомление и повторите действие.",
                    );
                }}
              >
                <Plus size={16} /> Выдать персонажу
              </button>
            </div>
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="ability-editor-title"
        onChangeCapture={() => setEditorDirty(true)}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) requestLeave(() => setEditing(null));
        }}
      >
        <div className="modal">
          <button
            disabled={busy}
            className="close icon-button"
            aria-label="Закрыть редактор способности"
            onClick={() => requestLeave(() => setEditing(null))}
          >
            <X />
          </button>
          {editing && (
            <AbilityEditor
              key={editing.ability.id}
              ability={editing.ability}
              busy={busy}
              save={async (ability) => {
                const ok = await mutate(
                  {
                    type: "abilityLibrary",
                    version: editing.version,
                    data: ability,
                  },
                  "Карточка способности сохранена",
                );
                if (ok) {
                  setEditing(null);
                  setSearch("");
                  setKind("all");
                }
                return ok;
              }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

function AbilityEditor({
  ability,
  busy,
  save,
}: {
  ability: Ability;
  busy: boolean;
  save: (ability: Ability) => Promise<boolean>;
}) {
  const [value, setValue] = useState(ability);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (!value.name.trim() || !value.description.trim()) {
          setError("Заполните название и описание.");
          return;
        }
        if (
          !(await save({
            ...value,
            name: value.name.trim(),
            description: value.description.trim(),
          }))
        )
          setError(
            "Сохранение не выполнено. Текст остаётся в форме. При конфликте скопируйте его и откройте редактор заново.",
          );
      }}
    >
      <span className="eyebrow">Библиотека мастера</span>
      <h2 id="ability-editor-title">Редактор способности</h2>
      <p className="muted">
        Изменение шаблона не меняет выданные карточки. Эффекты учитывает мастер.
      </p>
      <label>
        Вид способности
        <select
          value={value.kind}
          onChange={(e) => {
            const { spell, ...base } = value;
            setValue(
              e.target.value === "spell"
                ? { ...base, kind: "spell", spell: emptySpell() }
                : { ...base, kind: "feature" },
            );
          }}
        >
          <option value="spell">Заклинание</option>
          <option value="feature">Особенность</option>
        </select>
      </label>
      <label>
        Название способности
        <input
          required
          maxLength={200}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      {value.spell && (
        <>
          <label>
            Круг заклинания
            <select
              value={value.spell.level}
              onChange={(e) =>
                setValue({
                  ...value,
                  spell: { ...value.spell!, level: Number(e.target.value) },
                })
              }
            >
              {Array.from({ length: 10 }, (_, n) => (
                <option value={n} key={n}>
                  {n === 0 ? "0 — заговор" : `${n} круг`}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["castingTime", "Время накладывания"],
              ["range", "Дистанция"],
              ["duration", "Длительность"],
              ["components", "Компоненты"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                maxLength={key === "components" ? 500 : 200}
                value={value.spell![key]}
                onChange={(e) =>
                  setValue({
                    ...value,
                    spell: { ...value.spell!, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          <div className="ability-checks">
            {(
              [
                ["concentration", "Концентрация"],
                ["ritual", "Ритуал"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={value.spell![key]}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      spell: { ...value.spell!, [key]: e.target.checked },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
      <label>
        Описание способности
        <textarea
          required
          maxLength={8000}
          rows={5}
          value={value.description}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label>
        Источник или пометка мастера
        <input
          maxLength={500}
          placeholder="Например: домашнее правило"
          value={value.source}
          onChange={(e) => setValue({ ...value, source: e.target.value })}
        />
      </label>
      <p className="muted">
        Все поля выданной карточки, включая источник, видны владельцу персонажа.
      </p>
      <fieldset className="item-tags">
        <legend>Связанные характеристики</legend>
        {statKeys.map((key, index) => (
          <label key={key}>
            <input
              type="checkbox"
              aria-label={statNames[index]}
              checked={value.tags.includes(key)}
              onChange={(e) =>
                setValue({
                  ...value,
                  tags: e.target.checked
                    ? [...value.tags, key]
                    : value.tags.filter((tag) => tag !== key),
                })
              }
            />
            <StatTags tags={[key]} />
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="primary" type="submit">
        {busy ? "Сохранение…" : "Сохранить способность"}
      </button>
    </form>
  );
}
