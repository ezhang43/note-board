import { useEffect, useRef, useState } from "react";
import { collab } from "../sync/collabSession";
import { ai, AI_MODELS, useAiSettings } from "../store/ai";
import { appStore, useAppState } from "../store/appStore";
import { CloseIcon } from "./icons";
import { useCoverBoard } from "./textField";
import { usePhone } from "./usePhone";

// AI settings (wow plan, job 12a): where the person keeps their own Anthropic key, picks the model and sets a
// monthly cap. Opened from ⋯ (phone too). Its one network call is "Test key" (job 13): a tiny request to
// api.anthropic.com with the saved key, counted as one use, showing "Key works." or a plain message. The key
// itself is never shown again after saving, only its start and last four letters.

export function AiSettingsDialog() {
  return useAppState((s) => s.ui.aiSettingsOpen) ? <Dialog /> : null;
}

function Dialog() {
  useAiSettings();
  const backdrop = useRef<HTMLDivElement>(null);
  useCoverBoard(backdrop);
  const close = appStore.closeAiSettings;
  const uid = collab.me()?.uid ?? null;
  const [draft, setDraft] = useState("");
  const phone = usePhone();
  // Before a key is saved this is the choice for the next save; after, it is where the key really is.
  const [pending, setPending] = useState(false);
  const [capText, setCapText] = useState(String(ai.getCap()));
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(
    null,
  );
  // The running Test key request, stopped if the dialog closes.
  const testing = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => testing.current?.abort(), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) =>
      e.key === "Escape" && !e.isComposing && close();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);

  const remember = ai.hasAnyKey() ? ai.isRemembered() : pending;
  const masked = ai.maskedKey(uid);
  const strangers = ai.hasAnyKey() && masked === null;
  const model = ai.getModel();
  const cap = ai.getCap();

  const save = () => {
    if (ai.setKey(draft, { remember, uid })) {
      setDraft("");
      setNote({ text: "Key saved." });
    } else {
      setNote({
        text: "That is not a usable key (it has spaces, or is empty), or this browser would not let the page save it.",
        bad: true,
      });
    }
  };
  // A valid number is kept as it is typed (so closing with Escape loses nothing); bad text goes back on leaving the box.
  const typeCap = (text: string) => {
    setCapText(text);
    if (text.trim() !== "") ai.setCap(Number(text));
  };
  const leaveCap = () => setCapText(String(ai.getCap()));
  const test = async () => {
    const c = new AbortController();
    testing.current = c;
    setBusy(true);
    setNote({ text: "Testing…" });
    const r = await ai.testKey(uid, c.signal);
    if (c.signal.aborted) return;
    testing.current = null;
    setBusy(false);
    setNote(r.ok ? { text: "Key works." } : { text: r.message, bad: true });
  };

  return (
    <div
      ref={backdrop}
      className="shortcuts-backdrop ai-settings-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className="shortcuts-panel ai-settings"
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
      >
        <header className="shortcuts-header">
          <h2>AI settings</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            title="Close (Escape)"
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>
        <p className="shortcuts-hint">
          Your key is used only when you press Test key or an AI button. What
          you chose is then sent straight from this browser to Anthropic, with
          your key; it never goes through BusyAnts.
        </p>

        <div className="ai-warning" role="note">
          <strong>Before you add a key</strong>
          <ul>
            <li>
              The key is stored in this browser. It is never saved with your
              boards or sent to your account.
            </li>
            <li>Anyone using this browser profile can use it.</li>
            <li>Using it costs money on your Anthropic account.</li>
            <li>
              Use a separate workspace with a low spend limit and a key that
              expires (for example in 30 days).
            </li>
          </ul>
        </div>

        <form
          className="ai-field"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label htmlFor="ai-key-input">Anthropic API key</label>
          <p className="ai-saved">
            {masked
              ? `Saved: ${masked}`
              : strangers
                ? "A key saved by another account is on this browser. Forget it, or save yours."
                : "No key saved."}
          </p>
          <div className="ai-key-row">
            <input
              id="ai-key-input"
              className="feedback-text"
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoFocus={!phone}
              placeholder={
                masked ? "Paste a new key to replace it" : "sk-ant-…"
              }
              value={draft}
              onChange={(e) => {
                setDraft(e.currentTarget.value);
                setNote(null);
              }}
            />
            <button
              type="submit"
              className="confirm-send"
              disabled={!draft.trim()}
            >
              Save key
            </button>
          </div>
          <label className="ai-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                if (!ai.hasAnyKey()) setPending(on);
                else if (!ai.setRemember(on))
                  setNote({
                    text: "This browser would not let the page move the key, so it stays where it was.",
                    bad: true,
                  });
              }}
            />
            <span>Remember on this device</span>
          </label>
          <p className="shortcuts-hint ai-check-hint">
            Off: the key is forgotten when you close this tab. On: it stays
            until you forget it.
          </p>
          <p
            className={`shortcuts-note${note?.bad ? " ai-bad" : ""}`}
            role={note?.bad ? "alert" : "status"}
          >
            {note?.text}
          </p>
          <div className="ai-key-actions">
            <button
              type="button"
              className="confirm-cancel ai-forget"
              disabled={!masked || busy}
              title="Sends one tiny request to Anthropic (counts as one use)"
              onClick={() => void test()}
            >
              Test key
            </button>
            <button
              type="button"
              className="confirm-cancel ai-forget"
              disabled={!ai.hasAnyKey()}
              onClick={() => {
                ai.forgetKey();
                setDraft("");
                setPending(false);
                setNote({ text: "Key forgotten." });
              }}
            >
              Forget key
            </button>
          </div>
        </form>

        <fieldset className="ai-field ai-models">
          <legend>Model</legend>
          {AI_MODELS.map((m) => (
            <label key={m.id} className="ai-check ai-model">
              <input
                type="radio"
                name="ai-model"
                value={m.id}
                checked={model === m.id}
                onChange={() => ai.setModel(m.id)}
              />
              <span>{m.name}</span>
              <span className="ai-model-note">{m.note}</span>
            </label>
          ))}
        </fieldset>

        <div className="ai-field">
          <label htmlFor="ai-cap-input">
            Stop after this many uses a month
          </label>
          <input
            id="ai-cap-input"
            className="feedback-text ai-cap"
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            value={capText}
            onChange={(e) => typeCap(e.currentTarget.value)}
            onBlur={leaveCap}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <p className="shortcuts-hint">
            {ai.usesThisMonth()} of {cap} used this month. Counted on this
            device only, so it is a safety stop on top of the spend limit, not
            instead of it.
          </p>
        </div>
      </section>
    </div>
  );
}
