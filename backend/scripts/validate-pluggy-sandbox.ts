// Dev-only tool. Validates the PluggyOpenFinanceProvider adapter against the real
// Pluggy SANDBOX API. Not part of the app, not part of the automated test suite, and
// never wired into HSS Finance's product code.
//
// - Uses only Sandbox credentials (never real institutions/accounts/credentials).
// - Never persists anything (no BankConnection/BankAccount/Transaction writes).
// - Never logs secrets (apiKey, connectToken) or full account/document numbers.
// - Exits with a non-zero code when any validation step fails.
//
// Usage (from backend/):
//   npm run validate:pluggy-sandbox
//
// Required env:
//   PLUGGY_CLIENT_ID
//   PLUGGY_CLIENT_SECRET
// Optional env:
//   PLUGGY_BASE_URL          defaults to https://api.pluggy.ai
//   PLUGGY_SANDBOX_ITEM_ID   an existing Sandbox Item id (e.g. from the Pluggy Connect
//                            widget with the "Pluggy Bank" sandbox connector). Without
//                            it, getConnection/listAccounts/listTransactions are skipped.

import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { OpenFinanceProviderError } from '../src/integrations/open-finance/open-finance-provider.error.js';
import { PluggyOpenFinanceProvider } from '../src/integrations/open-finance/providers/pluggy-open-finance-provider.js';

let failed = false;

function ok(label: string, detail?: string): void {
  console.log(`[OK] ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail?: string): void {
  failed = true;
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
}

function info(message: string): void {
  console.log(`[INFO] ${message}`);
}

function describeError(error: unknown): string {
  if (error instanceof OpenFinanceProviderError) {
    return `code=${error.code} message=${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (!env.pluggyClientId || !env.pluggyClientSecret) {
  console.error(
    [
      'SANDBOX REAL PENDENTE POR CREDENCIAIS.',
      '',
      'Defina em backend/.env (nunca commitado):',
      '  PLUGGY_CLIENT_ID=<client id da aplicação Pluggy>',
      '  PLUGGY_CLIENT_SECRET=<client secret da aplicação Pluggy>',
      '',
      'Opcional, para validar getConnection/listAccounts/listTransactions:',
      '  PLUGGY_SANDBOX_ITEM_ID=<id de um Item Sandbox já existente>',
    ].join('\n'),
  );
  process.exit(1);
}

const provider = new PluggyOpenFinanceProvider({
  clientId: env.pluggyClientId,
  clientSecret: env.pluggyClientSecret,
  baseUrl: env.pluggyBaseUrl,
});

info(`Pluggy base URL: ${env.pluggyBaseUrl}`);

// A connect session round-trip exercises both POST /auth (internal API key
// acquisition) and POST /connect_token through the adapter's real code path.
try {
  const session = await provider.createConnectSession({});
  ok('POST /auth (via adapter)', 'apiKey obtido, não exibido');
  ok(
    'POST /connect_token',
    `accessToken presente (não exibido), adapter expiresAt=${session.expiresAt?.toISOString() ?? 'undefined'}`,
  );
} catch (error) {
  fail('auth/connect_token', describeError(error));
}

const itemId = process.env.PLUGGY_SANDBOX_ITEM_ID;

if (!itemId) {
  info(
    'PLUGGY_SANDBOX_ITEM_ID não definido — pulando getConnection/listAccounts/listTransactions. ' +
      'Um Item Sandbox precisa ser criado via widget Pluggy Connect (frontend) antes de validar essas rotas.',
  );
} else {
  try {
    const connection = await provider.getConnection(itemId);
    ok(
      'GET /items/:id',
      `status=${connection.status} institutionId=${connection.institutionId || '(vazio)'} ` +
        `institutionName presente=${connection.institutionName.length > 0} ` +
        `consentExpiresAt=${connection.consentExpiresAt?.toISOString() ?? 'null'}`,
    );

    const accounts = await provider.listAccounts(itemId);
    const accountTypes = [...new Set(accounts.map((account) => account.type))];
    ok('GET /accounts', `count=${accounts.length} types=${accountTypes.join(',') || 'none'}`);
    for (const account of accounts) {
      info(
        `  account ${account.externalId}: type=${account.type} subtype=${account.subtype ?? 'null'} ` +
          `maskedNumber=${account.maskedNumber ?? 'null'}`,
      );
    }

    const firstAccount = accounts[0];
    if (!firstAccount) {
      info('Nenhuma account retornada — pulando listTransactions.');
    } else {
      const page = await provider.listTransactions({ accountExternalId: firstAccount.externalId });
      const types = [...new Set(page.items.map((transaction) => transaction.type))];
      const statuses = [...new Set(page.items.map((transaction) => transaction.status))];
      ok(
        'GET /v2/transactions',
        `count=${page.items.length} types=${types.join(',') || 'none'} ` +
          `statuses=${statuses.join(',') || 'none'} nextCursor=${page.nextCursor ? 'present' : 'null'}`,
      );
    }
  } catch (error) {
    fail('getConnection/listAccounts/listTransactions', describeError(error));
  }
}

// Safe, non-destructive error check: a random UUID is never a real Item, so this
// must surface invalid_connection without touching any real resource.
try {
  await provider.getConnection(randomUUID());
  fail('invalid_connection', 'esperava erro para Item ID inexistente, mas a chamada teve sucesso');
} catch (error) {
  if (error instanceof OpenFinanceProviderError && error.code === 'invalid_connection') {
    ok('invalid_connection', 'confirmado para Item ID inexistente');
  } else {
    fail('invalid_connection', `código inesperado: ${describeError(error)}`);
  }
}

if (failed) {
  console.error('\nValidação concluída com falhas.');
  process.exit(1);
} else {
  console.log('\nValidação concluída com sucesso.');
}
