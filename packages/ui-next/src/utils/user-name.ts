export interface UserNameLike {
  uname?: string;
  displayName?: string;
  _id?: number | string;
}

export function formatUserName(user?: UserNameLike | null): string {
  if (!user) return '';
  const username = String(user.uname || '').trim();
  const displayName = String(user.displayName || '').trim();
  if (displayName && displayName !== username) {
    return username ? `${displayName} (${username})` : displayName;
  }
  return username || displayName || String(user._id ?? '');
}
