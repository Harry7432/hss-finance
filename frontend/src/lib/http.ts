import { z } from 'zod';

import { ApiError } from './api-error';
import { env } from './env';

const successEnvelopeSchema = z.object({ data: z.unknown() });
const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type AccessTokenProvider = () => string | null;

export interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

let accessTokenProvider: AccessTokenProvider | null = null;

export function setAccessTokenProvider(provider: AccessTokenProvider): void {
  accessTokenProvider = provider;
}

export function clearAccessTokenProvider(): void {
  accessTokenProvider = null;
}

function createRequestUrl(path: string): string {
  return `${env.apiUrl}/${path.replace(/^\/+/, '')}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase();

  if (!contentType?.includes('/json') && !contentType?.includes('+json')) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  {
    method = 'GET',
    body,
    credentials = 'same-origin',
    headers: initialHeaders,
    signal,
  }: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(initialHeaders);
  const accessToken = accessTokenProvider?.();

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(createRequestUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials,
      signal,
    });
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error;
    }

    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar ao servidor.');
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(payload);

    if (parsedError.success) {
      throw new ApiError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
      );
    }

    throw new ApiError(response.status, 'REQUEST_FAILED', 'A requisição não pôde ser concluída.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const parsedSuccess = successEnvelopeSchema.safeParse(payload);

  if (!parsedSuccess.success) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedSuccess.data.data as T;
}
