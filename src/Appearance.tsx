import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
type Pref = { theme: "light" | "dark"; size: "standard" | "large" | "xlarge" };
const AppearanceContext = createContext<{
  pref: Pref;
  setPref: (p: Pref) => void;
}>({ pref: { theme: "light", size: "standard" }, setPref: () => {} });
function load(): Pref {
  try {
    const p = JSON.parse(localStorage.getItem("ipl-appearance") || "null");
    if (
      p &&
      ["light", "dark"].includes(p.theme) &&
      ["standard", "large", "xlarge"].includes(p.size)
    )
      return p;
  } catch {}
  return {
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    size: "standard",
  };
}
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<Pref>(load);
  useEffect(() => {
    document.documentElement.dataset.theme = pref.theme;
    document.documentElement.dataset.textSize = pref.size;
    try {
      localStorage.setItem("ipl-appearance", JSON.stringify(pref));
    } catch {}
  }, [pref]);
  return (
    <AppearanceContext.Provider value={{ pref, setPref }}>
      {children}
    </AppearanceContext.Provider>
  );
}
export function ThemeButton() {
  const { pref, setPref } = useContext(AppearanceContext);
  return (
    <button
      className="theme-button"
      aria-label={
        pref.theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
      }
      onClick={() =>
        setPref({ ...pref, theme: pref.theme === "dark" ? "light" : "dark" })
      }
    >
      {pref.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
      <span>{pref.theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>
    </button>
  );
}
export const statKeys = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const tagNames = {
  str: "Сила",
  dex: "Ловкость",
  con: "Телосложение",
  int: "Интеллект",
  wis: "Мудрость",
  cha: "Харизма",
};
export function StatTags({ tags = [] }: { tags?: string[] }) {
  return (
    <div className="stat-tags">
      {tags
        .filter((t) => t in tagNames)
        .map((t) => (
          <span key={t} className={"stat-tag stat-" + t}>
            {tagNames[t as keyof typeof tagNames]}
          </span>
        ))}
    </div>
  );
}
export function AppearanceSettings() {
  const { pref, setPref } = useContext(AppearanceContext);
  return (
    <section className="panel appearance">
      <h2>Оформление и читаемость</h2>
      <p>
        Настройки сохраняются на этом устройстве и не меняют внешний вид у
        других игроков.
      </p>
      <div className="form-grid">
        <label>
          Цветовая тема
          <select
            value={pref.theme}
            onChange={(e) =>
              setPref({ ...pref, theme: e.target.value as Pref["theme"] })
            }
          >
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
        <label>
          Размер текста
          <select
            value={pref.size}
            onChange={(e) =>
              setPref({ ...pref, size: e.target.value as Pref["size"] })
            }
          >
            <option value="standard">Обычный — 100%</option>
            <option value="large">Крупный — 115%</option>
            <option value="xlarge">Очень крупный — 130%</option>
          </select>
        </label>
      </div>
      <h3>Цвета характеристик</h3>
      <StatTags tags={[...statKeys]} />
      <p className="muted">
        Цвет связывает характеристику, навык и тег предмета. Названия
        сохраняются при любой теме.
      </p>
    </section>
  );
}
