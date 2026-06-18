import { Group, Title, type TitleOrder } from '@mantine/core';

interface PageHeaderProps {
  title: string;
  order?: TitleOrder;
  children?: React.ReactNode;
}

export function PageHeader({ title, order = 2, children }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="center" mb="md">
      <Title order={order}>{title}</Title>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  );
}
