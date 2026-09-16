import type { HouseholdMember } from '../../households/household-member-api';
import { cn } from '../../lib/cn';

const ROLE_LABEL: Record<HouseholdMember['role'], string> = {
  owner: 'Proprietário',
  member: 'Membro',
};

export function MemberListItem({
  member,
  isCurrentUser,
}: {
  member: HouseholdMember;
  isCurrentUser: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line/15 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">
          {member.name}
          {isCurrentUser ? (
            <span className="ml-2 text-xs font-normal text-ink-muted">(Você)</span>
          ) : null}
        </p>
        <p className="truncate text-sm text-ink-muted">{member.email}</p>
      </div>
      <span
        className={cn(
          'inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium',
          member.role === 'owner'
            ? 'border-brand/40 text-brand'
            : 'border-line/25 text-ink-muted',
        )}
      >
        {ROLE_LABEL[member.role]}
      </span>
    </li>
  );
}
