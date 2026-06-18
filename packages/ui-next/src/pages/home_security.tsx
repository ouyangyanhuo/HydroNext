import { useState } from 'react';
import { Paper, Title, PasswordInput, Button, Group, Stack, Text, Divider } from '@mantine/core';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { PageHeader } from '@/components/common/page-header';

export default function HomeSecurityPage() {
    const { t } = useI18n();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) { setError(t('Passwords do not match')); return; }
        setLoading(true); setError(''); setSuccess('');
        try {
            const res = await fetch('/home/security', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ operation: 'changePassword', oldPassword, newPassword }),
            });
            const data = await res.json();
            if (data.error) setError(data.error.message || 'Failed');
            else { setSuccess(t('Password changed')); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }
        } catch { setError('Network error'); }
        finally { setLoading(false); }
    };

    return (
        <Stack gap="lg">
            <PageHeader title={t('Security')} />
            {error && <Text c="red" size="sm">{error}</Text>}
            {success && <Text c="green" size="sm">{success}</Text>}
            <Paper withBorder p="lg">
                <Title order={4} mb="sm">{t('Change Password')}</Title>
                <Stack gap="md">
                    <PasswordInput label={t('Old Password')} value={oldPassword} onChange={(e) => setOldPassword(e.currentTarget.value)} />
                    <PasswordInput label={t('New Password')} value={newPassword} onChange={(e) => setNewPassword(e.currentTarget.value)} />
                    <PasswordInput label={t('Confirm Password')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.currentTarget.value)} />
                    <Group justify="flex-end">
                        <Button onClick={handleChangePassword} loading={loading}>{t('Change Password')}</Button>
                    </Group>
                </Stack>
            </Paper>
        </Stack>
    );
}
