import { Group, Text, Title, type TitleOrder } from '@mantine/core';

export interface PageHeaderProps {
  title: React.ReactNode;
  order?: TitleOrder;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  mb?: any;
}

export function PageHeader({
  title,
  order,
  icon,
  description,
  children,
  className,
  mb,
}: PageHeaderProps) {
  if (icon || description) {
    return (
      <header
        className={['hydro-page-header ranking-page-header', className].filter(Boolean).join(' ')}
        style={mb !== undefined ? { marginBottom: typeof mb === 'number' ? `${mb}px` : mb } : undefined}
      >
        <Group gap="md" align="center" wrap="nowrap">
          {icon && (
            <span className="hydro-page-icon ranking-page-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <Title order={order ?? 1} className="hydro-page-title ranking-page-title">
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
        {children}
      </header>
    );
  }

  return (
    <Group
      justify="space-between"
      align="flex-end"
      wrap="wrap"
      gap="md"
      mb={mb ?? 'lg'}
      className={['border-b border-[var(--hydro-border)] pb-4', className].filter(Boolean).join(' ')}
    >
      <div>
        <Title order={order ?? 2} className="text-[var(--hydro-text)]">
          {title}
        </Title>
        <div className="hydro-page-title__accent" aria-hidden="true" />
      </div>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  );
}
