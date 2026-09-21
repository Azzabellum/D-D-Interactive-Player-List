import catalog from "../shared/starter.json";
import { Character, statNames } from "./model";

export function defaultCreation(): NonNullable<Character["creation"]> {
  return {
    pack: catalog.id,
    boosts: [2, 0, 1],
    skills: ["perception", "survival"],
    languages: ["Дварфский", "Орочий"],
    gamingSet: "Игральные кости",
    weapons: ["Длинный меч", "Короткий лук", "Копьё"],
  };
}
export function creationError(draft: Character) {
  const c = draft.creation;
  if (!c) return "";
  if (c.boosts.reduce((a, b) => a + b, 0) !== 3)
    return "Бонусы происхождения: выберите +2/+1 или +1/+1/+1.";
  if (new Set(c.skills).size !== 2) return "Выберите два разных навыка воина.";
  if (new Set(c.languages).size !== 2)
    return "Выберите два разных дополнительных языка.";
  if (new Set(c.weapons).size !== 3)
    return "Выберите три разных вида оружия для мастерства.";
  return "";
}
export function StarterIdentity({
  draft,
  change,
}: {
  draft: Character;
  change: (draft: Character) => void;
}) {
  const eligible =
    draft.species === "Дварф" &&
    draft.cls === "Воин" &&
    draft.background === "Солдат" &&
    (!draft.originChoices ||
      (draft.originChoices.species === "core2024-species-dwarf" &&
        draft.originChoices.class === "core2024-class-fighter" &&
        draft.originChoices.background === "core2024-background-soldier"));
  return (
    <>
      <p>
        <strong>
          {draft.species || "Вид не выбран"} · {draft.cls || "Класс не выбран"}{" "}
          · {draft.background || "Происхождение не выбрано"}
        </strong>
      </p>
      {eligible && (
        <label>
          <input
            type="checkbox"
            disabled={draft.version !== undefined}
            checked={!!draft.creation}
            onChange={(e) =>
              change({
                ...draft,
                creation: e.target.checked ? defaultCreation() : undefined,
                firstLevel: undefined,
              })
            }
          />{" "}
          Использовать проверенный стартовый шаблон SRD
        </label>
      )}
      {draft.creation ? (
        <>
          <h3>{catalog.title}</h3>
          <p>
            Авторасчёт первого уровня: Оборона, старт деньгами 205 зм.
            Сохранение черновика пересчитывает стартовые параметры и карточки.
            Дополнительные выборы — на шаге характеристик.
          </p>
        </>
      ) : (
        <p className="notice warning">
          Карточки выбраны. Полная автоматизация этого сочетания ещё не
          подключена: мастер проверит владения, черты, заклинания, здоровье и
          снаряжение перед игрой.
        </p>
      )}
    </>
  );
}
export function StarterChoices({
  draft,
  change,
}: {
  draft: Character;
  change: (draft: Character) => void;
}) {
  const c = draft.creation;
  if (!c) return null;
  function update(next: NonNullable<Character["creation"]>) {
    change({ ...draft, creation: next });
  }
  const finalStats = draft.stats.map((n, i) => n + (c!.boosts[i] || 0));
  return (
    <>
      <h3>Бонусы солдата</h3>
      <p>
        Распределите +2 и +1 между разными характеристиками или по +1 каждой.
      </p>
      <div className="form-grid">
        {c.boosts.map((value, i) => (
          <label key={i}>
            Бонус: {statNames[i]}
            <select
              value={value}
              onChange={(e) =>
                update({
                  ...c,
                  boosts: c.boosts.map((n, j) =>
                    i === j ? Number(e.target.value) : n,
                  ),
                })
              }
            >
              {[0, 1, 2].map((n) => (
                <option value={n} key={n}>
                  +{n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p>
        Итоговые характеристики: {finalStats.join(" / ")}. Хиты:{" "}
        {11 + Math.floor((finalStats[2] - 10) / 2)}. КД без доспехов:{" "}
        {10 + Math.floor((finalStats[1] - 10) / 2)}.
      </p>
      <h3>Навыки воина</h3>
      <p>
        Атлетика и Запугивание уже получены от солдата. Выберите ещё два разных
        навыка.
      </p>
      <div className="form-grid">
        {c.skills.map((value, i) => (
          <label key={i}>
            Навык воина {i + 1}
            <select
              value={value}
              onChange={(e) =>
                update({
                  ...c,
                  skills: c.skills.map((s, j) =>
                    j === i ? e.target.value : s,
                  ),
                })
              }
            >
              {catalog.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <h3>Языки</h3>
      <p>Общий известен всем. Выберите два дополнительных языка.</p>
      <div className="form-grid">
        {c.languages.map((value, i) => (
          <label key={i}>
            Дополнительный язык {i + 1}
            <select
              value={value}
              onChange={(e) =>
                update({
                  ...c,
                  languages: c.languages.map((s, j) =>
                    j === i ? e.target.value : s,
                  ),
                })
              }
            >
              {catalog.languages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label>
        Владение игровым набором
        <select
          value={c.gamingSet}
          onChange={(e) => update({ ...c, gamingSet: e.target.value })}
        >
          {catalog.gamingSets.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <h3>Мастерство оружия</h3>
      <p>
        Выберите три вида из поддержанного набора. Это владение свойствами
        оружия, а не его выдача.
      </p>
      <div className="form-grid">
        {c.weapons.map((value, i) => (
          <label key={i}>
            Мастерство оружия {i + 1}
            <select
              value={value}
              onChange={(e) =>
                update({
                  ...c,
                  weapons: c.weapons.map((s, j) =>
                    j === i ? e.target.value : s,
                  ),
                })
              }
            >
              {catalog.weapons.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {creationError(draft) && <p role="alert">{creationError(draft)}</p>}
      <a
        href="https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf"
        target="_blank"
        rel="noreferrer"
      >
        Правила шаблона: SRD 5.2.1
      </a>
    </>
  );
}
