import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 16384;
const KEYLEN = 64;

/** scrypt password hashing: `scrypt$N$salt$hash`, all hex. */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password, salt, KEYLEN, { N }, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${N}$${salt.toString('hex')}$${derived.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') return resolve(false);
    const n = Number(parts[1]);
    const salt = Buffer.from(parts[2] as string, 'hex');
    const expected = Buffer.from(parts[3] as string, 'hex');
    scrypt(password, salt, expected.length, { N: n }, (err, derived) => {
      if (err) return resolve(false);
      resolve(timingSafeEqual(derived, expected));
    });
  });
}
