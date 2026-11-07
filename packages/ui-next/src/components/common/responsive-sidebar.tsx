/* eslint-disable react-refresh/only-export-components */
import { CloseButton, Drawer, Portal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronUp } from '@tabler/icons-react';
import React, { createContext, useContext, useRef, useState } from 'react';
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
  className = 'hydro-sidebar w-full shrink-0 lg:w-72',
  title,
  icon,
  as: Component = 'div',
  keepMounted = false,
}: ResponsiveSidebarProps) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentDragRef = useRef(0);
  const isMobile = useMediaQuery('(max-width: 63.99em)', false);

  const displayTitle = title || t('Sidebar');
  const isDrawerOpened = Boolean(isMobile && opened);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    startYRef.current = e.touches[0].clientY;
    currentDragRef.current = 0;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!startYRef.current) return;
    const diff = e.touches[0].clientY - startYRef.current;
    if (diff > 0) {
      currentDragRef.current = diff;
      setDragOffset(diff);
    } else {
      currentDragRef.current = 0;
      setDragOffset(0);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    startYRef.current = 0;
    if (currentDragRef.current > 60) {
      setOpened(false);
    }
    setDragOffset(0);
    currentDragRef.current = 0;
  };

  return (
    <ResponsiveSidebarContext.Provider value={{ close: () => setOpened(false), isMobile: Boolean(isMobile) }}>
      {/* Desktop container: untouched PC layout, hidden on narrow screens */}
      <Component className={`hydro-sidebar hidden lg:block ${className}`}>
        {!isMobile && children}
      </Component>

      {/* Mobile Floating Ball (FAB): only visible on narrow screens, mounted via Portal */}
      <Portal>
        <div
          className={`lg:hidden fixed transition-opacity duration-200 ${isDrawerOpened ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{
            bottom: 'calc(4.25rem + env(safe-area-inset-bottom, 0px))',
            right: 'calc(1.25rem + env(safe-area-inset-right, 0px))',
            zIndex: 100,
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
            {icon || <IconChevronUp size={26} stroke={2.2} />}
          </ActionIcon>
        </div>
      </Portal>

      {/* Mobile Action Sheet (Bottom Drawer) */}
      <Drawer
        opened={isDrawerOpened}
        onClose={() => setOpened(false)}
        position="bottom"
        size="auto"
        radius={0}
        withCloseButton={false}
        trapFocus={false}
        withinPortal
        zIndex={250}
        keepMounted={keepMounted}
        classNames={{
          content: 'hydro-action-sheet-content',
          body: 'hydro-action-sheet-body',
        }}
        styles={{
          inner: {
            transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
            transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
          },
          content: {
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
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
          {/* Drag handle & header area */}
          <div
            className="select-none touch-none cursor-grab active:cursor-grabbing"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Drag handle pill */}
            <div
              className="py-3 flex justify-center"
              onClick={() => {
                if (currentDragRef.current < 5) setOpened(false);
              }}
              role="button"
              tabIndex={0}
              aria-label={t('Close')}
            >
              <div className="w-12 h-1.5 rounded-full bg-[var(--hydro-border)] opacity-70 hover:opacity-100 transition-opacity" />
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
          </div>

          {/* Action sheet scrollable content */}
          <div className="p-4 overflow-y-auto flex-1">
            <div className="flex flex-col gap-3.5">
              {(isMobile ? (isDrawerOpened || keepMounted) : isDrawerOpened) && children}
            </div>
          </div>
        </div>
      </Drawer>
    </ResponsiveSidebarContext.Provider>
  );
}
