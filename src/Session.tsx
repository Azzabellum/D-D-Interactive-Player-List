import { useEffect, useState, ReactNode } from "react";
import { api, User } from "./api";
import { ThemeButton, AppearanceSettings } from "./Appearance";
import { State } from "./model";

export function Session({
  children,
}: {
  children: (user: User, state: State, leave: () => void) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null),
    [setup, setSetup] = useState(false),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [campaigns, setCampaigns] = useState<
      { id: string; name: string; description: string; role: string }[]
    >([]),
    [active, setActive] = useState<State | null>(null);
  async function refresh() {
    try {
      const s = await api("/session");
      setUser(s.user);
      setSetup(s.setupRequired);
      if (s.user) setCampaigns(await api("/campaigns"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function leave() {
    setActive(null);
    void refresh();
  }
  if (active && user) return children(user, active, leave);
  const title = setup
    ? "Создайте аккаунт мастера"
    : mode === "register"
      ? "Присоединиться к приключению"
      : "С возвращением";
  return (
    <div className="gateway">
      <header>
        <span className="gateway-brand">✧ D&D IPL</span>
        <ThemeButton />
      </header>
      <main>
        {loading ? (
          <div className="panel">
            <h1>Открываем книгу приключений…</h1>
          </div>
        ) : !user ? (
          <form
            className="panel auth-card"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await api(
                  setup
                    ? "/setup"
                    : mode === "register"
                      ? "/auth/register"
                      : "/auth/login",
                  {
                    login: f.get("login"),
                    password: f.get("password"),
                    name: f.get("name"),
                    invitation: f.get("invitation"),
                  },
                );
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="eyebrow">ВАША ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</span>
            <h1>{title}</h1>
            <p>
              {setup
                ? "Этот аккаунт будет управлять локальной установкой. Стандартного пароля нет."
                : mode === "register"
                  ? "Для регистрации нужен одноразовый код приглашения от мастера."
                  : "Войдите в свой аккаунт. Доступ к кампаниям определяет мастер."}
            </p>
            {(setup || mode === "register") && (
              <label>
                Ваше имя
                <input
                  name="name"
                  autoComplete="nickname"
                  required
                  maxLength={60}
                />
              </label>
            )}
            <label>
              Логин
              <input
                name="login"
                autoComplete="username"
                required
                pattern="[a-zA-Z0-9_.\-]{3,40}"
                minLength={3}
                maxLength={40}
              />
              <small>
                Латинские буквы, цифры, точка, дефис или подчёркивание.
              </small>
            </label>
            <label>
              Пароль
              <input
                name="password"
                type="password"
                autoComplete={
                  setup || mode === "register"
                    ? "new-password"
                    : "current-password"
                }
                required
                minLength={setup || mode === "register" ? 10 : 1}
                maxLength={128}
              />
              {(setup || mode === "register") && (
                <small>Не менее 10 символов.</small>
              )}
            </label>
            {mode === "register" && !setup && (
              <label>
                Код приглашения
                <input name="invitation" autoComplete="off" required />
              </label>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary" type="submit">
              {busy
                ? "Подождите…"
                : setup
                  ? "Создать аккаунт мастера"
                  : mode === "register"
                    ? "Принять приглашение"
                    : "Войти"}
            </button>
            {!setup && (
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {mode === "login"
                  ? "У меня есть приглашение"
                  : "Уже есть аккаунт"}
              </button>
            )}
          </form>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <span className="eyebrow">{user.name}</span>
                <h1>Ваши кампании</h1>
                <p>Персонажи и записи хранятся на сервере мастера.</p>
              </div>
              <button
                onClick={async () => {
                  await api("/auth/logout", {});
                  setUser(null);
                  setCampaigns([]);
                }}
              >
                Выйти
              </button>
            </div>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <div className="library-grid">
              {campaigns.map((c) => (
                <button
                  className="panel campaign-entry"
                  key={c.id}
                  onClick={async () => {
                    try {
                      setActive(await api("/campaigns/" + c.id));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <span className="eyebrow">
                    {c.role === "dm" ? "Мастер" : "Игрок"} · D&D 2024
                  </span>
                  <h2>{c.name}</h2>
                  <p>{c.description || "Новая история ждёт своих героев."}</p>
                  <span>Открыть кампанию →</span>
                </button>
              ))}
            </div>
            {!campaigns.length && (
              <div className="empty">
                <h2>Приключений пока нет</h2>
                <p>
                  {user.admin
                    ? "Создайте свою первую кампанию ниже."
                    : "Введите код приглашения от мастера."}
                </p>
              </div>
            )}
            <div className="form-grid setup-panels">
              {user.admin && (
                <form
                  className="panel"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const form = e.currentTarget,
                      f = new FormData(form);
                    try {
                      await api("/campaigns", {
                        name: f.get("name"),
                        description: f.get("description"),
                      });
                      form.reset();
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <h2>Новая кампания</h2>
                  <label>
                    Название
                    <input name="name" required maxLength={90} />
                  </label>
                  <label>
                    Описание
                    <textarea name="description" maxLength={2000} />
                  </label>
                  <button className="primary" disabled={busy}>
                    Создать кампанию
                  </button>
                </form>
              )}
              <form
                className="panel"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  try {
                    await api("/join", {
                      invitation: new FormData(form).get("invitation"),
                    });
                    form.reset();
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <h2>Есть приглашение?</h2>
                <label>
                  Код приглашения
                  <input name="invitation" required />
                </label>
                <button>Присоединиться</button>
              </form>
            </div>
          </>
        )}
        <AppearanceSettings />
      </main>
      <footer>Локальное приложение · D&D IPL</footer>
    </div>
  );
}
