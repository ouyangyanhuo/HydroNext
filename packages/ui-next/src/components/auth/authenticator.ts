import { formatErrorMessage } from '@/utils/error';

interface AuthenticatorMethods {
  authn: boolean;
  tfa: boolean;
}

type Translate = (key: string) => string;

async function readJson(response: Response) {
  const type = response.headers.get('content-type') || '';
  return type.includes('json') ? response.json() : {};
}

export async function getAuthenticatorMethods(
  uname: string,
  t: Translate,
  endpoint = '/user/tfa',
): Promise<AuthenticatorMethods> {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('q', uname);
  const response = await fetch(url.pathname + url.search, {
    headers: { Accept: 'application/json' },
  });
  const data = await readJson(response);
  if (!response.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
  return { authn: Boolean(data.authn), tfa: Boolean(data.tfa) };
}

export async function verifyWithWebAuthn(t: Translate, uname = '', endpoint = '/user/webauthn'): Promise<string> {
  const { browserSupportsWebAuthn, startAuthentication } = await import('@simplewebauthn/browser');
  if (!window.isSecureContext || !browserSupportsWebAuthn()) {
    throw new Error(t('Your browser does not support WebAuthn or you are not in secure context.'));
  }

  const url = new URL(endpoint, window.location.origin);
  if (uname) url.searchParams.set('uname', uname);
  const optionsResponse = await fetch(url.pathname + url.search, {
    headers: { Accept: 'application/json' },
  });
  const optionsData = await readJson(optionsResponse);
  if (!optionsResponse.ok || optionsData.error) {
    throw new Error(formatErrorMessage(optionsData.error, t('Failed to fetch registration data.')));
  }
  if (!optionsData.authOptions?.challenge) throw new Error(t('Failed to fetch registration data.'));

  const result = await startAuthentication({ optionsJSON: optionsData.authOptions });
  const verifyResponse = await fetch(url.pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ result }),
  });
  const verifyData = await readJson(verifyResponse);
  if (!verifyResponse.ok || verifyData.error) {
    throw new Error(formatErrorMessage(verifyData.error, t('Verification failed')));
  }
  return optionsData.authOptions.challenge;
}
