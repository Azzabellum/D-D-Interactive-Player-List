import { ClassEquipmentChoices, EquipmentSummary } from "./ClassEquipment";
import { InitialAssetsChoices, initialAssetsError } from "./InitialAssets";
import skillCatalog from "../shared/skills.json";
import { Character, OriginCard, statNames } from "./model";
import starter from "../shared/starter.json";
export function backgroundFor(draft: Character, cards: OriginCard[]) {
  const id = draft.originChoices?.background;
  return draft.originCards && id && draft.originCards.background.id === id
    ? draft.originCards.background
    : cards.find((c) => c.id === id);
}
export function classFor(draft: Character, cards: OriginCard[]) {
  const id = draft.originChoices?.class;
  return draft.originCards && id && draft.originCards.class.id === id
    ? draft.originCards.class
    : cards.find((c) => c.id === id);
}
export function firstLevelError(draft: Character, cards: OriginCard[]) {
  if (!draft.firstLevel) return "";
  const background = backgroundFor(draft, cards);
  const allowed = background?.boostAbilities;
  const { boosts, languages } = draft.firstLevel;
  if (!allowed)
    return "Выберите происхождение с настроенными прибавками характеристик.";
  if (
    boosts.reduce((a, b) => a + b, 0) !== 3 ||
    boosts.some((v, i) => v && !allowed.includes(i))
  )
    return "Распределите +2/+1 или +1/+1/+1 по характеристикам происхождения.";
  if (
    new Set(languages).size !== 2 ||
    languages.some((v) => !starter.languages.includes(v))
  )
    return "Выберите два разных обычных языка.";
  if (
    (background?.toolOptions?.length || 0) > 1 &&
    !background!.toolOptions!.includes(draft.firstLevel.tool || "")
  )
    return "Выберите инструмент происхождения.";
  if (draft.firstLevel.classSkills !== undefined) {
    const rules = classFor(draft, cards)?.classRules,
      selected = draft.firstLevel.classSkills;
    if (
      !rules ||
      selected.length !== rules.count ||
      new Set(selected).size !== selected.length ||
      selected.some(
        (id) =>
          !rules.skills.includes(id) || background?.trainedSkills?.includes(id),
      )
    )
      return "Выберите нужное число навыков класса без повторов происхождения.";
  }
  const expertise = draft.firstLevel.expertise || [];
  const rules = classFor(draft, cards)?.classRules;
  if (draft.firstLevel.classSkills !== undefined) {
    const trained = [
      ...draft.firstLevel.classSkills,
      ...(background?.trainedSkills || []),
    ];
    if (
      expertise.length !== (rules?.expertiseCount || 0) ||
      new Set(expertise).size !== expertise.length ||
      expertise.some((id) => !trained.includes(id))
    )
      return "Выберите экспертизу в нужном числе разных освоенных навыков.";
  } else if (expertise.length)
    return "Включите владения класса для экспертизы.";
  const selectedTools = draft.firstLevel.classTools || [];
  const toolRules =
    draft.firstLevel.classSkills !== undefined
      ? rules?.equipment?.toolChoice
      : undefined;
  if (
    selectedTools.length !== (toolRules?.count || 0) ||
    new Set(selectedTools).size !== selectedTools.length ||
    selectedTools.some((t) => !toolRules?.options.includes(t))
  )
    return "Выберите нужное число разных инструментов класса из списка.";
  return initialAssetsError(draft, classFor(draft, cards), background);
}
export function FirstLevelChoices({
  draft,
  cards,
  change,
}: {
  draft: Character;
  cards: OriginCard[];
  change: (c: Character) => void;
}) {
  if (draft.creation) return null;
  const background = backgroundFor(draft, cards);
  const allowed = background?.boostAbilities;
  const choice = draft.firstLevel;
  const classCard = classFor(draft, cards);
  return (
    <section>
      <h3>Прибавки происхождения и языки</h3>
      <p>
        Базовые значения выше не включают прибавки. Общий язык известен
        изначально; дополнительно выберите два обычных языка.
      </p>
      <label>
        <input
          type="checkbox"
          checked={!!choice}
          disabled={draft.version !== undefined || !allowed}
          onChange={(e) =>
            change({
              ...draft,
              firstLevel: e.target.checked
                ? {
                    boosts: [0, 0, 0, 0, 0, 0],
                    languages: ["Дварфский", "Эльфийский"],
                  }
                : undefined,
            })
          }
        />{" "}
        Рассчитать прибавки и сохранить языки
      </label>
      {!allowed && (
        <p>
          Для этого происхождения мастер ещё не настроил допустимые
          характеристики. Прибавки и языки согласуйте с ним.
        </p>
      )}
      {draft.version !== undefined && (
        <p>Способ расчёта закреплён при первом сохранении анкеты.</p>
      )}
      {choice && (
        <>
          <p>
            Выберите +2 и +1 для разных характеристик или +1 для каждой из трёх.
            Остальные особенности происхождения проверяет мастер.
          </p>
          <div className="form-grid">
            {statNames.map((name, i) => (
              <label key={name}>
                {name}: {draft.stats[i]} + {choice.boosts[i]} ={" "}
                {draft.stats[i] + choice.boosts[i]}
                <select
                  aria-label={`Прибавка: ${name}`}
                  disabled={!allowed?.includes(i)}
                  value={choice.boosts[i]}
                  onChange={(e) => {
                    const boosts = [...choice.boosts];
                    boosts[i] = Number(e.target.value);
                    change({ ...draft, firstLevel: { ...choice, boosts } });
                  }}
                >
                  {[0, 1, 2].map((v) => (
                    <option key={v} value={v}>
                      +{v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="form-grid">
            {choice.languages.map((language, i) => (
              <label key={i}>
                Дополнительный язык {i + 1}
                <select
                  value={language}
                  onChange={(e) => {
                    const languages = [...choice.languages];
                    languages[i] = e.target.value;
                    change({ ...draft, firstLevel: { ...choice, languages } });
                  }}
                >
                  {starter.languages.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h3>Владения происхождения</h3>
          <p>
            Навыки:{" "}
            {background?.trainedSkills
              ?.map((id) => skillCatalog.find((s) => s.id === id)?.name)
              .join(", ") || "Не настроены"}
            . Бонус мастерства учитывается один раз; классовые владения проверит
            мастер.
          </p>
          {background?.toolOptions?.length === 1 && (
            <p>Инструмент: {background.toolOptions[0]}.</p>
          )}
          {(background?.toolOptions?.length || 0) > 1 && (
            <label>
              Инструмент происхождения
              <select
                value={choice.tool || ""}
                onChange={(e) =>
                  change({
                    ...draft,
                    firstLevel: { ...choice, tool: e.target.value },
                  })
                }
              >
                <option value="">Выберите инструмент</option>
                {background!.toolOptions!.map((tool) => (
                  <option key={tool}>{tool}</option>
                ))}
              </select>
            </label>
          )}
          {!background?.toolOptions?.length && (
            <p>Инструмент не настроен — согласуйте с мастером.</p>
          )}
          <h3>Навыки и спасброски класса</h3>
          {classCard?.classRules ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={choice.classSkills !== undefined}
                  onChange={(e) =>
                    change({
                      ...draft,
                      firstLevel: {
                        ...choice,
                        classSkills: e.target.checked ? [] : undefined,
                        expertise: [],
                        classTools: [],
                      },
                    })
                  }
                />{" "}
                Применить владения класса
              </label>
              {choice.classSkills !== undefined && (
                <>
                  <p>
                    Выберите {classCard.classRules.count} навыка. Выбрано:{" "}
                    {choice.classSkills.length}. Уже полученные от происхождения
                    выбирать повторно не нужно.
                  </p>
                  <div className="form-grid">
                    {classCard.classRules.skills.map((id) => {
                      const inherited = background?.trainedSkills?.includes(id);
                      return (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={choice.classSkills!.includes(id)}
                            disabled={
                              inherited && !choice.classSkills!.includes(id)
                            }
                            onChange={(e) =>
                              change({
                                ...draft,
                                firstLevel: {
                                  ...choice,
                                  classSkills: e.target.checked
                                    ? [...choice.classSkills!, id]
                                    : choice.classSkills!.filter(
                                        (v) => v !== id,
                                      ),
                                },
                              })
                            }
                          />
                          {skillCatalog.find((s) => s.id === id)?.name}
                          {inherited ? " · от происхождения" : ""}
                        </label>
                      );
                    })}
                  </div>
                  <p>
                    Спасброски:{" "}
                    {classCard.classRules.saves
                      .map(
                        (id) =>
                          statNames[
                            ["str", "dex", "con", "int", "wis", "cha"].indexOf(
                              id,
                            )
                          ],
                      )
                      .join(", ")}
                    .
                  </p>
                </>
              )}
              {choice.classSkills !== undefined &&
                !!classCard.classRules.expertiseCount && (
                  <section>
                    <h3>Экспертиза</h3>
                    <p>
                      Выберите {classCard.classRules.expertiseCount} освоенных
                      навыка. Их бонус мастерства удваивается. Выбрано:{" "}
                      {choice.expertise?.length || 0}.
                    </p>
                    {skillCatalog
                      .filter(
                        (s) =>
                          choice.classSkills!.includes(s.id) ||
                          background?.trainedSkills?.includes(s.id) ||
                          choice.expertise?.includes(s.id),
                      )
                      .map((skill) => (
                        <label key={skill.id}>
                          <input
                            type="checkbox"
                            checked={
                              choice.expertise?.includes(skill.id) || false
                            }
                            onChange={(e) =>
                              change({
                                ...draft,
                                firstLevel: {
                                  ...choice,
                                  expertise: e.target.checked
                                    ? [...(choice.expertise || []), skill.id]
                                    : (choice.expertise || []).filter(
                                        (id) => id !== skill.id,
                                      ),
                                },
                              })
                            }
                          />
                          Экспертиза: {skill.name}
                          {!choice.classSkills!.includes(skill.id) &&
                          !background?.trainedSkills?.includes(skill.id)
                            ? " — владение больше не выбрано"
                            : ""}
                        </label>
                      ))}
                  </section>
                )}
              {choice.classSkills !== undefined && (
                <ClassEquipmentChoices
                  rules={classCard.classRules.equipment}
                  selected={choice.classTools || []}
                  change={(classTools) =>
                    change({ ...draft, firstLevel: { ...choice, classTools } })
                  }
                />
              )}
              <p>
                Особенности класса и расширения владений от них проверяет
                мастер. Владения не выдают предметы и пока не рассчитывают атаки
                или КД.
              </p>
            </>
          ) : (
            <p>Классовые владения не настроены. Их проверит мастер.</p>
          )}
          <InitialAssetsChoices
            draft={draft}
            cards={cards}
            card={classCard}
            background={background}
            change={change}
          />
          {firstLevelError(draft, cards) && (
            <p role="status">{firstLevelError(draft, cards)}</p>
          )}
        </>
      )}
    </section>
  );
}
export function FirstLevelProfile({ character: c }: { character: Character }) {
  if (!c.firstLevel) return null;
  return (
    <section className="panel">
      <h3>Выборы первого уровня</h3>
      {c.initialVitals && (
        <p>
          Начальные хиты: {c.initialVitals.hitDie} + (
          {c.initialVitals.constitution}) Телосложение + {c.initialVitals.bonus}{" "}
          от карточек = {c.initialVitals.maxHp}. Кость хитов первого уровня: 1к
          {c.initialVitals.hitDie}. Текущее здоровье изменяет мастер.
        </p>
      )}
      {c.initialEquipment && (
        <p>
          При создании: {c.initialEquipment.className} —{" "}
          {c.initialEquipment.classChoice}; происхождение —{" "}
          {c.initialEquipment.backgroundChoice || "прежний выбор"}; золото
          происхождения {c.initialEquipment.backgroundGold} зм. Всего выдано{" "}
          {c.initialEquipment.gold} зм. Текущее снаряжение и деньги — в
          инвентаре.
        </p>
      )}
      {!!c.classTraining?.expertise?.length && (
        <p>
          Экспертиза класса:{" "}
          {c.classTraining.expertise
            .map((id) => skillCatalog.find((s) => s.id === id)?.name)
            .join(", ")}
          . Применяется при активном источнике класса и наличии владения.
        </p>
      )}
      {c.classTraining && (
        <>
          <p>
            Навыки класса «{c.classTraining.source}»:{" "}
            {c.classTraining.skills
              .map((id) => skillCatalog.find((s) => s.id === id)?.name)
              .join(", ")}
            .{" "}
            {c.classTrainingEnabled === false
              ? "Источник отключён мастером."
              : "Источник активен."}
          </p>
          <p>
            Спасброски класса:{" "}
            {c.classTraining.saves
              .map(
                (id) =>
                  statNames[
                    ["str", "dex", "con", "int", "wis", "cha"].indexOf(id)
                  ],
              )
              .join(", ")}
            .
          </p>
        </>
      )}
      {c.classTraining?.equipment && (
        <EquipmentSummary equipment={c.classTraining.equipment} />
      )}
      <p>
        Инструменты активных источников:{" "}
        {[
          ...new Set([
            ...(c.backgroundTrainingEnabled !== false
              ? c.backgroundTraining?.tools || []
              : []),
            ...(c.classTrainingEnabled !== false
              ? c.classTraining?.equipment?.tools || []
              : []),
          ]),
        ].join(", ") || "нет"}
        . Совпадения не дают экспертизу.
      </p>
      {c.backgroundTraining && (
        <>
          <p>
            Владения от «{c.backgroundTraining.source}»:{" "}
            {c.backgroundTraining.skills
              .map((id) => skillCatalog.find((s) => s.id === id)?.name)
              .join(", ") || "не заданы"}
            .{" "}
            {c.backgroundTrainingEnabled === false
              ? "Источник отключён мастером."
              : "Источник активен."}
          </p>
          <p>
            Инструменты: {c.backgroundTraining.tools.join(", ") || "не заданы"}.
            Владение не выдаёт сам предмет.
          </p>
        </>
      )}
      <p>Языки при создании: Общий, {c.firstLevel.languages.join(", ")}.</p>
      <p>Начальное распределение (дальнейшие изменения вносит мастер):</p>
      <ul>
        {statNames.map((name, i) => (
          <li key={name}>
            {name}: {c.baseStats?.[i]} + {c.firstLevel!.boosts[i]} ={" "}
            {(c.baseStats?.[i] || 0) + c.firstLevel!.boosts[i]}
          </li>
        ))}
      </ul>
    </section>
  );
}
