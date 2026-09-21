import { useUnsavedChanges } from "./UnsavedChanges";
import { useState } from "react";
import { api } from "./api";
import { State, library as defaults, Item, Ability } from "./model";

type LibraryFile = {
  format: "dnd-ipl-library";
  version: 1;
  items: Item[];
  abilities: Ability[];
};
export function LibraryTools({
  state,
  busy,
  mutate,
}: {
  state: State;
  busy: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  useUnsavedChanges(text.length > 0);
  const [preview, setPreview] = useState<{
    data: LibraryFile;
    version?: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [exportText, setExportText] = useState("");
  const [loading, setLoading] = useState(false);
  const allItems = [
    ...new Map(
      [...defaults, ...(state.library || [])].map((i) => [i.id, i]),
    ).values(),
  ];
  const archived = [
    ...allItems
      .filter((i) => state.libraryArchive?.items.includes(i.id))
      .map((i) => ({ id: i.id, name: i.name, kind: "item" })),
    ...(state.abilityLibrary || [])
      .filter((i) => state.libraryArchive?.abilities.includes(i.id))
      .map((i) => ({ id: i.id, name: i.name, kind: "ability" })),
  ];
  function inspect() {
    setError("");
    setPreview(null);
    try {
      if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
        throw new Error("Файл превышает 2 МБ.");
      const data = JSON.parse(text);
      if (
        data?.format !== "dnd-ipl-library" ||
        data?.version !== 1 ||
        !Array.isArray(data.items) ||
        !Array.isArray(data.abilities)
      )
        throw new Error("Нужен файл библиотеки D&D IPL версии 1.");
      if (
        data.items.length > 100 ||
        data.abilities.length > 100 ||
        !(data.items.length + data.abilities.length)
      )
        throw new Error(
          "Нужны карточки: не более 100 предметов и 100 способностей.",
        );
      if (
        [...data.items, ...data.abilities].some(
          (c) => !c || typeof c.name !== "string",
        )
      )
        throw new Error("У карточек отсутствуют названия.");
      setPreview({ data, version: state.version });
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Некорректный JSON. Выберите файл экспорта D&D IPL."
          : (e as Error).message,
      );
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Библиотека кампании</span>
          <h1>Перенос и архив</h1>
          <p>
            Выданные персонажам экземпляры сохраняются независимо от шаблонов.
          </p>
        </div>
      </div>
      <section className="panel transfer-panel">
        <h2>Экспорт</h2>
        <p>
          В файл попадут активные предметы (включая начальные карточки),
          заклинания и особенности. Архив, персонажи и заметки не включаются. До
          100 карточек каждого вида.
        </p>
        <p className="notice warning">
          Файл содержит скрытые свойства предметов. Передавайте его только тому,
          кому разрешено их видеть.
        </p>
        <button
          disabled={loading || busy}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              setExportText(
                JSON.stringify(
                  await api(`/campaigns/${state.id}/library-export`),
                  null,
                  2,
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Подготовка…" : "Подготовить экспорт"}
        </button>
        {exportText && (
          <>
            <label>
              JSON для переноса
              <textarea readOnly rows={5} value={exportText} />
            </label>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([exportText], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "dnd-ipl-library.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Скачать JSON
            </button>
            <p className="muted">
              Это снимок на момент подготовки. После изменения библиотеки
              подготовьте экспорт заново.
            </p>
          </>
        )}
      </section>
      <section className="panel transfer-panel">
        <h2>Импорт</h2>
        <p>
          Будут созданы новые копии. Существующие карточки и инвентарь не
          заменяются. Повторный импорт того же файла создаст ещё один набор.
        </p>
        <label>
          Файл библиотеки (JSON, до 2 МБ)
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setPreview(null);
              setError("");
              setText("");
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                setError("Файл превышает 2 МБ.");
                return;
              }
              try {
                setText(await file.text());
              } catch {
                setError("Не удалось прочитать файл.");
              }
            }}
          />
        </label>
        <label>
          Или вставьте JSON
          <textarea
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <button disabled={busy || !text.trim()} onClick={inspect}>
          Проверить файл
        </button>
        {preview && (
          <div className="import-preview">
            <h3>Будут добавлены</h3>
            <p>
              Предметов: {preview.data.items.length} · Способностей:{" "}
              {preview.data.abilities.length}
            </p>
            <ul>
              {[...preview.data.items, ...preview.data.abilities].map(
                (c, i) => (
                  <li key={i}>{c.name}</li>
                ),
              )}
            </ul>
            <p className="muted">
              Сервер проверит все поля перед сохранением. При ошибке ни одна
              карточка не будет добавлена.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setError("");
                if (
                  await mutate(
                    {
                      type: "libraryImport",
                      version: preview.version,
                      data: preview.data,
                    },
                    "Карточки импортированы",
                  )
                ) {
                  setPreview(null);
                  setText("");
                } else
                  setError(
                    "Импорт не выполнен. Проверьте уведомление; при конфликте заново нажмите «Проверить файл».",
                  );
              }}
            >
              Импортировать копии
            </button>
          </div>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="panel transfer-panel">
        <h2>Архив шаблонов</h2>
        <p>
          Архивные карточки скрыты из выбора при выдаче. Восстановление вернёт
          их в библиотеку.
        </p>
        {!archived.length ? (
          <p>Архив пуст.</p>
        ) : (
          <div className="archive-list">
            {archived.map((c) => (
              <div key={c.kind + c.id}>
                <span>
                  {c.name} · {c.kind === "item" ? "Предмет" : "Способность"}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    mutate(
                      {
                        type: "libraryArchive",
                        version: state.version,
                        data: { kind: c.kind, id: c.id, archived: false },
                      },
                      "Карточка восстановлена",
                    )
                  }
                >
                  Восстановить
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
