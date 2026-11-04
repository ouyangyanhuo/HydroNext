import { type ComponentPropsWithoutRef, memo, useState } from 'react';

export interface RollingClockProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  value: string;
  /** Whole seconds represented by value, including localized duration labels. */
  seconds: number;
  animate?: boolean;
}

/** Display only: callers remain responsible for timing and server synchronization. */
export const RollingClock = memo(({
  value, seconds, animate = true, className, ...props
}: RollingClockProps) => {
  const [frame, setFrame] = useState(() => ({
    value, seconds, animate, previous: '', at: Date.now(), revision: 0, direction: 'up' as 'up' | 'down',
  }));
  if (value !== frame.value || animate !== frame.animate) {
    const at = Date.now();
    const canRoll = value !== frame.value && animate && typeof document !== 'undefined' && document.visibilityState === 'visible'
      && at >= frame.at && at - frame.at < 2500
      && Number.isFinite(seconds) && Number.isFinite(frame.seconds) && Math.abs(seconds - frame.seconds) === 1
      && value.length === frame.value.length && value.replace(/\d/g, '') === frame.value.replace(/\d/g, '');
    // Derive the transition before commit, so a new value never flashes before it rolls in.
    setFrame({
      value, seconds, animate, previous: canRoll ? frame.value : '', at, revision: frame.revision + 1,
      direction: seconds < frame.seconds ? 'down' : 'up',
    });
  }

  const parts: string[] = frame.value.match(/\d+|\D+/gu) || [];
  const previousParts: string[] = frame.previous.match(/\d+|\D+/gu) || [];
  const renderColumn = (characters: string, oldCharacters: string, key: string) => {
    const moving = animate && frame.previous && characters !== oldCharacters;
    return (
      <span
        key={key}
        className={`hydro-rolling-clock__digit${characters.length > 1 ? ' hydro-rolling-clock__digit--group' : ''}`}
        data-moving={moving ? true : undefined}
        style={characters.length > 1 ? { width: `${characters.length}ch` } : undefined}
      >
        {moving && (
          <span key={`old-${frame.revision}`} className="hydro-rolling-clock__glyph hydro-rolling-clock__glyph--out">
            {oldCharacters}
          </span>
        )}
        <span
          key={moving ? frame.revision : 'still'}
          className={`hydro-rolling-clock__glyph${moving ? ' hydro-rolling-clock__glyph--in' : ''}`}
          onAnimationEnd={moving ? () => setFrame((current) => current.revision === frame.revision && current.previous
            ? { ...current, previous: '' } : current) : undefined}
        >{characters}</span>
      </span>
    );
  };

  return (
    <span
      role="timer"
      aria-live="off"
      {...props}
      aria-label={value}
      data-direction={frame.direction}
      className={`hydro-clock hydro-rolling-clock${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true" className="hydro-rolling-clock__content">
        {parts.flatMap((part, index) => {
          if (!/^\d+$/.test(part)) return [<span key={`separator-${index}`} className="hydro-rolling-clock__separator">{part}</span>];
          const oldPart = previousParts[index] || '';
          const changed = Array.from(part).filter((character, digit) => character !== oldPart[digit]).length;
          // Roll a carry/borrow as one unit (59 -> 00), not several competing digit reels.
          if (oldPart.length === part.length && changed > 1) return [renderColumn(part, oldPart, `group-${index}`)];
          return Array.from(part, (character, digit) => renderColumn(character, oldPart[digit] || '', `${index}-${digit}`));
        })}
      </span>
    </span>
  );
});
RollingClock.displayName = 'RollingClock';
