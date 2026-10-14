import React, { lazy } from 'react';
import Layout from '../components/layout';
import { store } from './store';
import type { PageLoader, PageMetadata, RegisterPageOptions } from './types';

export function registerPage<P = any>(
  name: string,
  loader: PageLoader<P>,
  options: Partial<PageMetadata> & RegisterPageOptions = {},
) {
  if (options.title !== undefined) store.setPageMetadata(name, { title: options.title, nav: options.nav });
  store.setDefault(`page:${name}`, lazy(() =>
    loader().then((mod) => {
      const PageComp = mod.default;
      const LayoutComp = mod.Layout || store.getDefault(`layout:${options.layout || 'default'}`) || Layout;
      return {
        default(props: React.PropsWithChildren<P>) {
          return (
            <LayoutComp>
              <PageComp {...props} />
            </LayoutComp>
          );
        },
      };
    }),
  ));
}
