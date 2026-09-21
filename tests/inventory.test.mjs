import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryWeight } from "../server/inventory.mjs";
test("Вес: количество, ноль, неизвестный вес и разделение стопки", () => {
  assert.deepEqual(inventoryWeight(), {
    knownGrams: 0,
    unknownItems: 0,
    unknownUnits: 0,
  });
  const items = [
    { weightGrams: 125, quantity: 3 },
    { weightGrams: 0 },
    { quantity: 2 },
    {},
  ];
  assert.deepEqual(inventoryWeight(items), {
    knownGrams: 375,
    unknownItems: 2,
    unknownUnits: 3,
  });
  assert.equal(
    inventoryWeight([
      { weightGrams: 125, quantity: 2 },
      { weightGrams: 125, quantity: 1, equipped: true },
    ]).knownGrams,
    375,
  );
  assert.equal(
    inventoryWeight([{ weightGrams: 1, quantity: 9999 }]).knownGrams,
    9999,
  );
});
