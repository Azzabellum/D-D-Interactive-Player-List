import { CombatFeatures } from "./model";
export function CombatFeaturesEditor({
  value,
  change,
}: {
  value: CombatFeatures;
  change: (v: CombatFeatures) => void;
}) {
  const styles = [
    ["archery", "Стрельба: +2 к атакам дальнобойным оружием"],
    ["defense", "Оборона: +1 КД в доспехе"],
    [
      "greatWeapon",
      "Бой большим оружием: 1 и 2 на костях урона считаются за 3",
    ],
    [
      "twoWeapon",
      "Бой двумя оружиями: модификатор к урону дополнительной атаки",
    ],
  ];
  return (
    <fieldset>
      <legend>Классовые боевые особенности</legend>
      <p>
        Мастер подтверждает наличие каждой особенности. Эти настройки не выдают
        черты и не проверяют требования их получения. Не дублируйте их бонусы в
        ручных поправках.
      </p>
      <label>
        Защита без доспехов
        <select
          value={value.defense}
          onChange={(e) =>
            change({
              ...value,
              defense: e.target.value as CombatFeatures["defense"],
            })
          }
        >
          <option value="standard">Обычная: 10 + Ловкость</option>
          <option value="barbarian">
            Варвар: 10 + Ловкость + Телосложение
          </option>
          <option value="monk">Монах: 10 + Ловкость + Мудрость</option>
        </select>
      </label>
      <p>
        Работает в режиме КД по экипировке. Доспех отключает обе особые формулы;
        щит также отключает формулу монаха. Формулы не складываются.
      </p>
      {styles.map(([id, label]) => (
        <label key={id}>
          <input
            type="checkbox"
            checked={value.styles.includes(id)}
            onChange={(e) =>
              change({
                ...value,
                styles: e.target.checked
                  ? [...value.styles, id]
                  : value.styles.filter((s) => s !== id),
              })
            }
          />
          {label}
        </label>
      ))}
      <label>
        Уровней монаха для боевых искусств (0 — отключены)
        <input
          type="number"
          min="0"
          max="20"
          required
          value={value.monkLevel}
          onChange={(e) =>
            change({ ...value, monkLevel: Number(e.target.value) })
          }
        />
      </label>
      <p>
        Уровень монаха задаётся отдельно от общего. Искусства требуют отсутствия
        доспеха и щита и использования только оружия монаха. В листе появятся
        безоружный удар и вариант замены кости урона. Хват оружия настраивается
        в его инвентарной карточке.
      </p>
    </fieldset>
  );
}
