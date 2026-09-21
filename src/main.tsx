import { CombatResults } from "./Combat";
import {
  FirstLevelChoices,
  FirstLevelProfile,
  firstLevelError,
} from "./FirstLevel";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Users,
  Backpack,
  ScrollText,
  Settings,
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  Heart,
  Shield,
  ChevronRight,
  Feather,
  Eye,
  Lock,
  Check,
  X,
  Send,
  RotateCcw,
  Compass,
  Sparkles,
  Swords,
  Menu,
  CheckCircle2,
  CircleHelp,
} from "lucide-react";
import {
  Character,
  Event,
  Item,
  State,
  library as defaultLibrary,
  labels,
  modifier,
  signed,
  statNames,
} from "./model";
import "./style.css";
import { api, ApiError, User } from "./api";
import { Session } from "./Session";
import {
  AppearanceProvider,
  AppearanceSettings,
  ThemeButton,
  StatTags,
  statKeys,
} from "./Appearance";
import { UnsavedChangesProvider, useUnsavedChanges } from "./UnsavedChanges";
import { NoteEditor } from "./NoteEditor";
import { ItemEditor } from "./ItemEditor";
import { LibraryTools } from "./LibraryTools";
import {
  StarterIdentity,
  StarterChoices,
  defaultCreation,
  creationError,
} from "./StarterChoices";
import { InventoryEditor, InventoryStatus } from "./InventoryEditor";
import { CharacterRulesEditor, RuleResults } from "./CharacterRules";
import { AbilityLibrary, CharacterAbilities } from "./Abilities";
import { CharacterResources } from "./Resources";
import {
  OriginProfile,
  OriginLibrary,
  OriginStep,
  originKinds,
} from "./OriginCatalog";
import { CharacterConditions } from "./Conditions";
import { CarryWeight, formatWeight } from "./Weight";
import { CharacterAdjustments, AdjustmentSources } from "./Adjustments";

type Page =
  | "campaigns"
  | "party"
  | "sheet"
  | "library"
  | "abilityLibrary"
  | "libraryTools"
  | "originLibrary"
  | "history"
  | "settings"
  | "create";
type Modal =
  | "health"
  | "give"
  | "return"
  | "campaign"
  | "item"
  | "inventory"
  | "rules"
  | null;
function App({
  user,
  initial,
  leave,
}: {
  user: User;
  initial: State;
  leave: () => void;
}) {
  const [state, setState] = useState<State>(initial),
    [role] = useState<"dm" | "player">(initial.role || "player"),
    [page, setPage] = useState<Page>("party");
  const [selected, setSelected] = useState("aria"),
    [tab, setTab] = useState("Обзор"),
    [modal, setModal] = useState<Modal>(null),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Все");
  const library = [
    ...new Map(
      [...defaultLibrary, ...(state.library || [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ].filter((item) => !state.libraryArchive?.items.includes(item.id));
  const [editingItem, setEditingItem] = useState<Item>(defaultLibrary[0]);
  const [editorVersion, setEditorVersion] = useState(initial.version);
  const [rulesEdit, setRulesEdit] = useState<Character | null>(null);
  const [inventoryEdit, setInventoryEdit] = useState<{
    character: Character;
    item: Item;
  } | null>(null);
  function editItem(item?: Item) {
    setEditingItem(
      item
        ? { ...item, revealed: false }
        : {
            id: crypto.randomUUID(),
            name: "",
            type: "Снаряжение",
            description: "",
            secret: "",
            revealed: false,
            tags: [],
          },
    );
    setEditorVersion(state.version);
    setModal("item");
  }
  const [chosen, setChosen] = useState<Item>(library[0] || defaultLibrary[0]),
    [recipient, setRecipient] = useState("aria"),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState(true),
    [menu, setMenu] = useState(false),
    [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Character | null>(null),
    [noteScope, setNoteScope] = useState(
      initial.role === "dm" ? "dm" : "personal",
    );
  const [modalDirty, setModalDirty] = useState(false);
  const draftBaseline = useRef("");
  const requestLeave = useUnsavedChanges(
    (page === "create" && JSON.stringify(draft) !== draftBaseline.current) ||
      (!!modal && modalDirty),
  );
  const [invite, setInvite] = useState("");
  const [historyCharacter, setHistoryCharacter] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const historyEvents = state.events.filter(
    (event) =>
      (!historyCharacter || event.characterId === historyCharacter) &&
      (historyStatus === "all" ||
        (historyStatus === "undone" ? event.undone : !event.undone)) &&
      `${event.title} ${event.detail} ${event.before.name}`
        .toLocaleLowerCase("ru")
        .includes(historySearch.trim().toLocaleLowerCase("ru")),
  );
  const [busy, setBusy] = useState(false);
  const requestBusy = useRef(false);
  const requestSerial = useRef(0);
  const refreshNow = useRef<() => void>(() => {});
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dm = role === "dm";
  const visible = state.characters;
  const character = visible.find((c) => c.id === selected) || visible[0];
  useEffect(() => {
    let stopped = false;
    async function refresh() {
      const serial = ++requestSerial.current;
      try {
        const next = await api<State>("/campaigns/" + initial.id);
        if (
          !stopped &&
          serial === requestSerial.current &&
          !requestBusy.current
        ) {
          setState(next);
          setSaved(true);
        }
      } catch (e) {
        if (!stopped) {
          setSaved(false);
          if (e instanceof ApiError && [401, 403].includes(e.status)) leave();
        }
      }
    }
    let socket: WebSocket;
    let reconnect: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    const reload = () => {
      if (!requestBusy.current) void refresh();
    };
    const offline = () => setSaved(false);
    function connect() {
      if (stopped) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/updates`,
      );
      socket.onmessage = reload;
      socket.onopen = () => {
        retryDelay = 1000;
        reload();
      };
      socket.onclose = () => {
        if (stopped) return;
        reconnect = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
    }
    connect();
    refreshNow.current = reload;
    window.addEventListener("online", reload);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", reload);
    const timer = setInterval(() => {
      if (!requestBusy.current) void refresh();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(reconnect);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", reload);
      socket?.close();
    };
  }, [initial.id]);
  async function mutate(body: Record<string, unknown>, message: string) {
    if (requestBusy.current) return false;
    requestBusy.current = true;
    setBusy(true);
    requestSerial.current++;
    try {
      const next = await api<State>("/campaigns/" + state.id + "/action", {
        ...body,
        operationId: crypto.randomUUID(),
      });
      setState(next);
      setSaved(true);
      setToast(message);
      return true;
    } catch (e) {
      if (!(e instanceof ApiError)) setSaved(false);
      setToast((e as Error).message);
      if (e instanceof ApiError && [401, 403].includes(e.status)) leave();
      return false;
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setModalDirty(false);
    if (modal) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [modal]);
  function navigate(next: Page) {
    requestLeave(() => {
      setPage(next);
      setMenu(false);
      setSearch("");
    });
  }
  function openChar(c: Character) {
    setSelected(c.id);
    setTab("Обзор");
    navigate("sheet");
  }
  async function updateCharacter(
    id: string,
    transform: (c: Character) => Character,
    title: string,
    detail: string,
  ) {
    if (!dm) return false;
    const before = state.characters.find((c) => c.id === id);
    if (!before) return false;
    const after = transform(structuredClone(before));
    const patch = Object.fromEntries(
      Object.entries(after).filter(
        ([k, v]) =>
          JSON.stringify(v) !== JSON.stringify(before[k as keyof Character]),
      ),
    );
    return await mutate(
      {
        type: "character",
        id,
        version: before.version,
        data: patch,
        title,
        detail,
      },
      title,
    );
  }
  async function undo(e: Event) {
    if (dm)
      await mutate({ type: "undo", id: e.id, data: {} }, "Изменение отменено");
  }
  function startDraft(c?: Character) {
    const nextDraft: Character = c
      ? {
          ...structuredClone(c),
          stats:
            c.creation || c.firstLevel
              ? [...(c.baseStats || c.stats)]
              : [...c.stats],
        }
      : {
          id: crypto.randomUUID(),
          name: "",
          owner: user.name,
          species: "",
          cls: "",
          background: "",
          originChoices: { species: "", class: "", background: "" },
          hp: 12,
          maxHp: 12,
          ac: 14,
          status: "draft",
          bio: "",
          note: "",
          dmNote: "",
          feedback: "",
          stats: [15, 14, 13, 12, 10, 8],
          items: [],
          color: "#718876",
        };
    draftBaseline.current = JSON.stringify(nextDraft);
    setDraft(nextDraft);
    setStep(0);
    navigate("create");
  }
  async function storeDraft(submit = false) {
    if (!draft) return false;
    if (!draft.name.trim()) {
      setStep(3);
      setToast("Введите имя персонажа");
      return false;
    }
    if (
      !draft.species ||
      !draft.cls ||
      !draft.background ||
      (draft.originChoices &&
        Object.values(draft.originChoices).some((v) => !v))
    ) {
      setToast("Выберите вид, класс и происхождение");
      setStep(0);
      return false;
    }
    const problem =
      creationError(draft) ||
      firstLevelError(draft, state.characterOptions || []);
    if (problem) {
      setStep(4);
      setToast(problem);
      return false;
    }
    const next = {
      ...draft,
      status: submit ? ("submitted" as const) : ("draft" as const),
    };
    const ok = await mutate(
      { type: "draft", version: draft.version, data: next },
      submit ? "Персонаж отправлен мастеру" : "Черновик сохранён",
    );
    if (ok) {
      setSelected(next.id);
      draftBaseline.current = JSON.stringify(draft);
      setPage("sheet");
      setTab("Обзор");
    }
    return ok;
  }
  const counts = state.characters.filter(
    (c) => c.status === "submitted",
  ).length;
  const nav = [
    { id: "party", label: dm ? "Группа" : "Мои персонажи", icon: Users },
    { id: "library", label: "Библиотека", icon: BookOpen },
    { id: "history", label: "История", icon: ScrollText },
    { id: "settings", label: "Настройки", icon: Settings },
  ].filter((n) => dm || !["library", "history"].includes(n.id));
  return (
    <div className="app">
      <aside className={"sidebar " + (menu ? "expanded" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            requestLeave(leave);
          }}
        >
          <span className="brand-mark">✧</span>
          <span>
            D&D <b>IPL</b>
            <small>ТВОЯ ИСТОРИЯ. ВАША ИГРА.</small>
          </span>
        </a>
        <button className="campaign-switch" onClick={() => requestLeave(leave)}>
          <Compass size={22} />
          <span>
            {state.campaign}
            <small>Кампания · D&D 2024</small>
          </span>
          <ChevronRight size={16} />
        </button>
        <div className="nav-label">ПРИКЛЮЧЕНИЕ</div>
        <nav>
          {nav.map((n) => (
            <button
              className={
                page === n.id ||
                (n.id === "library" &&
                  ["abilityLibrary", "libraryTools", "originLibrary"].includes(
                    page,
                  )) ||
                (n.id === "party" && ["sheet", "create"].includes(page))
                  ? "active"
                  : ""
              }
              key={n.id}
              onClick={() => navigate(n.id as Page)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "party" && dm && counts > 0 && (
                <span className="nav-count">{counts}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-quote">
          <Feather size={24} />
          <p>
            Не все, кто странствует,
            <br />
            сбились с пути.
          </p>
          <span>НОВАЯ ГЛАВА ЖДЁТ</span>
        </div>
        <div className="identity">
          <div className="avatar small">{dm ? "М" : "А"}</div>
          <div>
            {user.name}
            <small>{dm ? "Мастер кампании" : "Игрок"}</small>
          </div>
          <span className="dot" />
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Открыть меню"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Кампании <ChevronRight size={13} /> <b>{state.campaign}</b>
          </span>
          <div className="demo-controls">
            <ThemeButton />
            <button
              onClick={() =>
                requestLeave(() => {
                  void api("/auth/logout", {})
                    .then(leave)
                    .catch((e) => setToast(e.message));
                })
              }
            >
              Выйти
            </button>
          </div>
        </header>
        <main aria-busy={busy}>
          {busy && (
            <div className="save-pending" role="status">
              Сохранение…
            </div>
          )}
          {!saved && (
            <div className="notice warning" role="status">
              Связь с сервером потеряна. Показаны последние полученные данные;
              несохранённый текст остаётся в открытой форме. После
              восстановления связи повторите сохранение.
              <button onClick={() => refreshNow.current()}>
                Проверить связь
              </button>
            </div>
          )}
          {page === "campaigns" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ВАШИ МИРЫ</span>
                  <h1>Кампании</h1>
                  <p>У каждой истории есть начало. Продолжим вашу?</p>
                </div>
              </div>
              <button
                className="campaign-card"
                onClick={() => navigate("party")}
              >
                <div className="landscape">
                  <span className="moon" />
                  <span className="mountains" />
                  <Compass size={70} />
                </div>
                <div>
                  <span className="eyebrow">D&D 2024 · SRD 5.2.1</span>
                  <h2>{state.campaign}</h2>
                  <p>{state.description}</p>
                  <span className="text-link">
                    Открыть кампанию <ArrowRight size={16} />
                  </span>
                </div>
              </button>
            </>
          )}
          {page === "party" && (
            <>
              <div className="hero">
                <div className="hero-content">
                  <span className="eyebrow">КАМПАНИЯ · D&D 2024</span>
                  <h1>{state.campaign}</h1>
                  <p>{state.description}</p>
                  <div className="hero-meta">
                    <span>
                      <Users size={15} /> Участников: {state.memberCount || 1}
                    </span>
                    <span>История вашей группы</span>
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit" />
                  <Compass size={150} strokeWidth={0.65} />
                  <span>СЕВЕР • МОРЕ • НЕИЗВЕДАННОЕ</span>
                </div>
                {dm && (
                  <button
                    className="hero-edit"
                    onClick={() => setModal("campaign")}
                  >
                    Изменить описание
                  </button>
                )}
              </div>
              <div className="section-heading">
                <div>
                  <h2>{dm ? "Ваши искатели приключений" : "Мои персонажи"}</h2>
                  <p>
                    {dm
                      ? "Вся группа перед глазами. Каждая история под вашим присмотром."
                      : "История меняется. Ваш лист всегда рядом."}
                  </p>
                </div>
                <button className="primary" onClick={() => startDraft()}>
                  <Plus size={17} /> Создать персонажа
                </button>
              </div>
              {dm && counts > 0 && (
                <div className="review-banner">
                  <span className="round-icon">
                    <Feather size={19} />
                  </span>
                  <div>
                    <b>
                      {counts}{" "}
                      {counts === 1 ? "персонаж ждёт" : "персонажа ждут"}{" "}
                      утверждения
                    </b>
                    <p>Проверьте анкету перед началом приключения.</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() =>
                      openChar(
                        state.characters.find((c) => c.status === "submitted")!,
                      )
                    }
                  >
                    Рассмотреть <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <div className="character-grid">
                {visible.map((c) => (
                  <button
                    className="character-card"
                    key={c.id}
                    onClick={() => openChar(c)}
                  >
                    <div className="card-top">
                      <div className="avatar" style={{ background: c.color }}>
                        {c.name[0]}
                        <Sparkles size={17} />
                      </div>
                      <span className={"badge " + c.status}>
                        {labels[c.status]}
                      </span>
                    </div>
                    <span className="character-owner">
                      {c.owner} · Уровень {c.level ?? 1}
                    </span>
                    <h3>{c.name}</h3>
                    <p>
                      {c.species} · {c.cls}
                    </p>
                    {!!c.conditions?.length && (
                      <p className="muted">Состояний: {c.conditions.length}</p>
                    )}
                    {c.concentration && (
                      <p className="muted">
                        Концентрация: {c.concentration.name}
                      </p>
                    )}
                    <div className="card-stats">
                      <span>
                        <Heart size={16} /> <b>{c.hp}</b>
                        <small>/ {c.maxHp}</small>
                      </span>
                      <span>
                        <Shield size={16} />
                        <b>{c.derived?.ac ?? c.ac}</b>
                        <small>КД</small>
                      </span>
                    </div>
                    <div className="hp-track">
                      <i
                        style={{
                          width: (c.hp / c.maxHp) * 100 + "%",
                          background:
                            c.hp < c.maxHp / 2 ? "#b46751" : undefined,
                        }}
                      />
                    </div>
                    <div className="card-footer">
                      Открыть лист <ArrowRight size={16} />
                    </div>
                  </button>
                ))}
              </div>
              <div className="session-note">
                <ScrollText size={24} />
                <div>
                  <span className="eyebrow">НА ПОЛЯХ КАМПАНИИ</span>
                  <h3>Общие записи кампании</h3>
                  <p>
                    {state.commonNote ||
                      "Мастер пока не добавил общих записей."}
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "sheet" && character && (
            <>
              <button className="back" onClick={() => navigate("party")}>
                <ArrowLeft size={16} /> К персонажам
              </button>
              <div className="sheet-heading">
                <div
                  className="avatar large"
                  style={{ background: character.color }}
                >
                  {character.name[0]}
                </div>
                <div>
                  <div className="eyebrow">
                    {character.owner} · УРОВЕНЬ {character.level ?? 1}
                  </div>
                  <h1>{character.name}</h1>
                  <p>
                    {character.species} · {character.cls} ·{" "}
                    {character.background}
                  </p>
                </div>
                <span className={"badge " + character.status}>
                  {labels[character.status]}
                </span>
              </div>
              {character.status === "submitted" && (
                <div className="review-banner">
                  <Feather />
                  <div>
                    <b>Анкета отправлена мастеру</b>
                    <p>
                      {dm
                        ? "Проверьте данные и примите решение."
                        : "Редактирование закрыто до решения мастера."}
                    </p>
                  </div>
                  {dm && (
                    <div className="actions">
                      <button onClick={() => setModal("return")}>
                        Вернуть
                      </button>
                      <button
                        className="primary"
                        onClick={() =>
                          updateCharacter(
                            character.id,
                            (c) => ({ ...c, status: "approved", feedback: "" }),
                            "Персонаж утверждён",
                            character.name,
                          )
                        }
                      >
                        <Check size={16} /> Утвердить
                      </button>
                    </div>
                  )}
                </div>
              )}
              {character.status === "draft" && (
                <div className="review-banner">
                  <Feather />
                  <div>
                    <b>Черновик персонажа</b>
                    <p>
                      {character.feedback ||
                        "Завершите анкету и отправьте её мастеру."}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => startDraft(character)}
                  >
                    Продолжить анкету
                  </button>
                </div>
              )}
              {!dm && character.status === "approved" && (
                <div className="readonly">
                  <Lock size={14} /> Игровые данные изменяет мастер. Личные
                  заметки доступны для редактирования.
                </div>
              )}
              <div className="tabs" role="tablist" aria-label="Разделы листа">
                {[
                  "Обзор",
                  "Инвентарь",
                  "Способности",
                  "Биография",
                  "Заметки",
                ].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "current" : ""}
                    key={t}
                    onClick={() => {
                      if (t !== tab) requestLeave(() => setTab(t));
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tab === "Обзор" && (
                <>
                  <div className="vitals">
                    <div className="panel health-panel">
                      <span className="eyebrow">
                        <Heart size={15} /> ЗДОРОВЬЕ
                      </span>
                      <div className="vital-number">
                        {character.hp}
                        <small>/ {character.maxHp}</small>
                      </div>
                      {character.initialVitals && (
                        <small>
                          При создании: {character.initialVitals.maxHp} хитов ·
                          к{character.initialVitals.hitDie}
                        </small>
                      )}
                      <div className="hp-track">
                        <i
                          style={{
                            width: (character.hp / character.maxHp) * 100 + "%",
                          }}
                        />
                      </div>
                      {dm && (
                        <button
                          className="subtle"
                          onClick={() => setModal("health")}
                        >
                          Изменить здоровье
                        </button>
                      )}
                    </div>
                    <div className="panel">
                      <span className="eyebrow">
                        <Shield size={15} /> КЛАСС ДОСПЕХА
                      </span>
                      <div className="vital-number">
                        {character.derived?.ac ?? character.ac}
                      </div>
                      <small>
                        Базовое значение:{" "}
                        {character.derived?.combat?.baseAc ?? character.ac}
                      </small>
                      <AdjustmentSources character={character} target="ac" />
                      <small>
                        {character.acMode === "equipment"
                          ? "По экипировке · подробности ниже"
                          : character.rulesConfigured
                            ? character.acSource === "starter"
                              ? "Старт без доспехов: 10 + Ловкость"
                              : "Задано мастером"
                            : "Начальное значение — требует проверки"}
                      </small>
                    </div>
                    <div className="panel">
                      <span className="eyebrow">
                        <Sparkles size={15} /> БОНУС МАСТЕРСТВА
                      </span>
                      <div className="vital-number">
                        {signed(character.derived?.proficiency ?? 2)}
                      </div>
                      <small>
                        По уровню {character.level ?? 1} · SRD 5.2.1
                      </small>
                    </div>
                  </div>
                  <div className="section-heading compact">
                    <h2>Характеристики</h2>
                    {dm ? (
                      <button
                        onClick={() => {
                          setRulesEdit(structuredClone(character));
                          setModal("rules");
                        }}
                      >
                        Изменить параметры
                      </button>
                    ) : (
                      <span className="muted">Изменяет мастер</span>
                    )}
                  </div>
                  <div className="ability-grid">
                    {character.stats.map((v, i) => (
                      <div className="ability" key={i}>
                        <span className={"stat-label stat-" + statKeys[i]}>
                          {statNames[i]}
                        </span>
                        <strong>{signed(modifier(v))}</strong>
                        <small>{v}</small>
                      </div>
                    ))}
                  </div>
                  <div className="panel hint">
                    <CircleHelp size={20} />
                    <p>
                      Навыки, спасброски и инициатива рассчитываются по
                      выбранным мастером параметрам. Классовые особенности,
                      происхождение и сложные эффекты учитывает мастер. Явно
                      настроенные числовые эффекты предметов включаются при
                      экипировке и необходимой настройке.
                    </p>
                  </div>
                  <p className="muted">
                    {character.creation
                      ? "Создано по стартовому шаблону SRD: Дварф · Воин · Солдат, уровень 1. Дальнейшие изменения ведёт мастер."
                      : "Ручная анкета: класс и происхождение проверяет мастер."}
                  </p>
                  <CharacterConditions
                    key={character.id + "conditions"}
                    character={character}
                    dm={dm}
                    busy={busy}
                    save={(values, version) =>
                      mutate(
                        {
                          type: "character",
                          id: character.id,
                          version,
                          data: values,
                          title: "Состояния и концентрация изменены",
                          detail: "Обновлены отметки мастера",
                        },
                        "Состояния сохранены",
                      )
                    }
                  />
                  <CombatResults character={character} />
                  <RuleResults character={character} />
                </>
              )}
              {tab === "Инвентарь" && (
                <>
                  <CarryWeight character={character} />
                  <div className="section-heading compact">
                    <div>
                      <h2>В дорожной сумке</h2>
                      <p>
                        Позиций: {character.items.length} · Всего единиц:{" "}
                        {character.items.reduce(
                          (sum, item) => sum + (item.quantity ?? 1),
                          0,
                        )}
                      </p>
                    </div>
                    {dm && (
                      <button
                        className="primary"
                        onClick={() => {
                          setRecipient(
                            character?.id || state.characters[0]?.id || "",
                          );
                          if (!library.length) {
                            setToast(
                              "Нет активных шаблонов. Создайте предмет или восстановите его из архива.",
                            );
                            return;
                          }
                          setChosen(library[0]);
                          setModal("give");
                        }}
                      >
                        <Plus size={16} /> Выдать предмет
                      </button>
                    )}
                  </div>
                  <div className="item-list">
                    {character.items.map((item) => (
                      <article className="panel item-row" key={item.id}>
                        <span className="item-icon">
                          <Backpack size={23} />
                        </span>
                        <div>
                          <span className="eyebrow">{item.type}</span>
                          <h3>{item.name}</h3>
                          <InventoryStatus item={item} />
                          <p>{item.description}</p>
                          <StatTags tags={item.tags} />
                          {item.secret && (dm || item.revealed) && (
                            <div className="secret">
                              <Eye size={14} />
                              {item.revealed
                                ? "Раскрыто игроку: "
                                : "Только мастеру: "}
                              {item.secret}
                            </div>
                          )}
                        </div>
                        {dm && (
                          <div className="item-actions">
                            <button
                              disabled={busy}
                              onClick={() => {
                                setInventoryEdit({
                                  character: structuredClone(character),
                                  item: structuredClone(item),
                                });
                                setModal("inventory");
                              }}
                            >
                              Изменить состояние
                            </button>
                            {item.secret && !item.revealed && (
                              <button
                                onClick={() =>
                                  updateCharacter(
                                    character.id,
                                    (c) => ({
                                      ...c,
                                      items: c.items.map((x) =>
                                        x.id === item.id
                                          ? { ...x, revealed: true }
                                          : x,
                                      ),
                                    }),
                                    "Свойство раскрыто",
                                    item.name,
                                  )
                                }
                              >
                                Раскрыть
                              </button>
                            )}
                            <button
                              className="danger-link"
                              onClick={() =>
                                updateCharacter(
                                  character.id,
                                  (c) => ({
                                    ...c,
                                    items: c.items.filter(
                                      (x) => x.id !== item.id,
                                    ),
                                  }),
                                  "Предмет забран",
                                  item.name,
                                )
                              }
                            >
                              Забрать
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                    {!character.items.length && (
                      <div className="empty">
                        <Backpack />
                        <h3>Пока ничего нет</h3>
                        <p>Мастер добавит снаряжение перед путешествием.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
              {tab === "Способности" && (
                <>
                  <CharacterAdjustments
                    key={character.id + "adjustments"}
                    character={character}
                    dm={dm}
                    busy={busy}
                    save={(adjustments, version) =>
                      mutate(
                        {
                          type: "character",
                          id: character.id,
                          version,
                          data: { adjustments },
                          title: "Поправки изменены",
                          detail: "Бонусы, штрафы и источники",
                        },
                        "Поправки сохранены",
                      )
                    }
                  />
                  <CharacterResources
                    key={character.id + "resources"}
                    character={character}
                    dm={dm}
                    busy={busy}
                    mutate={mutate}
                  />
                  <CharacterAbilities
                    key={character.id}
                    character={character}
                    dm={dm}
                    busy={busy}
                    openLibrary={() => navigate("abilityLibrary")}
                    remove={(ability) =>
                      updateCharacter(
                        character.id,
                        (c) => ({
                          ...c,
                          abilities: (c.abilities || []).filter(
                            (a) => a.id !== ability.id,
                          ),
                        }),
                        "Способность убрана",
                        ability.name,
                      )
                    }
                  />
                  <CombatResults character={character} />
                  <RuleResults character={character} />
                </>
              )}
              {tab === "Биография" && (
                <div className="panel prose">
                  <span className="eyebrow">ИСТОРИЯ ПЕРСОНАЖА</span>
                  <h2>До начала приключения</h2>
                  <p>{character.bio || "История ещё не написана."}</p>
                  <OriginProfile character={character} />
                  <FirstLevelProfile character={character} />
                </div>
              )}
              {tab === "Заметки" && (
                <div className="panel">
                  <div className="section-heading compact">
                    <h2>Записи на полях</h2>
                    <select
                      aria-label="Вид заметки"
                      value={noteScope}
                      onChange={(e) => {
                        const value = e.target.value;
                        requestLeave(() => setNoteScope(value));
                      }}
                    >
                      {!dm && <option value="personal">Личные заметки</option>}
                      <option value="common">Общие заметки кампании</option>
                      {dm && <option value="dm">Заметки мастера</option>}
                    </select>
                  </div>
                  {dm && noteScope === "personal" ? (
                    <div className="empty">
                      <Lock />
                      <p>
                        Личные заметки доступны только игроку. Выберите другой
                        раздел.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="muted">
                        {noteScope === "personal"
                          ? "В игровом интерфейсе эти записи видны только вам."
                          : noteScope === "dm"
                            ? "Эти записи не отображаются игроку."
                            : "Эти записи видят все участники кампании."}
                      </p>
                      <NoteEditor
                        key={character.id + noteScope}
                        text={
                          noteScope === "common"
                            ? state.commonNote
                            : noteScope === "dm"
                              ? character.dmNote || ""
                              : character.note || ""
                        }
                        version={
                          (noteScope === "common"
                            ? state.version
                            : noteScope === "personal"
                              ? character.noteVersion
                              : character.version) || 0
                        }
                        readOnly={!dm && noteScope === "common"}
                        save={(text, version) =>
                          mutate(
                            {
                              type: "note",
                              id: character.id,
                              version,
                              data: { scope: noteScope, text },
                            },
                            "Заметка сохранена",
                          )
                        }
                      />
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {dm &&
            [
              "library",
              "abilityLibrary",
              "libraryTools",
              "originLibrary",
            ].includes(page) && (
              <nav className="library-tabs" aria-label="Разделы библиотеки">
                <button
                  aria-current={page === "originLibrary" ? "page" : undefined}
                  onClick={() => navigate("originLibrary")}
                >
                  Создание персонажа
                </button>
                <button
                  aria-current={page === "library" ? "page" : undefined}
                  onClick={() => navigate("library")}
                >
                  Предметы
                </button>
                <button
                  aria-current={page === "abilityLibrary" ? "page" : undefined}
                  onClick={() => navigate("abilityLibrary")}
                >
                  Заклинания и особенности
                </button>
                <button
                  aria-current={page === "libraryTools" ? "page" : undefined}
                  onClick={() => navigate("libraryTools")}
                >
                  Перенос и архив
                </button>
              </nav>
            )}
          {page === "originLibrary" && dm && (
            <OriginLibrary state={state} busy={busy} mutate={mutate} />
          )}
          {page === "libraryTools" && dm && (
            <LibraryTools state={state} busy={busy} mutate={mutate} />
          )}
          {page === "abilityLibrary" && dm && (
            <AbilityLibrary
              state={state}
              busy={busy}
              mutate={mutate}
              give={(id, ability) =>
                updateCharacter(
                  id,
                  (c) => ({
                    ...c,
                    abilities: [
                      ...(c.abilities || []),
                      { ...ability, id: crypto.randomUUID() },
                    ],
                  }),
                  "Способность выдана",
                  ability.name,
                )
              }
            />
          )}
          {page === "library" && dm && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">КОЛЛЕКЦИЯ МАСТЕРА</span>
                  <h1>Библиотека предметов</h1>
                  <p>Всё, что может встретиться на пути ваших героев.</p>
                </div>
                <button className="primary" onClick={() => editItem()}>
                  <Plus size={16} /> Создать предмет
                </button>
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    aria-label="Поиск предметов"
                    placeholder="Найти предмет…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Тип предмета"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {["Все", ...new Set(library.map((item) => item.type))].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </div>
              <div className="library-grid">
                {library
                  .filter(
                    (i) =>
                      i.name.toLowerCase().includes(search.toLowerCase()) &&
                      (category === "Все" || i.type === category),
                  )
                  .map((item) => (
                    <article className="panel library-card" key={item.id}>
                      <div className="library-art">
                        <Swords size={42} strokeWidth={1} />
                      </div>
                      <span className="eyebrow">{item.type}</span>
                      <h2>{item.name}</h2>
                      <button onClick={() => editItem(item)}>
                        Редактировать
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            {
                              type: "libraryArchive",
                              version: state.version,
                              data: {
                                kind: "item",
                                id: item.id,
                                archived: true,
                              },
                            },
                            "Карточка перемещена в архив",
                          )
                        }
                      >
                        В архив
                      </button>
                      <p>{item.description}</p>
                      <StatTags tags={item.tags} />
                      {item.secret && (
                        <span className="muted">
                          <Lock size={13} /> Есть скрытое свойство
                        </span>
                      )}
                      <button
                        onClick={() => {
                          if (!state.characters.length) {
                            setToast(
                              "Сначала создайте персонажа или дождитесь анкеты игрока",
                            );
                            return;
                          }
                          setChosen(item);
                          setRecipient(
                            character?.id || state.characters[0]?.id || "",
                          );
                          setModal("give");
                        }}
                      >
                        <Plus size={16} /> Выдать персонажу
                      </button>
                    </article>
                  ))}
              </div>
              {!library.some(
                (i) =>
                  i.name.toLowerCase().includes(search.toLowerCase()) &&
                  (category === "Все" || i.type === category),
              ) && (
                <div className="empty">
                  <Search />
                  <h3>Ничего не найдено</h3>
                  <p>Попробуйте другое название или тип.</p>
                </div>
              )}
            </>
          )}
          {page === "history" && dm && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ХРОНИКА КАМПАНИИ</span>
                  <h1>История изменений</h1>
                  <p>Каждое решение оставляет след.</p>
                </div>
              </div>
              <div className="panel history-filters">
                <label>
                  Персонаж в истории
                  <select
                    value={historyCharacter}
                    onChange={(e) => setHistoryCharacter(e.target.value)}
                  >
                    <option value="">Все персонажи</option>
                    {[
                      ...new Map(
                        state.events.map((event) => [
                          event.characterId,
                          event.before.name,
                        ]),
                      ).entries(),
                    ].map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус изменения
                  <select
                    value={historyStatus}
                    onChange={(e) => setHistoryStatus(e.target.value)}
                  >
                    <option value="all">Все изменения</option>
                    <option value="active">Не отменённые</option>
                    <option value="undone">Отменённые</option>
                  </select>
                </label>
                <label>
                  Поиск в истории
                  <input
                    type="search"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Название, описание или имя"
                  />
                </label>
                <button
                  onClick={() => {
                    setHistoryCharacter("");
                    setHistoryStatus("all");
                    setHistorySearch("");
                  }}
                >
                  Сбросить фильтры
                </button>
                <p role="status">
                  Показано: {historyEvents.length} из {state.events.length}.
                  Поиск по последним 200 событиям кампании.
                </p>
              </div>
              {state.events.length > 0 && historyEvents.length === 0 && (
                <p className="empty">
                  По выбранным фильтрам ничего не найдено.
                </p>
              )}
              {state.events.length === 0 ? (
                <div className="empty">
                  <ScrollText />
                  <h2>История начинается с действия</h2>
                  <p>
                    Измените здоровье или выдайте предмет — действие появится
                    здесь.
                  </p>
                  <button onClick={() => navigate("party")}>К группе</button>
                </div>
              ) : (
                <div className="timeline">
                  {historyEvents.map((e) => (
                    <article className="panel event" key={e.id}>
                      <span className="event-time">{e.time}</span>
                      <div>
                        <h3>
                          {e.title}
                          {e.undone && <span className="badge">Отменено</span>}
                        </h3>
                        <p>
                          {e.before.name} · {e.detail}
                        </p>
                        <small>Мастер игры</small>
                      </div>
                      {!e.undone &&
                        e.canUndo &&
                        state.events.find(
                          (x) => x.characterId === e.characterId && !x.undone,
                        )?.id === e.id && (
                          <button onClick={() => undo(e)}>
                            <RotateCcw size={15} /> Отменить
                          </button>
                        )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
          {page === "create" && draft && (
            <>
              <button className="back" onClick={() => void storeDraft()}>
                <ArrowLeft size={16} /> Сохранить и выйти
              </button>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">НОВАЯ ИСТОРИЯ</span>
                  <h1>Создание персонажа</h1>
                  <p>Первый уровень · один класс · стандартный массив</p>
                </div>
              </div>
              <div className="steps">
                {[
                  "Вид",
                  "Класс",
                  "Происхождение",
                  "Личность",
                  "Характеристики",
                  "Проверка",
                ].map((s, i) => (
                  <button
                    key={s}
                    className={i === step ? "current" : ""}
                    onClick={() => setStep(i)}
                  >
                    <span>{i + 1}</span>
                    {s}
                  </button>
                ))}
              </div>
              <div className="panel wizard">
                {step < 3 && (
                  <OriginStep
                    key={step}
                    draft={draft}
                    cards={state.characterOptions || []}
                    kind={originKinds[step]}
                    change={setDraft}
                  />
                )}
                {step === 3 && (
                  <>
                    <h2>Кто отправится в путь?</h2>
                    <label>
                      Имя персонажа
                      <input
                        maxLength={60}
                        value={draft.name}
                        placeholder="Как зовут вашего героя?"
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        required
                      />
                    </label>
                    <StarterIdentity draft={draft} change={setDraft} />
                  </>
                )}
                {step === 4 && (
                  <>
                    <h2>Сильные стороны</h2>
                    <p>
                      Распределите значения 15, 14, 13, 12, 10 и 8. При выборе
                      занятого значения характеристики поменяются местами.
                    </p>
                    <div className="form-grid">
                      {draft.stats.map((v, i) => (
                        <label key={i}>
                          {statNames[i]}
                          <select
                            value={v}
                            onChange={(e) => {
                              const next = [...draft.stats],
                                value = Number(e.target.value),
                                other = next.indexOf(value);
                              next[other] = next[i];
                              next[i] = value;
                              setDraft({ ...draft, stats: next });
                            }}
                          >
                            {[15, 14, 13, 12, 10, 8].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <StarterChoices draft={draft} change={setDraft} />
                    <FirstLevelChoices
                      draft={draft}
                      cards={state.characterOptions || []}
                      change={setDraft}
                    />
                  </>
                )}
                {step === 5 && (
                  <>
                    <h2>У каждого героя есть прошлое</h2>
                    <label>
                      Биография
                      <textarea
                        rows={5}
                        maxLength={5000}
                        placeholder="Что привело вас к Туманному побережью?"
                        value={draft.bio}
                        onChange={(e) =>
                          setDraft({ ...draft, bio: e.target.value })
                        }
                      />
                    </label>
                    {draft.creation && (
                      <p>
                        При сохранении сервер проверит выборы и рассчитает
                        стартовые параметры. Хиты и бонусы не берутся из
                        введённых вручную итогов.
                      </p>
                    )}
                    <div className="review-summary">
                      <b>{draft.name || "Имя не заполнено"}</b>
                      <p>
                        {draft.species} · {draft.cls} · {draft.background}
                      </p>
                      <small>
                        После отправки анкету проверит мастер. До его решения
                        редактирование будет закрыто.
                      </small>
                    </div>
                  </>
                )}
                <div className="wizard-footer">
                  <button onClick={() => storeDraft()}>
                    Сохранить черновик
                  </button>
                  <div className="actions">
                    {step > 0 && (
                      <button onClick={() => setStep(step - 1)}>Назад</button>
                    )}
                    {step < 5 ? (
                      <button
                        className="primary"
                        onClick={() => {
                          if (
                            step < 3 &&
                            !draft[
                              step === 0
                                ? "species"
                                : step === 1
                                  ? "cls"
                                  : "background"
                            ]
                          ) {
                            setToast("Выберите карточку");
                            return;
                          }
                          if (step === 3 && !draft.name.trim()) {
                            setToast("Введите имя персонажа");
                            return;
                          }
                          setStep(step + 1);
                        }}
                      >
                        Далее <ArrowRight size={16} />
                      </button>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => storeDraft(true)}
                      >
                        <Send size={16} /> Отправить мастеру
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">D&D IPL · 0.2</span>
                  <h1>Настройки</h1>
                  <p>
                    {user.name} · {dm ? "Мастер" : "Игрок"}
                  </p>
                </div>
              </div>
              <AppearanceSettings />
              {dm && (
                <section className="panel members">
                  <h2>Участники кампании</h2>
                  <p>
                    Приглашение действует 24 часа, используется один раз и
                    выдаёт только роль игрока.
                  </p>
                  <button
                    className="primary"
                    onClick={async () => {
                      try {
                        const r = await api(
                          "/campaigns/" + state.id + "/invites",
                          {},
                        );
                        setInvite(r.invitation);
                      } catch (e) {
                        setToast((e as Error).message);
                      }
                    }}
                  >
                    Создать приглашение
                  </button>
                  {invite && (
                    <label>
                      Одноразовый код приглашения
                      <input
                        readOnly
                        value={invite}
                        onFocus={(e) => e.target.select()}
                      />
                      <small>
                        Передайте игроку код и адрес приложения. Само приложение
                        не отправляет приглашения.
                      </small>
                    </label>
                  )}
                  {state.members?.map((m) => (
                    <div className="member" key={m.id}>
                      <span>
                        {m.name} · {m.role === "dm" ? "Мастер" : "Игрок"}
                      </span>
                      {m.role === "player" && (
                        <button
                          onClick={async () => {
                            try {
                              await api("/campaigns/" + state.id + "/revoke", {
                                userId: m.id,
                              });
                              setState(await api("/campaigns/" + state.id));
                              setToast("Доступ к кампании закрыт");
                            } catch (e) {
                              setToast((e as Error).message);
                            }
                          }}
                        >
                          Отключить доступ
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <section className="panel prose">
                <h2>Локальный сервер</h2>
                <p>
                  Аккаунты, кампании и изменения сохраняются в SQLite на
                  компьютере мастера. Права проверяются сервером. Личные заметки
                  не выдаются мастеру через API.
                </p>
                <p>
                  Полный расчёт правил, резервные копии, портреты и подключение
                  через Tailscale — следующие этапы. Показатели нового персонажа
                  пока служат заготовкой, которую проверяет мастер.
                </p>
                <button onClick={() => requestLeave(leave)}>
                  Выбрать другую кампанию
                </button>
              </section>
            </>
          )}
        </main>
        <footer>
          ✧ D&D Interactive Player List <span>Локальный сервер · SQLite</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      <dialog
        ref={dialogRef}
        onChangeCapture={() => setModalDirty(true)}
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) requestLeave(() => setModal(null));
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current && !busy)
            requestLeave(() => setModal(null));
        }}
      >
        <div className="modal">
          <button
            className="close icon-button"
            aria-label="Закрыть"
            disabled={busy}
            onClick={() => requestLeave(() => setModal(null))}
          >
            <X />
          </button>
          {modal === "item" && (
            <ItemEditor
              key={editingItem.id}
              item={editingItem}
              busy={busy}
              save={async (item) => {
                const ok = await mutate(
                  { type: "library", version: editorVersion, data: item },
                  "Предмет сохранён в библиотеке",
                );
                if (ok) {
                  setModal(null);
                  setSearch("");
                  setCategory("Все");
                }
                return ok;
              }}
            />
          )}
          {modal === "rules" && rulesEdit && (
            <CharacterRulesEditor
              key={rulesEdit.id}
              character={rulesEdit}
              busy={busy}
              save={async (data) => {
                const ok = await mutate(
                  {
                    type: "character",
                    id: rulesEdit.id,
                    version: rulesEdit.version,
                    data,
                    title: "Параметры персонажа изменены",
                    detail:
                      "Уровень, характеристики, владения, здоровье и защита",
                  },
                  "Параметры сохранены и пересчитаны",
                );
                if (ok) setModal(null);
                return ok;
              }}
            />
          )}
          {modal === "health" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  hp = Number(f.get("hp"));
                if (!Number.isInteger(hp) || hp < 0 || hp > character.maxHp)
                  return;
                updateCharacter(
                  character.id,
                  (c) => ({ ...c, hp }),
                  "Здоровье изменено",
                  `${character.hp} → ${hp}`,
                );
                setModal(null);
              }}
            >
              <span className="eyebrow">{character.name}</span>
              <h2>Изменить здоровье</h2>
              <label>
                Текущие хиты
                <input
                  name="hp"
                  type="number"
                  min="0"
                  max={character.maxHp}
                  step="1"
                  defaultValue={character.hp}
                  required
                  autoFocus
                />
              </label>
              <p className="muted">
                Максимум: {character.maxHp}. Изменение попадёт в историю.
              </p>
              <button className="primary" type="submit">
                Сохранить
              </button>
            </form>
          )}
          {modal === "inventory" && inventoryEdit && (
            <InventoryEditor
              key={inventoryEdit.item.id}
              item={inventoryEdit.item}
              busy={busy}
              save={async (item, split) => {
                const before = inventoryEdit.character;
                const items = before.items.flatMap((old) =>
                  old.id !== item.id
                    ? [old]
                    : split
                      ? [
                          { ...old, quantity: (old.quantity ?? 1) - 1 },
                          { ...old, id: crypto.randomUUID(), quantity: 1 },
                        ]
                      : [item],
                );
                const ok = await mutate(
                  {
                    type: "character",
                    id: before.id,
                    version: before.version,
                    data: { items },
                    title: split
                      ? "Стопка разделена"
                      : "Состояние предмета изменено",
                    detail: `${item.name}: количество ${item.quantity ?? 1}; ${item.equipped ? "экипировано" : "в сумке"}${item.requiresAttunement ? (item.attuned ? "; настроено" : "; без настройки") : ""}${item.maxCharges ? `; заряды ${item.charges ?? 0}/${item.maxCharges}` : ""}; вес единицы: ${item.weightGrams === undefined ? "не указан" : formatWeight(item.weightGrams)}`,
                  },
                  split ? "Одна единица отделена" : "Состояние сохранено",
                );
                if (ok) setModal(null);
                return ok;
              }}
            />
          )}
          {modal === "give" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const quantity = Number(
                  new FormData(e.currentTarget).get("quantity"),
                );
                if (!library.some((i) => i.id === chosen.id)) {
                  setToast(
                    "Шаблон больше не активен. Выберите другой предмет.",
                  );
                  return;
                }
                const ok = await updateCharacter(
                  recipient,
                  (c) => ({
                    ...c,
                    items: [
                      ...c.items,
                      {
                        ...chosen,
                        id: crypto.randomUUID(),
                        quantity,
                        equipped: false,
                        attuned: false,
                        charges: chosen.maxCharges || 0,
                      },
                    ],
                  }),
                  "Предмет выдан",
                  `${chosen.name} × ${quantity}`,
                );
                if (ok) setModal(null);
              }}
            >
              <span className="eyebrow">БИБЛИОТЕКА МАСТЕРА</span>
              <h2>Выдать предмет</h2>
              <label>
                Предмет
                <select
                  value={chosen.id}
                  onChange={(e) =>
                    setChosen(library.find((i) => i.id === e.target.value)!)
                  }
                >
                  {library.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Получатель
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  {state.characters.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">{chosen.description}</p>
              <label>
                Количество при выдаче
                <input
                  key={chosen.id}
                  name="quantity"
                  required
                  type="number"
                  min={1}
                  max={
                    chosen.requiresAttunement || chosen.maxCharges ? 1 : 9999
                  }
                  defaultValue={1}
                  step={1}
                />
              </label>
              {(chosen.requiresAttunement || !!chosen.maxCharges) && (
                <p className="muted">
                  Этот предмет выдаётся отдельными экземплярами.
                  {chosen.maxCharges
                    ? ` Начальный запас: ${chosen.maxCharges} зарядов.`
                    : ""}
                </p>
              )}
              {chosen.secret && (
                <p className="secret">
                  <Lock size={15} /> Скрытое свойство останется известно только
                  мастеру.
                </p>
              )}
              <button className="primary" type="submit" disabled={busy}>
                <Plus size={16} /> Выдать
              </button>
            </form>
          )}
          {modal === "return" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = String(
                  new FormData(e.currentTarget).get("reason"),
                ).trim();
                if (!reason) return;
                updateCharacter(
                  character.id,
                  (c) => ({ ...c, status: "draft", feedback: reason }),
                  "Анкета возвращена",
                  reason,
                );
                setModal(null);
              }}
            >
              <h2>Вернуть на доработку</h2>
              <label>
                Что нужно исправить?
                <textarea name="reason" rows={4} required maxLength={1000} />
              </label>
              <button className="primary" type="submit">
                Вернуть игроку
              </button>
            </form>
          )}
          {modal === "campaign" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  name = String(f.get("name")).trim();
                if (!name) return;
                void mutate(
                  {
                    type: "campaign",
                    version: state.version,
                    data: {
                      campaign: name,
                      description: String(f.get("description")),
                    },
                  },
                  "Описание сохранено",
                );
                setModal(null);
              }}
            >
              <h2>Ваша кампания</h2>
              <label>
                Название
                <input
                  name="name"
                  defaultValue={state.campaign}
                  maxLength={90}
                  required
                />
              </label>
              <label>
                Описание
                <textarea
                  name="description"
                  defaultValue={state.description}
                  rows={5}
                  maxLength={2000}
                />
              </label>
              <button className="primary" type="submit">
                Сохранить
              </button>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <Session>
        {(user, state, leave) => (
          <UnsavedChangesProvider key={state.id + user.id}>
            <App
              key={state.id + user.id}
              user={user}
              initial={state}
              leave={leave}
            />
          </UnsavedChangesProvider>
        )}
      </Session>
    </AppearanceProvider>
  </React.StrictMode>,
);
import "./appearance.css";
