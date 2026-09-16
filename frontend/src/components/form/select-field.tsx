import { useId, type SelectHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';
import { inputBaseClassName } from './field-styles';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function SelectField({ label, id, className, children, ...selectProps }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <select id={selectId} className={cn(inputBaseClassName, className)} {...selectProps}>
        {children}
      </select>
    </div>
  );
}
