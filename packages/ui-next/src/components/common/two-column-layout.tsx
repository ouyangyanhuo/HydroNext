import { ResponsiveSidebar } from './responsive-sidebar';

export type SidebarWidth = 'default' | 'wide';

const SIDEBAR_WIDTH_CLASS: Record<SidebarWidth, string> = {
  default: 'w-full shrink-0 lg:w-72',
  wide: 'w-full shrink-0 lg:w-80',
};

export interface TwoColumnLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarWidth?: SidebarWidth;
  sidebarTitle?: React.ReactNode;
  responsive?: boolean;
  className?: string;
  mainClassName?: string;
  sidebarClassName?: string;
}

export function TwoColumnLayout({
  children,
  sidebar,
  sidebarWidth = 'default',
  sidebarTitle,
  responsive = false,
  className,
  mainClassName,
  sidebarClassName,
}: TwoColumnLayoutProps) {
  const resolvedSidebarClass = [SIDEBAR_WIDTH_CLASS[sidebarWidth], sidebarClassName].filter(Boolean).join(' ');

  return (
    <div className={['flex flex-col gap-6 lg:flex-row', className].filter(Boolean).join(' ')}>
      <div className={['min-w-0 flex-1', mainClassName].filter(Boolean).join(' ')}>
        {children}
      </div>
      {responsive ? (
        <ResponsiveSidebar className={resolvedSidebarClass} title={sidebarTitle}>
          {sidebar}
        </ResponsiveSidebar>
      ) : (
        <aside className={resolvedSidebarClass}>
          {sidebar}
        </aside>
      )}
    </div>
  );
}
