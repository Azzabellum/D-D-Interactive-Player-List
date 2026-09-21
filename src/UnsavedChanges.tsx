import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

const Context = createContext({
  dirty: new Set<symbol>(),
  request: (action: () => void) => action(),
});
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<symbol>()).current;
  const [pending, setPending] = useState<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (pending) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pending]);
  return (
    <Context.Provider
      value={{
        dirty,
        request: (action) => {
          if (dirty.size) setPending(() => action);
          else action();
        },
      }}
    >
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="unsaved-title"
        onCancel={() => setPending(null)}
      >
        <div className="modal">
          <h2 id="unsaved-title">Есть несохранённые изменения</h2>
          <p>
            При переходе введённые правки будут потеряны. Останьтесь, чтобы
            сохранить их или скопировать текст.
          </p>
          <div className="actions">
            <button
              autoFocus
              className="primary"
              onClick={() => setPending(null)}
            >
              Остаться
            </button>
            <button
              onClick={() => {
                const action = pending;
                setPending(null);
                action?.();
              }}
            >
              Уйти без сохранения
            </button>
          </div>
        </div>
      </dialog>
    </Context.Provider>
  );
}
export function useUnsavedChanges(dirty: boolean) {
  const context = useContext(Context);
  const id = useRef(Symbol()).current;
  useLayoutEffect(() => {
    if (dirty) context.dirty.add(id);
    return () => {
      context.dirty.delete(id);
    };
  }, [context.dirty, id, dirty]);
  return context.request;
}
