import { Character, OriginCard } from "./model";

export function initialAssetsError(
  draft: Character,
  card?: OriginCard,
  background?: OriginCard,
) {
  const choice = draft.firstLevel;
  if (!choice) return "";
  if (choice.calculateHp && !card?.hitDie)
    return "В этой версии класса не настроена кость хитов.";
  if (
    choice.backgroundGold &&
    choice.backgroundEquipment &&
    choice.backgroundEquipment !== "gold"
  )
    return "Выберите либо набор, либо золото происхождения.";
  const bgSelection =
    choice.backgroundEquipment || (choice.backgroundGold ? "gold" : "");
  if (
    bgSelection &&
    bgSelection !== "gold" &&
    !background?.startingPacks?.some((p) => p.id === bgSelection)
  )
    return "Выберите доступный набор происхождения.";
  if (bgSelection === "gold" && background?.startingGold === undefined)
    return "Золото происхождения не настроено.";
  if (choice.classEquipment === "gold" && card?.startingGold === undefined)
    return "Золото класса не настроено.";
  const pack = card?.startingPacks?.find((p) => p.id === choice.classEquipment);
  if (choice.classEquipment && choice.classEquipment !== "gold" && !pack)
    return "Выберите доступный набор класса.";
  if (
    pack?.toolOptions?.length &&
    (!pack.toolOptions.includes(choice.equipmentTool || "") ||
      (pack.useClassTool &&
        !choice.classTools?.includes(choice.equipmentTool || "")))
  )
    return "Выберите инструмент набора; для монаха он должен совпадать с владением класса.";
  if (choice.equipmentTool && !pack?.toolOptions?.length)
    return "В этом варианте инструмент не выбирается.";
  return "";
}

export function InitialAssetsChoices({
  draft,
  cards,
  card,
  background,
  change,
}: {
  draft: Character;
  cards: OriginCard[];
  card?: OriginCard;
  background?: OriginCard;
  change: (c: Character) => void;
}) {
  const choice = draft.firstLevel!;
  const update = (patch: Partial<NonNullable<Character["firstLevel"]>>) =>
    change({ ...draft, firstLevel: { ...choice, ...patch } });
  const pack = card?.startingPacks?.find((p) => p.id === choice.classEquipment);
  const species =
    draft.originCards?.species.id === draft.originChoices?.species
      ? draft.originCards?.species
      : cards.find((c) => c.id === draft.originChoices?.species);
  const bonus =
    (species?.firstLevelHpBonus || 0) +
    (card?.firstLevelHpBonus || 0) +
    (background?.firstLevelHpBonus || 0);
  const con = Math.floor((draft.stats[2] + choice.boosts[2] - 10) / 2);
  return (
    <section>
      <h3>Хиты первого уровня</h3>
      <label>
        <input
          type="checkbox"
          checked={!!choice.calculateHp}
          disabled={draft.version !== undefined || !card?.hitDie}
          onChange={(e) => update({ calculateHp: e.target.checked })}
        />
        Рассчитать начальные хиты
      </label>
      {card?.hitDie ? (
        <p>
          Кость хитов: к{card.hitDie}. Начальные хиты: {card.hitDie} + ({con})
          Телосложение + {bonus} от карточек ={" "}
          {Math.max(1, card.hitDie + con + bonus)}.
        </p>
      ) : (
        <p>Кость хитов не настроена в этой версии класса.</p>
      )}
      <p>
        Способ расчёта закрепляется при первом сохранении. Для дварфа
        учитывается +1; прочие бонусы от черт и последующие уровни проверяет
        мастер.
      </p>
      <h3>Стартовое снаряжение</h3>
      <label>
        Снаряжение класса
        <select
          value={choice.classEquipment || ""}
          onChange={(e) =>
            update({
              classEquipment: e.target.value || undefined,
              equipmentTool: undefined,
            })
          }
        >
          <option value="">Выдаёт мастер</option>
          {card?.startingGold !== undefined && (
            <option value="gold">Золото: {card.startingGold} зм</option>
          )}
          {card?.startingPacks?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {pack && (
        <>
          <ul>
            {pack.items.map((item, i) => (
              <li key={i}>
                {item.name} × {item.quantity}
              </li>
            ))}
          </ul>
          <p>Золото набора: {pack.gold} зм.</p>
        </>
      )}
      {!!pack?.toolOptions?.length && (
        <label>
          Инструмент в наборе
          <select
            value={choice.equipmentTool || ""}
            onChange={(e) =>
              update({ equipmentTool: e.target.value || undefined })
            }
          >
            <option value="">Выберите инструмент</option>
            {pack.toolOptions
              .filter(
                (t) => !pack.useClassTool || choice.classTools?.includes(t),
              )
              .map((t) => (
                <option key={t}>{t}</option>
              ))}
          </select>
          {pack.useClassTool && (
            <small>Сначала выберите владение инструментом монаха выше.</small>
          )}
        </label>
      )}
      <label>
        Снаряжение происхождения
        <select
          value={
            choice.backgroundEquipment || (choice.backgroundGold ? "gold" : "")
          }
          onChange={(e) =>
            update({
              backgroundEquipment: e.target.value || undefined,
              backgroundGold: false,
            })
          }
        >
          <option value="">Выдаёт мастер</option>
          {background?.startingGold !== undefined && (
            <option value="gold">Золото: {background.startingGold} зм</option>
          )}
          {background?.startingPacks?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {background?.startingPacks
        ?.filter((p) => p.id === choice.backgroundEquipment)
        .map((p) => (
          <div key={p.id}>
            <ul>
              {p.items.map((item, i) => (
                <li key={i}>
                  {item.name} × {item.quantity}
                </li>
              ))}
            </ul>
            {p.useBackgroundTool && (
              <p>
                Инструмент из владений происхождения:{" "}
                {choice.tool ||
                  (background.toolOptions?.length === 1
                    ? background.toolOptions[0]
                    : "выберите выше")}
                .
              </p>
            )}
            <p>Золото набора происхождения: {p.gold} зм.</p>
          </div>
        ))}
      <p>
        При выборе «Выдаёт мастер» автоматической выдачи от этого источника нет.
        Предметы появятся в инвентаре после сохранения. Наборы хранятся целиком;
        доспехи не экипируются автоматически. КД по боевым профилям включает
        мастер.
      </p>
    </section>
  );
}

export function InitialAssetsEditor({
  card,
  change,
}: {
  card: OriginCard;
  change: (c: OriginCard) => void;
}) {
  return (
    <section>
      <h3>Начальные хиты и золото</h3>
      {card.kind === "class" && (
        <label>
          Кость хитов
          <select
            value={card.hitDie || 0}
            onChange={(e) =>
              change({ ...card, hitDie: Number(e.target.value) || undefined })
            }
          >
            <option value="0">Не настроена</option>
            {[6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                к{n}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Дополнительные хиты первого уровня
        <input
          type="number"
          min="0"
          max="20"
          value={card.firstLevelHpBonus ?? ""}
          onChange={(e) =>
            change({
              ...card,
              firstLevelHpBonus:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </label>
      {card.kind !== "species" && (
        <label>
          Стартовое золото вместо набора
          <input
            type="number"
            min="0"
            max="10000"
            value={card.startingGold ?? ""}
            onChange={(e) =>
              change({
                ...card,
                startingGold:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      )}
      {!!card.startingPacks?.length && (
        <p>
          Готовые наборы сохранены в карточке:{" "}
          {card.startingPacks.map((p) => p.name).join(", ")}. Их состав пока
          фиксирован; после выдачи мастер может изменить предметы в инвентаре.
        </p>
      )}
    </section>
  );
}
