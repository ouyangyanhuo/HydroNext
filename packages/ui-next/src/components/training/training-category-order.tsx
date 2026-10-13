import { Badge, Group, Text } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import {
  type CategorySlot, moveTrainingCategory, trainingCategoryDropIndex, trainingCategoryScrollSpeed,
} from '@/utils/training-category-order';

interface CategoryDrag {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  grabY: number;
  source: number;
  target: number;
  original: string[];
  rows: HTMLElement[];
  slots: CategorySlot[];
  active: boolean;
  lastFrame: number;
  maxScroll: number;
}

function animatePositions(list: HTMLElement | null, positions: Map<string, number>) {
  if (!list || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  list.querySelectorAll<HTMLElement>('[data-category-id]').forEach((row) => {
    const before = positions.get(row.dataset.categoryId!);
    const delta = before === undefined ? 0 : before - row.getBoundingClientRect().top;
    if (Math.abs(delta) > 1) {
      row.animate?.([
        { transform: `translate3d(0, ${delta}px, 0)` }, { transform: 'translate3d(0, 0, 0)' },
      ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  });
}

export function TrainingCategoryOrder({ categories, ids, onChange, disabled = false }: {
  categories: { _id: string, name: string, tids?: unknown[] }[];
  ids: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<CategoryDrag | null>(null);
  const frame = useRef<number | null>(null);
  const marker = useRef<HTMLDivElement>(null);
  const previousPositions = useRef<Map<string, number> | null>(null);
  const controls = useRef({ ids, onChange, disabled });
  const [dragging, setDragging] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const byId = useMemo(() => new Map(categories.map((item) => [item._id, item])), [categories]);
  useEffect(() => { controls.current = { ids, onChange, disabled }; }, [ids, onChange, disabled]);
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    drag.current = null;
  }, []);

  useLayoutEffect(() => {
    const positions = previousPositions.current;
    previousPositions.current = null;
    if (positions) animatePositions(root.current, positions);
  }, [ids]);

  const finish = (cancelled: boolean) => {
    const active = drag.current;
    if (!active) return;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    if (active.active) {
      previousPositions.current = new Map(active.rows.map((row) => [row.dataset.categoryId!, row.getBoundingClientRect().top]));
    }
    active.rows.forEach((row) => { row.style.transform = ''; });
    root.current?.removeAttribute('data-reordering');
    if (marker.current) marker.current.style.display = 'none';
    drag.current = null;
    setDragging(null);
    const unchanged = active.original.length === controls.current.ids.length
      && active.original.every((id, index) => id === controls.current.ids[index]);
    if (cancelled || controls.current.disabled || !unchanged) {
      if (previousPositions.current) animatePositions(root.current, previousPositions.current);
      previousPositions.current = null;
      if (active.active) setFeedback(t('Reordering cancelled.'));
      return;
    }
    if (active.active && active.source !== active.target) {
      controls.current.onChange(moveTrainingCategory(active.original, active.id, active.original[active.target]));
      setFeedback(t('Category moved to position {0}. Save to apply.', active.target + 1));
    } else {
      if (previousPositions.current) animatePositions(root.current, previousPositions.current);
      previousPositions.current = null;
    }
  };

  const draw = (time: number) => {
    frame.current = null;
    const active = drag.current;
    const list = root.current;
    if (!active?.active || !list) return;
    if (controls.current.disabled) {
      finish(true);
      return;
    }
    const bounds = list.getBoundingClientRect();
    const elapsed = active.lastFrame ? Math.min(32, Math.max(0, time - active.lastFrame)) : 16;
    active.lastFrame = time;
    const speed = trainingCategoryScrollSpeed(active.y, bounds.top, bounds.bottom);
    const scrollBefore = list.scrollTop;
    // Translated rows can extend scrollHeight; clamp against the original content extent.
    list.scrollTop = Math.max(0, Math.min(active.maxScroll, scrollBefore + speed * elapsed / 1000));
    const sourceSlot = active.slots[active.source];
    const top = active.y - bounds.top + list.scrollTop - active.grabY;
    const target = trainingCategoryDropIndex(active.slots, active.source, top + sourceSlot.height / 2, active.target);
    const gap = active.slots.length > 1 ? active.slots[1].top - active.slots[0].top - active.slots[0].height : 8;
    active.rows.forEach((row, index) => {
      const shift = index === active.source ? top - sourceSlot.top
        : active.source < target && index > active.source && index <= target ? -(sourceSlot.height + gap)
          : active.source > target && index >= target && index < active.source ? sourceSlot.height + gap : 0;
      const transform = `translate3d(0, ${shift}px, 0)`;
      if (row.style.transform !== transform) row.style.transform = transform;
    });
    const destination = active.slots[target];
    const landingTop = active.source < target ? destination.top + destination.height - sourceSlot.height : destination.top;
    if (marker.current) {
      marker.current.style.display = 'block';
      marker.current.style.transform = `translate3d(0, ${landingTop - gap / 2}px, 0)`;
    }
    if (active.target !== target) {
      active.target = target;
      setFeedback(t('Dragging {0}. Release to place at position {1}.', byId.get(active.id)?.name || '', target + 1));
    }
    // Keep scrolling even when the pointer is stationary at an edge, but stop at the boundary.
    if (speed && list.scrollTop !== scrollBefore) frame.current = window.requestAnimationFrame(draw);
  };

  return (
    <div>
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
                  const list = root.current;
                  if (disabled || !list || drag.current || event.isPrimary === false || event.button !== 0) return;
                  const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-category-id]'));
                  if (rows.length !== ids.length) return;
                  rows.forEach((row) => row.getAnimations?.().forEach((animation) => animation.cancel()));
                  const bounds = list.getBoundingClientRect();
                  const source = ids.indexOf(id);
                  const slots = rows.map((row) => {
                    const rect = row.getBoundingClientRect();
                    return { top: rect.top - bounds.top + list.scrollTop, height: rect.height };
                  });
                  drag.current = {
                    id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
                    original: [...ids], source, target: source, slots, rows, active: false, lastFrame: 0,
                    maxScroll: Math.max(0, list.scrollHeight - list.clientHeight),
                    grabY: event.clientY - rows[source].getBoundingClientRect().top,
                  };
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const active = drag.current;
                  if (!active || disabled || event.pointerId !== active.pointerId) return;
                  active.x = event.clientX;
                  active.y = event.clientY;
                  if (!active.active) {
                    if (Math.hypot(active.x - active.startX, active.y - active.startY) < 5) return;
                    active.active = true;
                    root.current?.setAttribute('data-reordering', 'true');
                    setDragging(id);
                    setFeedback(t('Dragging {0}. Release to place at position {1}.', item.name, active.target + 1));
                  }
                  if (frame.current === null) frame.current = window.requestAnimationFrame(draw);
                }}
                onPointerUp={(event) => {
                  if (event.pointerId !== drag.current?.pointerId) return;
                  drag.current.x = event.clientX;
                  drag.current.y = event.clientY;
                  const bounds = root.current?.getBoundingClientRect();
                  const outside = bounds && (event.clientX < bounds.left - 24 || event.clientX > bounds.right + 24
                    || event.clientY < bounds.top - 48 || event.clientY > bounds.bottom + 48);
                  if (frame.current !== null) window.cancelAnimationFrame(frame.current);
                  draw(performance.now());
                  finish(Boolean(outside) || disabled);
                }}
                onLostPointerCapture={() => finish(true)}
                onPointerCancel={() => finish(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && drag.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    finish(true);
                    return;
                  }
                  if (drag.current) return;
                  if (disabled || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                  event.preventDefault();
                  const target = ids[index + (event.key === 'ArrowUp' ? -1 : 1)];
                  if (target) {
                    previousPositions.current = new Map(Array.from(root.current!.querySelectorAll<HTMLElement>('[data-category-id]'))
                      .map((row) => [row.dataset.categoryId!, row.getBoundingClientRect().top]));
                    onChange(moveTrainingCategory(ids, id, target));
                    setFeedback(t('Category moved to position {0}. Save to apply.', ids.indexOf(target) + 1));
                  }
                }}
              ><IconGripVertical size={18} /></ActionIcon>
              <Text size="xs" c="dimmed" w={22} aria-hidden="true">{index + 1}</Text>
              <Text size="sm" fw={500} className="flex-1" truncate>{item.name}</Text>
              <Badge size="xs" variant="light">{item.tids?.length || 0}</Badge>
            </Group>
          );
        })}
        <div ref={marker} className="hydro-training-category-order__marker" aria-hidden="true" />
      </div>
      <Text size="xs" c="dimmed" mt={8} mih={20} role="status" aria-live="polite">{feedback || '\u00A0'}</Text>
    </div>
  );
}
