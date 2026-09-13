import 'dotenv/config';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MINIMUM_JWT_SECRET_BYTES = 32;

export function parseJwtSecret(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error('JWT_SECRET is required.');
  }

  if (!BASE64_PATTERN.test(value)) {
    throw new Error('JWT_SECRET must be valid Base64.');
  }

  const decodedSecret = Buffer.from(value, 'base64');

  if (decodedSecret.toString('base64') !== value) {
    throw new Error('JWT_SECRET must be valid Base64.');
  }

  if (decodedSecret.length < MINIMUM_JWT_SECRET_BYTES) {
    throw new Error('JWT_SECRET must decode to at least 32 bytes.');
  }

  return value;
}

export const jwtConfig = Object.freeze({
  secret: parseJwtSecret(process.env.JWT_SECRET),
});
