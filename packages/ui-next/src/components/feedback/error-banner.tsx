import { Alert } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

export interface FeedbackBannerProps {
  message?: React.ReactNode;
  title?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function ErrorBanner({ message, title, onClose, className }: FeedbackBannerProps) {
  if (!message) return null;
  return (
    <Alert
      color="red"
      variant="light"
      role="alert"
      title={title}
      icon={<IconAlertCircle size={16} stroke={1.9} />}
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      className={className}
    >
      {message}
    </Alert>
  );
}

export function SuccessBanner({ message, title, onClose, className }: FeedbackBannerProps) {
  if (!message) return null;
  return (
    <Alert
      color="green"
      variant="light"
      role="status"
      title={title}
      icon={<IconCheck size={16} stroke={1.9} />}
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      className={className}
    >
      {message}
    </Alert>
  );
}
