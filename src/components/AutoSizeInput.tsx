import type { CSSProperties, InputHTMLAttributes, Ref } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
  /** Which text box this is (for formatting), and its format. */
  box?: string;
  boxStyle?: CSSProperties;
};

/** A single-line text box whose width follows its text. */
export function AutoSizeInput({ value, onChange, className, placeholder, ref, box, boxStyle, ...rest }: Props) {
  return (
    <span className={`autosize ${className ?? ''}`} data-value={value || placeholder || ''} data-box={box} style={boxStyle}>
      <input
        {...rest}
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
