import { useState } from 'react';
import { Paper, Stack, Text, Group, Button, Tabs, TextInput, Textarea, Switch, Select } from '@mantine/core';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from '@/components/common/page-header';

export default function ManageSettingPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const settings = args.settings || {};
    const [form, setForm] = useState(settings);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        setLoading(true); setError('');
        try {
            const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.error) setError(data.error.message || 'Save failed');
        } catch { setError('Network error'); }
        finally { setLoading(false); }
    };

    const settingGroups = Object.entries(form);

    return (
        <Stack gap="lg">
            <PageHeader title={t('System Settings')}>
                <Button onClick={handleSave} loading={loading} size="xs">{t('Save')}</Button>
            </PageHeader>
            {error && <Text c="red" size="sm">{error}</Text>}
            <Paper withBorder p="lg">
                <Stack gap="md">
                    {settingGroups.slice(0, 20).map(([key, value]) => (
                        <TextInput
                            key={key}
                            label={key}
                            value={String(value ?? '')}
                            onChange={(e) => setForm({ ...form, [key]: e.currentTarget.value })}
                        />
                    ))}
                </Stack>
            </Paper>
        </Stack>
    );
}
