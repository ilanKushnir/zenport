/** Minimal typed API client. Every mutation carries the CSRF header. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // A body-less POST is sent as `{}` rather than nothing: with no body some
  // browsers (Safari) and some proxies attach a content-type of their own,
  // and Fastify answers a type it has no parser for with 415 - which is how
  // "Rescan" came to do nothing on the phone. An explicit JSON body always
  // has a parser.
  const mutation = method !== 'GET';
  const payload = mutation && body === undefined ? {} : body;
  const res = await fetch(path, {
    method,
    headers: {
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(mutation ? { 'x-zenport-csrf': '1' } : {}),
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  if (res.status === 401 && !location.pathname.startsWith('/login')) {
    window.dispatchEvent(new CustomEvent('zenport:signed-out'));
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      isJson && data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Upload raw bytes (voice notes). */
export async function uploadBinary<T>(
  path: string,
  blob: Blob,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': blob.type || 'application/octet-stream',
      'x-zenport-csrf': '1',
      ...extraHeaders,
    },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'upload failed', data);
  }
  return data as T;
}
