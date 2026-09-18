// Dev-only tool. Validates the AsaasClient adapter against the real Asaas SANDBOX API.
// Not part of the app, not part of the automated test suite, and never wired into
// HSS Finance's product code.
//
// - Uses only Sandbox credentials.
// - Performs a single GET (balance) — no financial operation is triggered.
// - Never logs the API Key.
// - Exits with a non-zero code when validation fails.
//
// Usage (from backend/):
//   npm run validate:asaas-sandbox
//
// Required env:
//   ASAAS_API_KEY
// Optional env:
//   ASAAS_BASE_URL   defaults to https://api-sandbox.asaas.com/v3

import { env } from '../src/config/env.js';
import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import { AsaasClient } from '../src/integrations/asaas/asaas-client.js';

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
  if (error instanceof AsaasClientError) {
    return `code=${error.code} message=${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (!env.asaasApiKey) {
  console.error(
    [
      'SANDBOX REAL PENDENTE POR CREDENCIAIS.',
      '',
      'Defina em backend/.env (nunca commitado):',
      '  ASAAS_API_KEY=<chave de API do Sandbox Asaas>',
      '',
      'Opcional:',
      '  ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3',
    ].join('\n'),
  );
  process.exit(1);
}

const client = new AsaasClient({
  apiKey: env.asaasApiKey,
  baseUrl: env.asaasBaseUrl,
});

info(`Asaas base URL: ${env.asaasBaseUrl}`);

try {
  const { balance } = await client.getBalance();
  ok('GET /finance/balance', `autenticação OK, saldo=${balance}`);
} catch (error) {
  fail('GET /finance/balance', describeError(error));
}

try {
  const page = await client.listFinancialTransactions();
  ok(
    'GET /financialTransactions',
    `itens=${page.data.length}, totalCount=${page.totalCount}, hasMore=${page.hasMore}`,
  );
} catch (error) {
  fail('GET /financialTransactions', describeError(error));
}

if (failed) {
  console.error('\nValidação concluída com falhas.');
  process.exit(1);
} else {
  console.log('\nValidação concluída com sucesso.');
}
