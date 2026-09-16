import { useEffect, useState, type FormEvent } from 'react';

import { useAddHouseholdMember } from '../../households/use-add-household-member';
import { ApiError } from '../../lib/api-error';
import { TextField } from '../form/text-field';

function resolveAddMemberErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'USER_NOT_FOUND') {
      return 'Não encontramos um usuário com esse e-mail no HSS Finance.';
    }

    if (error.code === 'ALREADY_HOUSEHOLD_MEMBER') {
      return 'Este usuário já faz parte desta família.';
    }

    if (error.status === 403) {
      return 'Somente o proprietário pode adicionar membros.';
    }

    if (error.status === 400) {
      return 'Verifique o e-mail informado.';
    }
  }

  return 'Não foi possível adicionar o membro agora. Tente novamente.';
}

export function AddMemberForm({
  householdId,
  onCancel,
  onSuccess,
}: {
  householdId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const addMemberMutation = useAddHouseholdMember(householdId);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (addMemberMutation.isPending) {
      return;
    }

    const trimmedEmail = email.trim();
    const nextEmailError = trimmedEmail === '' ? 'Informe o e-mail do usuário.' : undefined;
    setEmailError(nextEmailError);

    if (nextEmailError !== undefined) {
      return;
    }

    try {
      await addMemberMutation.mutateAsync({ email: trimmedEmail });
      setEmail('');
      setEmailError(undefined);
      addMemberMutation.reset();
      onSuccess();
    } catch {
      // Surfaced below via addMemberMutation.isError/error.
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {addMemberMutation.isError ? (
        <p role="alert" className="text-sm font-medium text-expense">
          {resolveAddMemberErrorMessage(addMemberMutation.error)}
        </p>
      ) : null}

      <TextField
        autoFocus
        type="email"
        label="E-mail do usuário"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setEmailError(undefined);
        }}
        error={emailError}
        disabled={addMemberMutation.isPending}
      />
      <p className="text-sm text-ink-muted">O usuário precisa ter uma conta no HSS Finance.</p>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={addMemberMutation.isPending}
          className="min-h-11 rounded-lg border border-line/25 px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={addMemberMutation.isPending}
          className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {addMemberMutation.isPending ? 'Adicionando...' : 'Adicionar membro'}
        </button>
      </div>
    </form>
  );
}
