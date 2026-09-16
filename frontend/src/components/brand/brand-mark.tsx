import { cn } from '../../lib/cn';

interface BrandMarkProps {
  size?: 'sm' | 'lg';
  className?: string;
}

export function BrandMark({ size = 'sm', className }: BrandMarkProps) {
  const isLarge = size === 'lg';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-brand font-semibold text-on-brand',
          isLarge ? 'size-12 text-xl' : 'size-9 text-base',
        )}
      >
        H
      </span>
      <span
        className={cn(
          'font-semibold tracking-[-0.01em] text-ink',
          isLarge ? 'text-2xl' : 'text-lg',
        )}
      >
        HSS Finance
      </span>
    </div>
  );
}
