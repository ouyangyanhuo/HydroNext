interface DeleteResourceResponse {
  url?: string;
  redirect?: string;
  error?: { message?: string, params?: any[] };
}

export async function requestResourceDeletion(actionUrl: string): Promise<string | undefined> {
  const response = await fetch(actionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ operation: 'delete' }),
  });
  const contentType = response.headers.get('content-type') || '';
  const data: DeleteResourceResponse = contentType.includes('json') ? await response.json() : {};
  if (!response.ok || data.error) {
    throw data.error || new Error(`Delete request failed with status ${response.status}`);
  }
  return data.url || data.redirect;
}
