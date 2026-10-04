import type { CSSProperties, Ref, TextareaHTMLAttributes } from 'react';
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
};

/** A text box that grows taller as you type and never scrolls. */
export function GrowTextarea({ value, onChange, className, ref, box, boxStyle, find, ...rest }: Props) {
  return (
    <span className={`grow ${className ?? ''}`} data-value={value} data-box={box} data-find={find} style={boxStyle}>
      {find && <FindMarks find={find} text={value} overlay />}
      <textarea {...rest} ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
