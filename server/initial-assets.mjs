const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};

export function buildInitialAssets(draft, choice, stats, previous) {
  const card = draft.originCards.class,
    background = draft.originCards.background;
  const result = {};
  if (
    previous.firstLevel &&
    !!previous.firstLevel.calculateHp !== !!choice.calculateHp
  )
    fail("Способ расчёта хитов закреплён при первом сохранении", 409);
  if (choice.calculateHp) {
    if (!card?.hitDie) fail("В карточке класса не настроена кость хитов");
    const constitution = Math.floor((stats[2] - 10) / 2);
    const bonus = Object.values(draft.originCards).reduce(
      (sum, c) => sum + (c.firstLevelHpBonus || 0),
      0,
    );
    const maxHp = Math.max(1, card.hitDie + constitution + bonus);
    Object.assign(result, {
      hp: maxHp,
      maxHp,
      level: 1,
      initialVitals: { hitDie: card.hitDie, constitution, bonus, maxHp },
    });
  }
  const prefix = `first-level:${draft.id}:`;
  const items = (previous.items || []).filter((i) => !i.id.startsWith(prefix));
  let gold = 0,
    backgroundGold = 0,
    selected;
  if (choice.classEquipment === "gold") {
    if (card?.startingGold === undefined)
      fail("Стартовое золото класса не настроено");
    gold += card.startingGold;
  } else if (choice.classEquipment) {
    selected = card?.startingPacks?.find((p) => p.id === choice.classEquipment);
    if (!selected) fail("Выберите доступный набор класса");
    gold += selected.gold;
    const names = [...selected.items];
    if (selected.toolOptions?.length) {
      if (!selected.toolOptions.includes(choice.equipmentTool))
        fail("Выберите инструмент в стартовом наборе");
      if (
        selected.useClassTool &&
        !choice.classTools?.includes(choice.equipmentTool)
      )
        fail("Инструмент набора должен совпадать с владением класса");
      names.push({ name: choice.equipmentTool, quantity: 1 });
    }
    for (const [index, item] of names.entries())
      items.push({
        id: prefix + index,
        name: item.name,
        quantity: item.quantity,
        combat: item.combat,
        weightGrams: item.weightGrams,
        type: "Стартовое снаряжение",
        description: `${card.name}: ${selected.name}. Наборы хранятся целиком; содержимое и свойства проверяет мастер.`,
        revealed: true,
        equipped: false,
      });
  }
  if (choice.equipmentTool && !selected?.toolOptions?.length)
    fail("В этом варианте инструмент не выбирается");
  if (
    choice.backgroundGold &&
    choice.backgroundEquipment &&
    choice.backgroundEquipment !== "gold"
  )
    fail("Нельзя одновременно выбрать золото и набор происхождения");
  const backgroundSelection =
    choice.backgroundEquipment || (choice.backgroundGold ? "gold" : undefined);
  let backgroundPack;
  if (backgroundSelection && backgroundSelection !== "gold") {
    backgroundPack = background.startingPacks?.find(
      (p) => p.id === backgroundSelection,
    );
    if (!backgroundPack) fail("Выберите доступный набор происхождения");
    backgroundGold = backgroundPack.gold;
    const entries = [...backgroundPack.items];
    if (backgroundPack.useBackgroundTool) {
      const tool =
        background.toolOptions?.length === 1
          ? background.toolOptions[0]
          : choice.tool;
      if (!tool || !background.toolOptions?.includes(tool))
        fail("Выберите инструмент происхождения для набора");
      entries.push({ name: tool, quantity: 1 });
    }
    entries.forEach((item, index) =>
      items.push({
        id: prefix + "background:" + index,
        name: item.name,
        quantity: item.quantity,
        combat: item.combat,
        weightGrams: item.weightGrams,
        type: "Стартовое снаряжение",
        description: `${background.name}: ${backgroundPack.name}. Свойства предмета проверяет мастер.`,
        revealed: true,
        equipped: false,
      }),
    );
    gold += backgroundGold;
  }
  if (backgroundSelection === "gold") {
    if (background.startingGold === undefined)
      fail("Стартовое золото происхождения не настроено");
    backgroundGold = background.startingGold;
    gold += backgroundGold;
  }
  if (gold)
    items.push({
      id: prefix + "gold",
      name: "Золотые монеты",
      type: "Валюта",
      quantity: gold,
      revealed: true,
      description: `При создании: класс ${gold - backgroundGold} зм; происхождение ${backgroundGold} зм. Покупки учитывает мастер.`,
    });
  if (
    choice.classEquipment ||
    backgroundSelection ||
    previous.initialEquipment
  ) {
    result.items = items;
    result.initialEquipment =
      choice.classEquipment || backgroundSelection
        ? {
            className: card?.name || "",
            classChoice:
              selected?.name ||
              (choice.classEquipment === "gold" ? "Золото" : "Выдаёт мастер"),
            backgroundChoice:
              backgroundPack?.name ||
              (backgroundSelection === "gold" ? "Золото" : "Выдаёт мастер"),
            backgroundGold,
            gold,
          }
        : undefined;
  }
  return result;
}
