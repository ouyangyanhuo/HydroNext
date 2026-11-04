import { type ComponentPropsWithoutRef, memo, useState } from 'react';

export interface RollingClockProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  value: string;
  /** Whole seconds represented by value, including localized duration labels. */
  seconds: number;
  animate?: boolean;
}

function numericWidths(value: string) {
  return (value.match(/\d+/g) || []).map((digits) => Math.max(2, digits.length));
}

function padClock(value: string, widths: number[]) {
  let index = 0;
  return value.replace(/\d+/g, (digits) => digits.padStart(widths[index++] || 2, '0'));
}

/** Display only: callers remain responsible for timing and server synchronization. */
export const RollingClock = memo(({
  value, seconds, animate = true, className, ...props
}: RollingClockProps) => {
  const [frame, setFrame] = useState(() => ({
    value, seconds, animate, previous: '', at: Date.now(), revision: 0,
    direction: 'up' as 'up' | 'down', widths: numericWidths(value),
  }));
  if (value !== frame.value || animate !== frame.animate) {
    const at = Date.now();
    const widths = numericWidths(value);
    const canRoll = value !== frame.value && animate && typeof document !== 'undefined' && document.visibilityState === 'visible'
      && at >= frame.at && at - frame.at < 2500
      && Number.isFinite(seconds) && Number.isFinite(frame.seconds) && Math.abs(seconds - frame.seconds) === 1
      && widths.every((width, index) => width <= (frame.widths[index] || 0))
      && value.replace(/\d/g, '') === frame.value.replace(/\d/g, '');
    // Keep each unit's viewport stable before, during and after its transition.
    setFrame({
      value, seconds, animate, previous: canRoll ? frame.value : '', at, revision: frame.revision + 1,
      direction: seconds < frame.seconds ? 'down' : 'up',
      widths: widths.length ? widths.map((width, index) => Math.max(width, frame.widths[index] || 0)) : frame.widths,
    });
  }

  const current = padClock(frame.value, frame.widths);
  const previous = padClock(frame.previous, frame.widths);
  const previousParts: string[] = previous.match(/\d+|\D+/gu) || [];
  const renderUnit = (part: string, oldPart: string, index: number) => {
    const moving = Boolean(animate && frame.previous && part !== oldPart);
    const rows = moving && frame.direction === 'up' ? [oldPart, part] : moving ? [part, oldPart] : [part];
    const renderTrack = (blurred = false) => (
      <span className={`hydro-rolling-clock__layer${blurred ? ' hydro-rolling-clock__layer--blurred' : ''}`}>
        <span
          key={moving ? frame.revision : 'still'}
          className="hydro-rolling-clock__track"
          onAnimationEnd={moving && !blurred ? (event) => {
            if (event.target !== event.currentTarget) return;
            setFrame((state) => state.revision === frame.revision && state.previous ? { ...state, previous: '' } : state);
          } : undefined}
        >
          {rows.map((text, row) => (
            <span
              key={row}
              className="hydro-rolling-clock__row"
              data-clock-value={text}
              data-previous={moving && text === oldPart ? true : undefined}
            >{text}</span>
          ))}
        </span>
      </span>
    );
    return (
      <span
        key={`unit-${index}`}
        className="hydro-rolling-clock__unit"
        data-unit={index}
        data-moving={moving ? true : undefined}
        style={{ width: `${part.length}ch` }}
      >
        <span className="hydro-rolling-clock__sizer">{part}</span>
        {renderTrack()}
        {moving && renderTrack(true)}
      </span>
    );
  };

  return (
    <span
      role="timer"
      aria-live="off"
      {...props}
      aria-label={current}
      data-direction={frame.direction}
      className={`hydro-clock hydro-rolling-clock${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true" className="hydro-rolling-clock__content">
        {(current.match(/\d+|\D+/gu) || []).map((part, index) => /^\d+$/.test(part)
          ? renderUnit(part, previousParts[index] || '', index)
          : <span key={`separator-${index}`} className="hydro-rolling-clock__separator">{part}</span>)}
      </span>
    </span>
  );
});
RollingClock.displayName = 'RollingClock';
