import { defineSlot } from '../registry';

const Layout = defineSlot('layout:default', ({ children }: React.PropsWithChildren) => {
  return <>{children}</>;
});

export default Layout;
