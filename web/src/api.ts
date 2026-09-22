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
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'x-zenport-csrf': '1' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
