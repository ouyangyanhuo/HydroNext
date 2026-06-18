import { Group, Title, type TitleOrder } from '@mantine/core';

interface PageHeaderProps {
  title: string;
  order?: TitleOrder;
  children?: React.ReactNode;
}

export function PageHeader({ title, order = 2, children }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" mb="lg" className="border-b border-[var(--hydro-border)] pb-4">
      <div>
        <Title order={order} className="text-[var(--hydro-text)]">
          {title}
        </Title>
        <div className="mt-2 h-1 w-12 rounded-sm bg-[var(--hydro-accent)]" />
      </div>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  );
}
