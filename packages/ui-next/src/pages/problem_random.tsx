import { Button, Card, Loader, Stack, Text, Title } from '@mantine/core';
import { useEffect } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemRandomPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pid = args.pid;

  useEffect(() => {
    if (pid) navigate(`/p/${pid}`);
  }, [navigate, pid]);

  return (
    <Stack gap="lg">
      <PageHeader title={t('Random Problem')} />
      <Card withBorder p="lg" className="hydro-content-card">
        <Stack align="center" gap="md" py="xl">
          {pid ? <Loader size="sm" /> : null}
          <Title order={3} size="h4">{pid ? t('Redirecting') : t('No problem found')}</Title>
          <Text c="dimmed" size="sm">
            {pid ? t('Opening the selected problem.') : t('Try changing the current filter.')}
          </Text>
          <Button component={Link} to="problem_main" variant="light">
            {t('Back to Problems')}
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
