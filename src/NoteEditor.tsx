import { useEffect, useState } from "react";
import { useUnsavedChanges } from "./UnsavedChanges";
export function NoteEditor({
  text,
  version,
  readOnly,
  save,
}: {
  text: string;
  version: number;
  readOnly: boolean;
  save: (text: string, version: number) => Promise<boolean>;
}) {
  const [value, setValue] = useState(text),
    [base, setBase] = useState(version),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const requestLeave = useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) {
      setValue(text);
      setBase(version);
    }
  }, [text, version, dirty]);
  return (
    <>
      <textarea
        aria-label="Текст заметки"
        rows={9}
        readOnly={readOnly || busy}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
      />
      {dirty && base !== version && (
        <p className="error-message">
          На сервере есть новая версия. Ваш текст сохранён в поле; скопируйте
          его перед загрузкой серверной версии.
        </p>
      )}
      <div className="actions note-actions">
        {!readOnly && (
          <button
            className="primary"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (await save(value, base)) setDirty(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Сохранение…" : "Сохранить заметку"}
          </button>
        )}
        {dirty && base !== version && (
          <button
            onClick={() =>
              requestLeave(() => {
                setValue(text);
                setBase(version);
                setDirty(false);
              })
            }
          >
            Загрузить серверную версию
          </button>
        )}
        <small>
          {dirty ? "Есть несохранённые изменения" : "Сохранено на сервере"}
        </small>
      </div>
    </>
  );
}
