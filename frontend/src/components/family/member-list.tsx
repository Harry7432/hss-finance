import type { HouseholdMember } from '../../households/household-member-api';
import { MemberListItem } from './member-list-item';

export function MemberList({
  members,
  currentUserId,
}: {
  members: HouseholdMember[];
  currentUserId: string | undefined;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {members.map((member) => (
        <MemberListItem
          key={member.userId}
          member={member}
          isCurrentUser={member.userId === currentUserId}
        />
      ))}
    </ul>
  );
}
