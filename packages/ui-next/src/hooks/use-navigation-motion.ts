import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface ItemSnapshot {
  element: HTMLElement;
  rect: DOMRect;
  container: DOMRect;
}

const ITEM_SELECTOR = ':scope > [data-nav-motion-id]';
const MOVE_TIMING: KeyframeAnimationOptions = { duration: 320, delay: 60, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' };

function readItems(node: HTMLElement) {
  const container = node.getBoundingClientRect();
  return new Map(Array.from(node.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .map((element) => [element.dataset.navMotionId!, { element, rect: element.getBoundingClientRect(), container }]));
}

/** FLIP layout motion: read layout once per change, animate only transforms/opacity. */
export function useNavigationMotion(layoutKey: string, externalRef?: RefObject<HTMLDivElement | null>) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const previous = useRef(new Map<string, ItemSnapshot>());
  const initializedNode = useRef<HTMLDivElement | null>(null);
  const movements = useRef(new Map<HTMLElement, Animation>());
  const ghosts = useRef(new Map<string, { element: HTMLElement, animation: Animation }>());

  const ref = useCallback((element: HTMLDivElement | null) => {
    if (externalRef) externalRef.current = element;
    setNode(element);
  }, [externalRef]);

  const stop = useCallback(() => {
    movements.current.forEach((animation) => animation.cancel());
    movements.current.clear();
    ghosts.current.forEach(({ element, animation }) => {
      animation.cancel();
      element.remove();
    });
    ghosts.current.clear();
  }, []);

  useLayoutEffect(() => {
    if (!node) return;
    const initial = initializedNode.current !== node;
    if (initial) {
      stop();
      previous.current.clear();
    }
    initializedNode.current = node;
    const items = Array.from(node.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    // Preserve the current translation if a new toggle interrupts a running move.
    const painted = new Map(items.map((element) => [element, element.getBoundingClientRect()]));
    movements.current.forEach((animation) => animation.cancel());
    movements.current.clear();
    const next = readItems(node);
    const old = previous.current;
    previous.current = next;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof node.animate !== 'function') {
      stop();
      return;
    }
    if (initial) return;

    for (const [id, item] of next) {
      const ghost = ghosts.current.get(id);
      if (ghost) {
        ghost.animation.cancel();
        ghost.element.remove();
        ghosts.current.delete(id);
      }
      if (!item.rect.width || !item.rect.height) continue;
      const before = old.get(id);
      const current = painted.get(item.element)!;
      const targetX = item.rect.left - item.container.left;
      const targetY = item.rect.top - item.container.top;
      const x = before ? before.rect.left - before.container.left - targetX + current.left - item.rect.left : 0;
      const y = before ? before.rect.top - before.container.top - targetY + current.top - item.rect.top : -5;
      if (before && Math.abs(x) < 0.5 && Math.abs(y) < 0.5) continue;
      const animation = item.element.animate([
        { transform: `translate(${x}px, ${y}px)`, ...(!before ? { opacity: 0 } : {}) },
        { transform: 'translate(0, 0)', ...(!before ? { opacity: 1 } : {}) },
      ], before ? MOVE_TIMING : { ...MOVE_TIMING, delay: 0 });
      movements.current.set(item.element, animation);
      void animation.finished.then(() => {
        if (movements.current.get(item.element) !== animation) return;
        movements.current.delete(item.element);
        animation.cancel();
      }).catch(() => {});
    }

    for (const [id, item] of old) {
      if (next.has(id) || !item.rect.width || !item.rect.height) continue;
      // A non-interactive visual copy lets React remove the real link immediately.
      const ghost = item.element.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-nav-motion-id');
      ghost.removeAttribute('id');
      ghost.removeAttribute('href');
      ghost.querySelectorAll('[id], [href]').forEach((element) => {
        element.removeAttribute('id');
        element.removeAttribute('href');
      });
      ghost.inert = true;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.dataset.navMotionExit = id;
      Object.assign(ghost.style, {
        position: 'absolute', left: `${item.rect.left - item.container.left}px`, top: `${item.rect.top - item.container.top}px`,
        width: `${item.rect.width}px`, height: `${item.rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '1',
      });
      node.append(ghost);
      const animation = ghost.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }],
        { duration: 180, easing: 'ease-out', fill: 'both' });
      ghosts.current.set(id, { element: ghost, animation });
      void animation.finished.then(() => {
        if (ghosts.current.get(id)?.animation !== animation) return;
        ghosts.current.delete(id);
        ghost.remove();
        animation.cancel();
      }).catch(() => {});
    }
  }, [node, layoutKey, stop]);

  useEffect(() => {
    if (!node) return undefined;
    const snapshot = () => {
      if (initializedNode.current !== node || movements.current.size) return;
      previous.current = readItems(node);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(snapshot);
    observer?.observe(node);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onPreferenceChange = () => {
      if (!media?.matches) return;
      stop();
      snapshot();
    };
    const onResize = () => {
      stop();
      snapshot();
    };
    window.addEventListener('resize', onResize, { passive: true });
    media?.addEventListener?.('change', onPreferenceChange);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      media?.removeEventListener?.('change', onPreferenceChange);
      if (initializedNode.current === node) {
        stop();
        previous.current.clear();
        initializedNode.current = null;
      }
    };
  }, [node, stop]);

  return ref;
}
