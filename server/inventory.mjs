export function inventoryWeight(items = []) {
  return items.reduce(
    (total, item) => {
      const quantity = item.quantity ?? 1;
      if (item.weightGrams === undefined) {
        total.unknownItems++;
        total.unknownUnits += quantity;
      } else total.knownGrams += item.weightGrams * quantity;
      return total;
    },
    { knownGrams: 0, unknownItems: 0, unknownUnits: 0 },
  );
}
