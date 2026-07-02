import { store } from './store';
import type { PageMetadata } from './types';

export function getPageMetadata(name: string): PageMetadata {
  const metadata = store.getPageMetadata(name);
  if (metadata) return metadata;

  const title = name
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return { title: title || 'Hydro' };
}
