import { Badge, Card, Stack, Text, Title } from '@mantine/core';

interface AuthPanelProps {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
}

export function AuthPanel({ title, eyebrow, description, children }: AuthPanelProps) {
  return (
    <div className="hydro-auth-shell">
      <Card withBorder p="xl" className="hydro-auth-card">
        <Stack gap="lg">
          <div>
            {eyebrow && (
              <Badge variant="light" color="hydroTeal" mb="sm">
                {eyebrow}
              </Badge>
            )}
            <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)]">
              {title}
            </Title>
            {description && (
              <Text c="dimmed" size="sm" mt="xs">
                {description}
              </Text>
            )}
          </div>
          {children}
        </Stack>
      </Card>
    </div>
  );
}
