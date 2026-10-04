import { Fragment } from 'react';
import { rangesIn } from '../model/search';
import { useAppState } from '../store/appStore';

/**
 * Search (owner request): `text` with every match of the search marked, the current one strongly.
 * Inside a text box it is drawn as an invisible copy of the text behind it (`overlay`), so only the
 * marks show; elsewhere (the Completed card) it is the text itself.
 */
export function FindMarks({ find, text, overlay = false }: { find: string; text: string; overlay?: boolean }) {
  const query = useAppState((s) => s.ui.find?.query ?? '');
  const current = useAppState((s) => (s.ui.find?.current?.key === find ? s.ui.find.current.start : -1));
  const ranges = query.trim() ? rangesIn(text, query) : [];
  if (overlay && !ranges.length) return null;
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    parts.push(<Fragment key={`t${start}`}>{text.slice(at, start)}</Fragment>);
    parts.push(
      <mark key={`m${start}`} className={start === current ? 'find-mark current' : 'find-mark'} data-current={start === current || undefined}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return overlay ? (
    <span className="find-marks" aria-hidden="true">
      {parts}{' '}
    </span>
  ) : (
    <>{parts}</>
  );
}
