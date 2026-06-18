import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from '@/styles/mantine-theme';
import { useSessionStore } from '@/stores/session';
import { HydroNotifications } from '@/components/feedback/hydro-notifications';

export function Providers({ children }: { children: React.ReactNode }) {
    const colorScheme = useSessionStore((s) => s.theme);

    return (
        <MantineProvider theme={theme} forceColorScheme={colorScheme}>
            <Notifications position="top-right" />
            <HydroNotifications />
            {children}
        </MantineProvider>
    );
}
