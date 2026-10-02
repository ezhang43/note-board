import type { InputHTMLAttributes, Ref } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** A single-line text box whose width follows its text. */
export function AutoSizeInput({ value, onChange, className, placeholder, ref, ...rest }: Props) {
  return (
    <span className={`autosize ${className ?? ''}`} data-value={value || placeholder || ''}>
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
