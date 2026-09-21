import { Button, Divider, Stack } from '@mantine/core';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';

interface OAuthMethod {
  id: string;
  icon?: string;
  text?: string;
  name?: string;
}

interface OAuthButtonsProps {
  methods: OAuthMethod[];
  redirect?: string;
}

export function OAuthButtons({ methods, redirect = '' }: OAuthButtonsProps) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();

  if (!methods || methods.length === 0) return null;

  const handleOAuth = (method: OAuthMethod) => {
    const url = buildUrl('user_oauth', { type: method.id }, redirect ? { redirect } : {});
    window.location.assign(url);
  };

  return (
    <Stack gap="sm">
      <Divider label={t('Or login with')} labelPosition="center" />
      {methods.map((method) => (
        <Button
          key={method.id}
          variant="default"
          fullWidth
          onClick={() => handleOAuth(method)}
          leftSection={method.icon ? <img src={method.icon} alt="" style={{ width: 18, height: 18 }} /> : undefined}
        >
          {method.text || method.name || method.id}
        </Button>
      ))}
    </Stack>
  );
}
