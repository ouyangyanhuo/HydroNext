const RATE_LIMIT_OPERATIONS: Record<string, string> = {
  add_blog: 'Blog',
  add_discussion: 'Discussion',
  add_print: 'Print',
  add_record: 'Submit',
  contest_activity: 'Contest Activity',
  contest_announcement: 'Announcement',
  contest_announcement_ack: 'Announcement Confirmation',
  contest_code: 'Contest Code',
  contest_team_join: 'Join Team',
  contest_team_reset_code: 'Reset Team Code',
  global: 'Request',
  oauth_callback: 'OAuth Login',
  problem_create: 'Create Problem',
  scoreboard_download: 'Download Scoreboard',
  send_mail: 'Send Verification Email',
  user_login: 'Login',
  user_login_id: 'Login',
  user_register_with_code: 'Register',
  user_sudo: 'Sudo Mode',
};

/**
 * Translate the original error template before interpolating dynamic values.
 * Callers without a translator retain the existing formatting behavior.
 */
export function formatErrorMessage(
  error: { message?: string, params?: unknown[] } | null | undefined,
  fallback: string,
  translate?: (key: string) => string,
): string {
  if (
    error?.message === 'Field password validation failed.'
    || ((error?.message === 'Field {0} validation failed.' || error?.message === 'Field {0} or {1} validation failed.')
      && (error?.params?.[0] === 'password' || error?.params?.[0] === 'Password'))
  ) {
    return translate ? translate('Incorrect password') : 'Incorrect password';
  }
  const template = typeof error?.message === 'string' && error.message ? error.message : fallback;
  const message = translate ? translate(template) : template;
  if (!Array.isArray(error?.params)) return message;
  const isRateLimitTemplate = template === 'Too frequent operations of {0} (limit: {2} operations in {1} seconds).'
    || template.startsWith('Too frequent operations of');
  const params = error.params.map((param, index) => {
    if (index === 0 && isRateLimitTemplate && typeof param === 'string') {
      const opName = RATE_LIMIT_OPERATIONS[param] || param;
      if (!translate) return opName;
      const translated = translate(opName);
      if (translated !== opName) return translated;
      const translatedParam = translate(param);
      if (translatedParam !== param) return translatedParam;
      return opName;
    }
    return param;
  });
  // Replace in one pass so usernames containing placeholders or "$&" stay literal.
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) => (
    Number(index) < params.length ? String(params[Number(index)]) : placeholder
  ));
}
