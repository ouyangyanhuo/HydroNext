export interface FloatingPosition { x: number, y: number }

export const CONTEST_TIMER_POSITION_KEY = 'hydro:contest-timer-position:v1';

export function clampFloatingPosition(position: FloatingPosition, viewport: FloatingPosition, size: FloatingPosition): FloatingPosition {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(position.x, Math.max(margin, viewport.x - size.x - margin))),
    y: Math.max(margin, Math.min(position.y, Math.max(margin, viewport.y - size.y - margin))),
  };
}

export function readFloatingPosition(storage: Pick<Storage, 'getItem'>, key: string): FloatingPosition | null {
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  } catch {
    return null;
  }
}

/** Pointer updates use one compositor transform per frame, without re-rendering the editor. */
export function bindFloatingDrag(element: HTMLElement, handle: HTMLElement, key: string) {
  const view = element.ownerDocument.defaultView!;
  let position = { x: 16, y: 16 };
  let size = { x: 0, y: 0 };
  let frame = 0;
  let drag: { pointerId: number, origin: FloatingPosition, position: FloatingPosition } | null = null;
  const viewport = () => ({ x: view.innerWidth, y: view.innerHeight });
  const save = () => {
    try { view.localStorage.setItem(key, JSON.stringify(position)); } catch { /* Storage can be disabled. */ }
  };
  const render = () => {
    frame = 0;
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
  };
  const move = (next: FloatingPosition) => {
    position = clampFloatingPosition(next, viewport(), size);
    frame ||= view.requestAnimationFrame(render);
  };
  const measure = () => {
    const rect = element.getBoundingClientRect();
    size = { x: rect.width, y: rect.height };
  };
  measure();
  try { position = readFloatingPosition(view.localStorage, key) || { x: 16, y: view.innerHeight - size.y - 16 }; } catch {
    position = { x: 16, y: view.innerHeight - size.y - 16 };
  }
  position = clampFloatingPosition(position, viewport(), size);
  element.style.left = '0';
  element.style.top = '0';
  element.style.bottom = 'auto';
  render();

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return;
    measure();
    drag = { pointerId: event.pointerId, origin: { x: event.clientX, y: event.clientY }, position: { ...position } };
    handle.setPointerCapture(event.pointerId);
    element.dataset.dragging = 'true';
    event.preventDefault();
  };
  const pointerMove = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    move({ x: drag.position.x + event.clientX - drag.origin.x, y: drag.position.y + event.clientY - drag.origin.y });
  };
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    drag = null;
    delete element.dataset.dragging;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    save();
  };
  const keyDown = (event: KeyboardEvent) => {
    const delta = event.shiftKey ? 32 : 8;
    const offsets: Record<string, FloatingPosition> = {
      ArrowLeft: { x: -delta, y: 0 }, ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta }, ArrowDown: { x: 0, y: delta },
    };
    if (event.key === 'Home') move({ x: 16, y: view.innerHeight - size.y - 16 });
    else if (offsets[event.key]) move({ x: position.x + offsets[event.key].x, y: position.y + offsets[event.key].y });
    else return;
    event.preventDefault();
    save();
  };
  const resize = () => {
    measure();
    move(position);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  view.addEventListener('resize', resize);
  handle.addEventListener('pointerdown', down);
  handle.addEventListener('pointermove', pointerMove);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('keydown', keyDown);
  return () => {
    if (frame) view.cancelAnimationFrame(frame);
    if (drag) save();
    observer.disconnect();
    view.removeEventListener('resize', resize);
    handle.removeEventListener('pointerdown', down);
    handle.removeEventListener('pointermove', pointerMove);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    handle.removeEventListener('lostpointercapture', finish);
    handle.removeEventListener('keydown', keyDown);
  };
}
