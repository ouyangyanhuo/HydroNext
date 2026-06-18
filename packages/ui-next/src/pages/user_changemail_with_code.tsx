import { Center, Loader, Stack, Text } from '@mantine/core';
import { useEffect } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function UserChangemailWithCodePage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    // The backend handles the verification via the URL code parameter
    // This page just shows the result
    fetch(window.location.href, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          // Stay on page to show error
        } else {
          navigate('/home/security');
        }
      })
      .catch(() => {});
  }, []);

  return (
    <Center className="min-h-[50vh]">
      <Stack align="center" gap="md">
        <Loader size="lg" />
        <Text c="dimmed">{t('Verifying email change...')}</Text>
      </Stack>
    </Center>
  );
}
