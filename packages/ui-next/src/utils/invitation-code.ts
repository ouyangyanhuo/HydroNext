export const INVITATION_CODE_LENGTH = 8;

export function isInvitationCodeComplete(value: string): boolean {
  return /^[A-Z0-9]{8}$/.test(value);
}
