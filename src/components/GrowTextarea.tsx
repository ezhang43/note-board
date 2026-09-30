import type { Ref, TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

/** A text box that grows taller as you type and never scrolls. */
export function GrowTextarea({ value, onChange, className, ref, ...rest }: Props) {
  return (
    <span className={`grow ${className ?? ''}`} data-value={value}>
      <textarea {...rest} ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}
