import { useId, useState, type InputHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';
import { inputBaseClassName } from './field-styles';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function PasswordField({ label, id, className, ...inputProps }: PasswordFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={isVisible ? 'text' : 'password'}
          className={cn(inputBaseClassName, 'pr-12', className)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setIsVisible((current) => !current)}
          disabled={inputProps.disabled}
          aria-label={isVisible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={isVisible}
          className={cn(
            'absolute inset-y-0 right-0 flex w-11 items-center justify-center text-sm font-medium text-ink-muted',
            'hover:text-ink disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isVisible ? 'Ocultar' : 'Ver'}
        </button>
      </div>
    </div>
  );
}
