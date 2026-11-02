import { use, type CSSProperties, type Ref, type TextareaHTMLAttributes } from 'react';
import { BoardReadOnly } from './textBox';
import { FindMarks } from './FindMarks';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
  /** Which text box this is (for formatting), and its format. */
  box?: string;
  boxStyle?: CSSProperties;
  /** Which text box this is for search (see src/model/search.ts), to mark matches in it. */
  find?: string;
  /** Letters highlighted Word-style across items (owner request, 2026-11-01): from, to, and whether the highlight goes on past the end. */
  marks?: readonly [number, number, boolean] | null;
};

/** A text box that grows taller as you type and never scrolls. */
export function GrowTextarea({ value, onChange, className, ref, box, boxStyle, find, marks, ...rest }: Props) {
  const readOnly = use(BoardReadOnly) || rest.readOnly;
  return (
    <span className={`grow ${className ?? ''}`} data-value={value} data-box={box} data-find={find} style={boxStyle}>
      {find && <FindMarks find={find} text={value} overlay />}
      {marks && (
        // Drawn behind the text box like the search marks: an invisible copy of the text with the highlighted part marked.
        <span className="word-marks" aria-hidden="true">
          {value.slice(0, marks[0])}
          <mark className="word-mark">
            {value.slice(marks[0], marks[1])}
            {marks[2] && ' '}
          </mark>
          {value.slice(marks[1])}{' '}
        </span>
      )}
      <textarea {...rest} readOnly={readOnly} ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
