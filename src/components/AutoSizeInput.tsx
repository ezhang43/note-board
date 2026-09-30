import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** A single-line text box whose width follows its text. */
export function AutoSizeInput({ value, onChange, className, placeholder, ...rest }: Props) {
  return (
    <span className={`autosize ${className ?? ''}`} data-value={value || placeholder || ''}>
      <input
        {...rest}
        placeholder={placeholder}
        size={1}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
