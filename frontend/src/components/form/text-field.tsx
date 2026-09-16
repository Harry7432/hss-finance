import { useId, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';
import { inputBaseClassName } from './field-styles';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, id, className, error, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const errorId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(inputBaseClassName, className)}
        {...inputProps}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} className="text-xs font-medium text-expense">
          {error}
        </p>
      ) : null}
    </div>
  );
}
