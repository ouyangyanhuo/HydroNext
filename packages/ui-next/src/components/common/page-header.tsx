import { Group, Text, Title, type TitleOrder } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import type { UrlParams } from '@/hooks/use-build-url';

export interface PageHeaderBack {
  to?: string;
  params?: UrlParams;
  href?: string;
  label?: React.ReactNode;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  order?: TitleOrder;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  back?: PageHeaderBack;
  children?: React.ReactNode;
  className?: string;
  mb?: any;
}

export function PageHeader({
  title,
  order,
  icon,
  description,
  back,
  children,
  className,
  mb,
}: PageHeaderProps) {
  const isSectionHeader = Boolean(icon);
  const resolvedMb = mb !== undefined
    ? (typeof mb === 'number' ? `${mb}px` : mb)
    : undefined;

  const backControl = back ? (
    <div className="hydro-page-header__back">
      {back.onClick ? (
        <Button
          type="button"
          variant="subtle"
          size="compact-xs"
          leftSection={<IconArrowLeft size={14} stroke={1.9} />}
          onClick={back.onClick}
          className="hydro-page-header__back-btn"
        >
          {back.label}
        </Button>
      ) : (
        <Button
          component={Link}
          to={back.to}
          params={back.params}
          href={back.href}
          variant="subtle"
          size="compact-xs"
          leftSection={<IconArrowLeft size={14} stroke={1.9} />}
          className="hydro-page-header__back-btn"
        >
          {back.label}
        </Button>
      )}
    </div>
  ) : null;

  return (
    <header
      className={[
        'hydro-page-header',
        isSectionHeader ? 'hydro-page-header--section' : 'hydro-page-header--compact',
        className,
      ].filter(Boolean).join(' ')}
      style={resolvedMb !== undefined ? { marginBottom: resolvedMb } : undefined}
    >
      <div className="min-w-0 flex-1">
        {backControl}
        <Group gap="md" align="center" wrap="nowrap">
          {icon && (
            <span className="hydro-page-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <Title
              order={order ?? (isSectionHeader ? 1 : 2)}
              className={isSectionHeader ? 'hydro-page-title' : 'text-[var(--hydro-text)]'}
            >
              {title}
            </Title>
            <div className="hydro-page-title__accent" aria-hidden="true" />
            {description && (
              <Text size="sm" c="dimmed" mt={4}>
                {description}
              </Text>
            )}
          </div>
        </Group>
      </div>
      {children && (
        <div className="hydro-page-header__actions">
          {children}
        </div>
      )}
    </header>
  );
}
