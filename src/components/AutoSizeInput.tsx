import { use, type CSSProperties, type InputHTMLAttributes, type Ref } from 'react';
import { BoardReadOnly } from './textBox';
import { FindMarks } from './FindMarks';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
  /** Which text box this is (for formatting), and its format. */
  box?: string;
  boxStyle?: CSSProperties;
  /** Which text box this is for search (see src/model/search.ts), to mark matches in it. */
  find?: string;
};

/** A single-line text box whose width follows its text. */
export function AutoSizeInput({ value, onChange, className, placeholder, ref, box, boxStyle, find, ...rest }: Props) {
  const readOnly = use(BoardReadOnly) || rest.readOnly;
  return (
    <span className={`autosize ${className ?? ''}`} data-value={value || placeholder || ''} data-box={box} data-find={find} style={boxStyle}>
      {find && <FindMarks find={find} text={value} overlay />}
      <input
        {...rest}
        readOnly={readOnly}
        ref={ref}
        placeholder={placeholder}
        size={1}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
