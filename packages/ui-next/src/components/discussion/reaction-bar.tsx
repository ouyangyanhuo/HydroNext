import { useState } from 'react';
import { Group, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { useIsLoggedIn } from '@/hooks/use-current-user';

interface Reaction {
  id: string;
  count: number;
  self?: boolean;
}

interface ReactionBarProps {
  reactions: Reaction[];
  onReact?: (id: string) => void;
}

const EMOJI_MAP: Record<string, string> = {
  '+1': '👍', '-1': '👎', 'heart': '❤️', 'smile': '😄',
  'tada': '🎉', 'confused': '😕', 'eyes': '👀', 'rocket': '🚀',
};

export function ReactionBar({ reactions, onReact }: ReactionBarProps) {
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();

  if (!reactions || reactions.length === 0) return null;

  return (
    <Group gap="xs">
      {reactions.map((r) => (
        <Tooltip key={r.id} label={r.self ? t('Remove reaction') : t('Add reaction')}>
          <Badge
            size="lg"
            variant={r.self ? 'filled' : 'light'}
            style={{ cursor: isLoggedIn ? 'pointer' : 'default' }}
            onClick={() => isLoggedIn && onReact?.(r.id)}
          >
            {EMOJI_MAP[r.id] || r.id} {r.count}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
}
