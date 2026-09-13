import { parseJwtSecret } from '../src/config/jwt.js';

describe('JWT_SECRET configuration', () => {
  it('rejects a missing secret', () => {
    expect(() => parseJwtSecret(undefined)).toThrow('JWT_SECRET is required.');
  });

  it('rejects an invalid Base64 secret', () => {
    expect(() => parseJwtSecret('not-valid-base64!')).toThrow('JWT_SECRET must be valid Base64.');
  });

  it('rejects a secret shorter than 32 decoded bytes', () => {
    const shortSecret = Buffer.alloc(31, 1).toString('base64');

    expect(() => parseJwtSecret(shortSecret)).toThrow(
      'JWT_SECRET must decode to at least 32 bytes.',
    );
  });
});
