import { useEffect, useState } from 'react';
import { FEEDBACK_MAX, feedbackText } from '../model/feedback';
import { feedback, useFeedbackPanel, useFeedbackSender, useFeedbackStatus } from '../sync/feedback';
import { useOnline } from './DeleteAccountPanel';
import { CloseIcon } from './icons';

// Send feedback (owner request, job #69). File → Send feedback… opens it (on a phone ⋯ → File):
// a short note, sent with the person's email so the owner can reply.

export function FeedbackPanel() {
  const open = useFeedbackPanel();
  const sender = useFeedbackSender();
  return open && sender ? <Panel /> : null;
}

function Panel() {
  const online = useOnline();
  const status = useFeedbackStatus();
  const [text, setText] = useState(feedback.draft);
  const busy = status === 'sending';
  const sent = status === 'sent';
  // Closing works even while sending: the note carries on, and opening again shows how it went.
  const close = feedback.close;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);

  const note = feedbackText(text);
  const submit = () => note && feedback.send(note);

  return (
    <div className="shortcuts-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <section className="shortcuts-panel delete-account" role="dialog" aria-modal="true" aria-label="Send feedback">
        <header className="shortcuts-header">
          <h2>Send feedback</h2>
          <button type="button" className="icon-button" aria-label="Close" title="Close (Escape)" onClick={close}>
            <CloseIcon />
          </button>
        </header>
        {sent ? (
          <>
            <p role="status">Thanks — sent.</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" autoFocus onClick={close}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="delete-account-type">
              Your feedback
              <textarea
                className="feedback-text"
                autoFocus
                rows={6}
                maxLength={FEEDBACK_MAX}
                value={text}
                disabled={busy}
                placeholder="What do you like, what’s missing, what went wrong?"
                onChange={(e) => {
                  setText(e.currentTarget.value);
                  feedback.draft = e.currentTarget.value;
                }}
              />
            </label>
            <p className="delete-account-note feedback-count">
              {text.length} / {FEEDBACK_MAX}
            </p>
            <p className="delete-account-note">
              Sent with your email address, so the maker of BusyAnts can reply. See the{' '}
              <a href={`${import.meta.env.BASE_URL}privacy/`} target="_blank" rel="noreferrer">
                Privacy policy
              </a>
              .
            </p>
            {!online && <p className="delete-account-note">You’re offline. Connect to the internet to send feedback.</p>}
            {status === 'failed' && (
              <p className="sign-in-error" role="alert">
                Couldn’t send. Check your connection and try again.
              </p>
            )}
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={close}>
                Cancel
              </button>
              <button type="button" className="confirm-send" disabled={!note || !online || busy} onClick={submit}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
