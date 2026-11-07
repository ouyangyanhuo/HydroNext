/* eslint-disable react-refresh/only-export-components */
import { CloseButton, Drawer, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconLayoutSidebar } from '@tabler/icons-react';
import React, { createContext, useContext, useState } from 'react';
import { ActionIcon } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';

interface ResponsiveSidebarContextValue {
  close: () => void;
  isMobile: boolean;
}

const ResponsiveSidebarContext = createContext<ResponsiveSidebarContextValue>({
  close: () => {},
  isMobile: false,
});

export const useResponsiveSidebar = () => useContext(ResponsiveSidebarContext);

export interface ResponsiveSidebarProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  as?: 'div' | 'aside' | 'section';
  keepMounted?: boolean;
}

export function ResponsiveSidebar({
  children,
  className = 'w-full lg:w-64 shrink-0',
  title,
  icon,
  as: Component = 'div',
  keepMounted = false,
}: ResponsiveSidebarProps) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const isMobile = useMediaQuery('(max-width: 63.99em)', false);

  const displayTitle = title || t('Sidebar');
  const isDrawerOpened = Boolean(isMobile && opened);

  return (
    <ResponsiveSidebarContext.Provider value={{ close: () => setOpened(false), isMobile: Boolean(isMobile) }}>
      {/* Desktop container: untouched PC layout, hidden on narrow screens */}
      <Component className={`hidden lg:block ${className}`}>
        {!isMobile && children}
      </Component>

      {/* Mobile Floating Ball (FAB): only visible on narrow screens */}
      <div
        className={`lg:hidden fixed z-40 transition-opacity duration-200 ${isDrawerOpened ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <ActionIcon
          size={52}
          radius="xl"
          variant="filled"
          className="hydro-floating-sidebar-ball shadow-xl hover:scale-105 active:scale-95 transition-transform"
          onClick={() => setOpened(true)}
          aria-label={typeof displayTitle === 'string' ? displayTitle : t('Sidebar')}
        >
          {icon || <IconLayoutSidebar size={24} />}
        </ActionIcon>
      </div>

      {/* Mobile Action Sheet (Bottom Drawer) */}
      <Drawer
        opened={isDrawerOpened}
        onClose={() => setOpened(false)}
        position="bottom"
        size="auto"
        radius="lg"
        withCloseButton={false}
        withinPortal
        zIndex={300}
        keepMounted={keepMounted}
        classNames={{
          content: 'hydro-action-sheet-content',
          body: 'hydro-action-sheet-body',
        }}
        styles={{
          content: {
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '18px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
          },
          body: {
            padding: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          },
        }}
      >
        <div className="flex flex-col max-h-[85vh]">
          {/* Drag handle pill */}
          <div
            className="py-2.5 flex justify-center cursor-pointer select-none"
            onClick={() => setOpened(false)}
            aria-hidden="true"
          >
            <div className="w-10 h-1.5 rounded-full bg-[var(--hydro-border)] opacity-60" />
          </div>

          {/* Action sheet header */}
          <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--hydro-border)]">
            <Text fw={700} size="md">
              {displayTitle}
            </Text>
            <CloseButton
              size="md"
              onClick={() => setOpened(false)}
              aria-label={t('Close')}
            />
          </div>

          {/* Action sheet scrollable content */}
          <div className="p-4 overflow-y-auto flex-1">
            {(isMobile ? (isDrawerOpened || keepMounted) : isDrawerOpened) && children}
          </div>
        </div>
      </Drawer>
    </ResponsiveSidebarContext.Provider>
  );
}
