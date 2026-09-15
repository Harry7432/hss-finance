const DEFAULT_API_URL = 'http://localhost:3000/api';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseApiUrl(value: string | undefined): string {
  const apiUrl = value?.trim() || DEFAULT_API_URL;

  try {
    const url = new URL(apiUrl);

    const usesSupportedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const usesSecureTransport = url.protocol === 'https:' || LOOPBACK_HOSTNAMES.has(url.hostname);
    const hasUnsupportedParts =
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0;

    if (!usesSupportedProtocol || !usesSecureTransport || hasUnsupportedParts) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'VITE_API_URL must be a valid HTTPS URL without credentials, query, or fragment. HTTP is allowed only for local development.',
    );
  }

  return apiUrl.replace(/\/+$/, '');
}

export const env = Object.freeze({
  apiUrl: parseApiUrl(import.meta.env.VITE_API_URL),
});
