import { cn } from '../../lib/cn';

interface LogoutButtonProps {
  onLogout: () => void;
  isLoggingOut: boolean;
  className?: string;
}

export function LogoutButton({ onLogout, isLoggingOut, className }: LogoutButtonProps) {
  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={isLoggingOut}
      className={cn(
        'min-h-11 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors',
        'hover:bg-surface-alt hover:text-ink disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    >
      {isLoggingOut ? 'Saindo...' : 'Sair'}
    </button>
  );
}
