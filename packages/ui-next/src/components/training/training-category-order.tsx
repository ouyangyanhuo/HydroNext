import { Badge, Group, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { ActionIcon } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { moveTrainingCategory } from '@/utils/training-category-order';

export function TrainingCategoryOrder({ categories, ids, onChange, disabled = false }: {
  categories: { _id: string, name: string, tids?: unknown[] }[];
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string, pointerId: number, x: number, y: number, original: string[] } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const byId = useMemo(() => new Map(categories.map((item) => [item._id, item])), [categories]);
  const stop = () => {
    drag.current = null;
    setDragging(null);
  };

  return (
    <div ref={root} className="hydro-training-category-order" role="list" aria-label={t('Sort Training Categories')}>
      {ids.map((id, index) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <Group
            key={id}
            gap="sm"
            wrap="nowrap"
            className="hydro-training-category-order__item"
            role="listitem"
            data-category-id={id}
            data-dragging={dragging === id}
          >
            <ActionIcon
              type="button"
              variant="subtle"
              className="hydro-training-category-order__handle"
              disabled={disabled}
              aria-label={`${t('Reorder')} ${item.name}`}
              title={t('Drag to reorder, or use Alt + Up/Down.')}
              onPointerDown={(event) => {
                if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
                drag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, original: [...ids] };
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(id);
              }}
              onPointerMove={(event) => {
                const active = drag.current;
                if (!active || disabled || event.pointerId !== active.pointerId
                  || Math.hypot(event.clientX - active.x, event.clientY - active.y) < 5) return;
                const bounds = root.current?.getBoundingClientRect();
                if (root.current && bounds && bounds.bottom > bounds.top) {
                  if (event.clientY < bounds.top + 28) root.current.scrollTop -= 18;
                  else if (event.clientY > bounds.bottom - 28) root.current.scrollTop += 18;
                }
                const target = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>('[data-category-id]');
                if (!target || !root.current?.contains(target)) return;
                const next = moveTrainingCategory(ids, active.id, target.dataset.categoryId || '');
                if (next !== ids) onChange(next);
              }}
              onPointerUp={stop}
              onLostPointerCapture={stop}
              onPointerCancel={() => { if (drag.current) onChange(drag.current.original); stop(); }}
              onKeyDown={(event) => {
                if (disabled || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                const target = ids[index + (event.key === 'ArrowUp' ? -1 : 1)];
                if (target) onChange(moveTrainingCategory(ids, id, target));
              }}
            ><IconGripVertical size={18} /></ActionIcon>
            <Text size="xs" c="dimmed" w={22} aria-hidden="true">{index + 1}</Text>
            <Text size="sm" fw={500} className="flex-1" truncate>{item.name}</Text>
            <Badge size="xs" variant="light">{item.tids?.length || 0}</Badge>
          </Group>
        );
      })}
    </div>
  );
}
