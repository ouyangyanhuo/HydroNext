import { ownRegistration } from './lifecycle';

const extensions = new Map<symbol, string[]>();

export function registerUserFields(fields: string[]) {
  const key = Symbol('user-fields');
  extensions.set(key, fields.slice());
  return ownRegistration(() => { extensions.delete(key); });
}

export function getUserExtensionFields() {
  return [...new Set([...extensions.values()].flat())];
}
