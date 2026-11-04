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
  const [frame, setFrame] = useState(() => ({ value, seconds, animate, previous: '', at: Date.now(), revision: 0 }));
  if (value !== frame.value || animate !== frame.animate) {
    const at = Date.now();
    const canRoll = value !== frame.value && animate && typeof document !== 'undefined' && document.visibilityState === 'visible'
      && at >= frame.at && at - frame.at < 2500
      && Number.isFinite(seconds) && Number.isFinite(frame.seconds) && Math.abs(seconds - frame.seconds) === 1
      && value.length === frame.value.length && value.replace(/\d/g, '') === frame.value.replace(/\d/g, '');
    // Derive the transition before commit, so a new value never flashes before it rolls in.
    setFrame({ value, seconds, animate, previous: canRoll ? frame.value : '', at, revision: frame.revision + 1 });
  }

  return (
    <span role="timer" aria-live="off" {...props} aria-label={value} className={`hydro-clock hydro-rolling-clock${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true" className="hydro-rolling-clock__content">
        {Array.from(frame.value, (character, index) => {
          const moving = animate && frame.previous && /\d/.test(character) && character !== frame.previous[index];
          if (!/\d/.test(character)) return <span key={index} className="hydro-rolling-clock__separator">{character}</span>;
          return (
            <span key={index} className="hydro-rolling-clock__digit" data-moving={moving ? true : undefined}>
              {moving && (
                <span key={`old-${frame.revision}`} className="hydro-rolling-clock__glyph hydro-rolling-clock__glyph--out">
                  {frame.previous[index]}
                </span>
              )}
              <span
                key={moving ? frame.revision : 'still'}
                className={`hydro-rolling-clock__glyph${moving ? ' hydro-rolling-clock__glyph--in' : ''}`}
                onAnimationEnd={moving ? () => setFrame((current) => current.revision === frame.revision && current.previous
                  ? { ...current, previous: '' } : current) : undefined}
              >{character}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
});
RollingClock.displayName = 'RollingClock';
