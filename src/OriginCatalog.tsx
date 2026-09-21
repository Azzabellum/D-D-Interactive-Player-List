import { InitialAssetsEditor } from "./InitialAssets";
import { EquipmentEditor } from "./ClassEquipment";
import skillCatalog from "../shared/skills.json";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Character, OriginCard, OriginKind, State, statNames } from "./model";
import { useUnsavedChanges } from "./UnsavedChanges";
export const originKinds: OriginKind[] = ["species", "class", "background"];
export const originLabels = {
  species: "Расы и виды",
  class: "Классы",
  background: "Происхождения",
};
export function OriginProfile({ character }: { character: Character }) {
  if (!character.originCards) return null;
  return (
    <section className="panel">
      <h3>Выбранные карточки</h3>
      <p>
        Описания сохранены с анкетой и не меняются при редактировании каталога.
      </p>
      {originKinds.map((kind) => {
        const card = character.originCards?.[kind];
        return (
          card && (
            <details key={kind}>
              <summary>
                {originLabels[kind]}: {card.name}
              </summary>
              <p className="ability-description">{card.description}</p>
              <small>{card.source}</small>
            </details>
          )
        );
      })}
    </section>
  );
}

export function OriginCards({
  cards,
  kind,
  selected,
  choose,
  locked = false,
  manage,
}: {
  cards: OriginCard[];
  kind: OriginKind;
  selected?: string;
  choose?: (card: OriginCard) => void;
  locked?: boolean;
  manage?: (card: OriginCard) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<OriginCard | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (detail) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail]);
  const visible = cards.filter(
    (c) =>
      c.kind === kind &&
      (!c.archived || c.id === selected || !!manage) &&
      `${c.name} ${c.summary}`
        .toLocaleLowerCase("ru")
        .includes(search.toLocaleLowerCase("ru")),
  );
  return (
    <>
      <label>
        Поиск карточек
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="origin-grid">
        {visible.map((c) => (
          <article
            className={`panel origin-card ${c.id === selected ? "selected" : ""}`}
            key={c.id}
          >
            <span className="eyebrow">
              {c.id.startsWith("core2024-")
                ? "Основная книга · 2024"
                : "Карточка мастера"}
            </span>
            <h3>{c.name}</h3>
            <p>{c.summary}</p>
            {c.id === selected && <strong>Выбрано</strong>}
            {c.archived && <small>В архиве</small>}
            <div className="actions">
              {manage?.(c)}
              <button type="button" onClick={() => setDetail(c)}>
                Подробнее: {c.name}
              </button>
              {choose && (
                <button
                  type="button"
                  disabled={locked || c.archived || c.id === selected}
                  onClick={() => choose(c)}
                >
                  Выбрать: {c.name}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!visible.length && <p>Подходящих карточек нет.</p>}
      <dialog
        ref={dialog}
        aria-labelledby="origin-detail-title"
        onCancel={() => setDetail(null)}
      >
        <div className="modal">
          {detail && (
            <>
              <button
                className="close icon-button"
                aria-label="Закрыть описание"
                onClick={() => setDetail(null)}
              >
                ×
              </button>
              <span className="eyebrow">{originLabels[detail.kind]}</span>
              <h2 id="origin-detail-title">{detail.name}</h2>
              <p className="ability-description">{detail.description}</p>
              <p className="muted">{detail.source || "Источник не указан"}</p>
              <p>
                Карточка описывает выбор. Настроенные прибавки происхождения
                выбираются на шаге характеристик. Текст не применяется как
                автоматические правила; параметры проверяет мастер.
              </p>
              {choose && (
                <button
                  className="primary"
                  disabled={locked || detail.archived}
                  onClick={() => {
                    choose(detail);
                    setDetail(null);
                  }}
                >
                  Выбрать: {detail.name}
                </button>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
export function OriginStep({
  draft,
  cards,
  kind,
  change,
}: {
  draft: Character;
  cards: OriginCard[];
  kind: OriginKind;
  change: (c: Character) => void;
}) {
  const field = kind === "class" ? "cls" : kind;
  const locked = !!draft.creation && draft.version !== undefined;
  return (
    <>
      <h2>{originLabels[kind]}</h2>
      <p>Выберите карточку или сначала откройте описание.</p>
      {locked && (
        <p className="notice warning">
          Сохранённый стартовый шаблон закреплён. Для другого сочетания создайте
          новую анкету.
        </p>
      )}
      {!draft.originChoices && draft[field] && (
        <p>
          Ранее указано: {draft[field]}. Старое значение сохранится, если не
          выбирать карточки.
        </p>
      )}
      <OriginCards
        cards={cards}
        kind={kind}
        selected={draft.originChoices?.[kind]}
        locked={locked}
        choose={(card) =>
          change({
            ...draft,
            [field]: card.name,
            creation: undefined,
            firstLevel:
              kind === "background" && draft.firstLevel
                ? {
                    ...draft.firstLevel,
                    boosts: [0, 0, 0, 0, 0, 0],
                    tool: undefined,
                    backgroundEquipment: undefined,
                    backgroundGold: false,
                  }
                : draft.firstLevel,
            ...(draft.firstLevel?.classSkills !== undefined &&
            (kind === "class" || kind === "background")
              ? {
                  firstLevel: {
                    ...draft.firstLevel,
                    ...(kind === "background"
                      ? {
                          boosts: [0, 0, 0, 0, 0, 0],
                          tool: undefined,
                          backgroundEquipment: undefined,
                          backgroundGold: false,
                        }
                      : {}),
                    classSkills: [],
                    expertise: [],
                    classTools: [],
                  },
                }
              : {}),
            ...(kind === "class" && draft.firstLevel
              ? {
                  firstLevel: {
                    ...draft.firstLevel,
                    classSkills:
                      draft.firstLevel.classSkills !== undefined
                        ? []
                        : undefined,
                    expertise: [],
                    classTools: [],
                    classEquipment: undefined,
                    equipmentTool: undefined,
                  },
                }
              : {}),
            originChoices: {
              species: "",
              class: "",
              background: "",
              ...draft.originChoices,
              [kind]: card.id,
            },
          })
        }
      />
    </>
  );
}
export function OriginLibrary({
  state,
  busy,
  mutate,
}: {
  state: State;
  busy: boolean;
  mutate: (data: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<OriginKind>("species");
  const [editing, setEditing] = useState<{
    card: OriginCard;
    version?: number;
  } | null>(null);
  const [value, setValue] = useState<OriginCard | null>(null);
  const [error, setError] = useState("");
  const requestLeave = useUnsavedChanges(
    !!editing && JSON.stringify(value) !== JSON.stringify(editing.card),
  );
  const cards = state.characterOptions || [];
  const open = (card: OriginCard) => {
    setEditing({ card, version: state.version });
    setValue(structuredClone(card));
    setError("");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Каталог создания персонажа</h1>
          <p>
            Карточки доступны игрокам этой кампании. Изменение каталога не
            переписывает сохранённые листы.
          </p>
        </div>
      </div>
      {editing && value ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            if (
              value.classRules &&
              (value.classRules.skills.length < value.classRules.count ||
                value.classRules.saves.length !== 2)
            ) {
              setError(
                "Укажите достаточно навыков и ровно два спасброска класса.",
              );
              return;
            }
            if (value.trainedSkills && value.trainedSkills.length !== 2) {
              setError("Выберите два навыка или снимите все отметки.");
              return;
            }
            if (value.boostAbilities && value.boostAbilities.length !== 3) {
              setError(
                "Выберите ровно три характеристики или снимите все отметки.",
              );
              return;
            }
            if (
              await mutate(
                {
                  type: "characterOption",
                  version: editing.version,
                  data: value,
                },
                "Карточка сохранена",
              )
            )
              setEditing(null);
            else
              setError(
                "Не удалось сохранить. Введённые правки остаются в форме.",
              );
          }}
        >
          <h2>Редактор карточки: {originLabels[value.kind]}</h2>
          <fieldset disabled={busy} className="resource-fields">
            <label>
              Название карточки
              <input
                required
                maxLength={60}
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </label>
            <label>
              Краткое описание
              <input
                required
                maxLength={250}
                value={value.summary}
                onChange={(e) =>
                  setValue({ ...value, summary: e.target.value })
                }
              />
            </label>
            <label>
              Полное описание
              <textarea
                required
                rows={9}
                maxLength={12000}
                value={value.description}
                onChange={(e) =>
                  setValue({ ...value, description: e.target.value })
                }
              />
            </label>
            {value.kind === "background" && (
              <div>
                <h3>Допустимые характеристики</h3>
                <p>
                  Отметьте ровно три для автоматических прибавок +2/+1 или
                  +1/+1/+1. Без отметок прибавки проверяются вручную.
                </p>
                {statNames.map((name, i) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={value.boostAbilities?.includes(i) || false}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...(value.boostAbilities || []), i]
                          : (value.boostAbilities || []).filter((v) => v !== i);
                        setValue({
                          ...value,
                          boostAbilities: next.length ? next : undefined,
                        });
                      }}
                    />{" "}
                    {name}
                  </label>
                ))}
              </div>
            )}
            {value.kind === "background" && (
              <div>
                <h3>Владения происхождения</h3>
                <p>
                  Выберите два навыка или оставьте все отметки пустыми для
                  ручной настройки.
                </p>
                <div className="form-grid">
                  {skillCatalog.map((skill) => (
                    <label key={skill.id}>
                      <input
                        type="checkbox"
                        checked={
                          value.trainedSkills?.includes(skill.id) || false
                        }
                        onChange={(e) => {
                          const list = e.target.checked
                            ? [...(value.trainedSkills || []), skill.id]
                            : (value.trainedSkills || []).filter(
                                (id) => id !== skill.id,
                              );
                          setValue({
                            ...value,
                            trainedSkills: list.length ? list : undefined,
                          });
                        }}
                      />
                      {skill.name}
                    </label>
                  ))}
                </div>
                <label>
                  Варианты инструмента
                  <textarea
                    rows={4}
                    value={(value.toolOptions || []).join("\n")}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        toolOptions: e.target.value
                          ? e.target.value.split("\n")
                          : undefined,
                      })
                    }
                  />
                </label>
                <p>
                  Один инструмент на строку, до 20. Одна строка — фиксированное
                  владение; несколько — игрок выбирает одно. Пустое поле
                  оставляет проверку мастеру.
                </p>
              </div>
            )}
            {value.kind === "class" && (
              <div>
                <h3>Навыки и спасброски класса</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={!!value.classRules}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        classRules: e.target.checked
                          ? { count: 2, skills: [], saves: [] }
                          : undefined,
                      })
                    }
                  />{" "}
                  Настроить классовые владения
                </label>
                {value.classRules && (
                  <>
                    <label>
                      Число навыков
                      <select
                        value={value.classRules.count}
                        onChange={(e) =>
                          setValue({
                            ...value,
                            classRules: {
                              ...value.classRules!,
                              count: Number(e.target.value),
                            },
                          })
                        }
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Навыков с экспертизой на первом уровне
                      <select
                        value={value.classRules.expertiseCount || 0}
                        onChange={(e) =>
                          setValue({
                            ...value,
                            classRules: {
                              ...value.classRules!,
                              expertiseCount: Number(e.target.value),
                            },
                          })
                        }
                      >
                        {[0, 1, 2].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <EquipmentEditor
                      value={value.classRules.equipment}
                      change={(equipment) =>
                        setValue({
                          ...value,
                          classRules: { ...value.classRules!, equipment },
                        })
                      }
                    />
                    <p>Разрешённые навыки:</p>
                    <div className="form-grid">
                      {skillCatalog.map((skill) => (
                        <label key={skill.id}>
                          <input
                            type="checkbox"
                            checked={value.classRules!.skills.includes(
                              skill.id,
                            )}
                            onChange={(e) =>
                              setValue({
                                ...value,
                                classRules: {
                                  ...value.classRules!,
                                  skills: e.target.checked
                                    ? [...value.classRules!.skills, skill.id]
                                    : value.classRules!.skills.filter(
                                        (id) => id !== skill.id,
                                      ),
                                },
                              })
                            }
                          />
                          {skill.name}
                        </label>
                      ))}
                    </div>
                    <p>Два спасброска:</p>
                    {["str", "dex", "con", "int", "wis", "cha"].map((id, i) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={value.classRules!.saves.includes(id)}
                          onChange={(e) =>
                            setValue({
                              ...value,
                              classRules: {
                                ...value.classRules!,
                                saves: e.target.checked
                                  ? [...value.classRules!.saves, id]
                                  : value.classRules!.saves.filter(
                                      (v) => v !== id,
                                    ),
                              },
                            })
                          }
                        />
                        {statNames[i]}
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
            <InitialAssetsEditor card={value} change={setValue} />
            <label>
              Источник карточки
              <input
                maxLength={300}
                value={value.source}
                onChange={(e) => setValue({ ...value, source: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={value.archived}
                onChange={(e) =>
                  setValue({ ...value, archived: e.target.checked })
                }
              />{" "}
              Убрать из нового выбора (архив)
            </label>
            <p>
              Описание видно игрокам целиком. Числовые правила пользовательской
              карточки мастер пока настраивает в листе.
            </p>
            <div className="actions">
              <button type="submit" className="primary">
                Сохранить карточку
              </button>
              <button
                type="button"
                onClick={() => requestLeave(() => setEditing(null))}
              >
                Закрыть редактор карточки
              </button>
            </div>
          </fieldset>
          {error && <p role="alert">{error}</p>}
        </form>
      ) : (
        <>
          <div className="actions">
            {originKinds.map((k) => (
              <button
                key={k}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {originLabels[k]}
              </button>
            ))}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                open({
                  id: crypto.randomUUID(),
                  kind,
                  name: "",
                  summary: "",
                  description: "",
                  source: "Авторская карточка мастера",
                  archived: false,
                })
              }
            >
              Создать карточку
            </button>
          </div>
          <p>
            Встроенную карточку можно изменить для этой кампании или
            скопировать. Архивирование не удаляет сделанные выборы.
          </p>
          <OriginCards
            key={kind}
            cards={cards}
            kind={kind}
            manage={(c) => (
              <>
                <button disabled={busy} onClick={() => open(c)}>
                  Редактировать: {c.name}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    open({
                      ...c,
                      id: crypto.randomUUID(),
                      name: c.name.slice(0, 50) + " — копия",
                      archived: false,
                    })
                  }
                >
                  Копировать: {c.name}
                </button>
              </>
            )}
          />
        </>
      )}
    </>
  );
}
