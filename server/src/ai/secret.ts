/**
 * At-rest encryption for an account's AI key.
 *
 * AES-256-GCM under a key derived from the server's session secret, so a copy
 * of the database alone does not hand over anyone's AI key. Output is
 * "v1:<iv>:<tag>:<ciphertext>", base64url.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyFrom = (secret: string) =>
  createHash('sha256').update(`zenport-ai-key:${secret}`).digest();

export function sealSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), body]
    .map((x) => (typeof x === 'string' ? x : x.toString('base64url')))
    .join(':');
}

export function openSecret(sealed: string, secret: string): string | null {
  const [v, iv, tag, body] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null; // wrong secret or tampered
  }
}
