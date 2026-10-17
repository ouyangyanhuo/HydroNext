import './invitation-code-input.css';

import { Input } from '@mantine/core';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { INVITATION_CODE_LENGTH, isInvitationCodeComplete } from '@/utils/invitation-code';

interface InvitationCodeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
}

/** Spaces preserve empty positions while editing; only a fully filled code is valid. */
export function InvitationCodeInput({ label, value, onChange, onSubmit, autoFocus, disabled, required }: InvitationCodeInputProps) {
  const { t } = useI18n();
  const id = useId();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const movingFocus = useRef(false);
  const [pasteError, setPasteError] = useState(false);
  const characters = Array.from({ length: INVITATION_CODE_LENGTH }, (_, index) => value[index]?.trim() || '');
  const firstEmpty = characters.findIndex((character) => !character);
  const lastEditable = firstEmpty === -1 ? INVITATION_CODE_LENGTH - 1 : firstEmpty;
  const message = t('Enter exactly {0} letters or numbers.', INVITATION_CODE_LENGTH);
  const focus = (index: number, next = characters) => {
    const empty = next.findIndex((character) => !character);
    const target = Math.max(0, Math.min(index, empty === -1 ? INVITATION_CODE_LENGTH - 1 : empty));
    // The next controlled value may not have rendered when focus changes in the same event.
    movingFocus.current = true;
    try {
      inputs.current[target]?.focus();
    } finally {
      movingFocus.current = false;
    }
  };
  const update = (index: number, character: string) => {
    const next = [...characters];
    next[index] = character;
    onChange(next.map((item) => item || ' ').join('').trimEnd());
    setPasteError(false);
    return next;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    if (index > lastEditable) {
      event.preventDefault();
      focus(lastEditable);
      return;
    }
    if (event.key === 'Enter') {
      if (!isInvitationCodeComplete(value) || onSubmit) event.preventDefault();
      if (isInvitationCodeComplete(value)) onSubmit?.();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      if (characters[index]) focus(index, update(index, ''));
      else if (index > 0) {
        update(index - 1, '');
        focus(index - 1);
      }
    } else if (event.key === 'Delete') {
      event.preventDefault();
      focus(index, update(index, ''));
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      focus(event.key === 'Home' ? 0 : event.key === 'End' ? INVITATION_CODE_LENGTH - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  };

  return (
    <Input.Wrapper id={id} label={label} description={message} error={pasteError ? message : undefined} required={required}>
      <div className="hydro-invitation-code" role="group" aria-label={label} data-error={pasteError || undefined}>
        {characters.map((character, index) => (
          <input
            key={index}
            id={index === 0 ? id : `${id}-${index}`}
            ref={(node) => { inputs.current[index] = node; }}
            className="hydro-invitation-code__character"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={1}
            pattern="[A-Za-z0-9]"
            value={character}
            data-filled={!!character || undefined}
            tabIndex={index > lastEditable ? -1 : 0}
            aria-label={`${label} ${index + 1}/${INVITATION_CODE_LENGTH}`}
            aria-describedby={`${id}-description${pasteError ? ` ${id}-error` : ''}`}
            aria-invalid={pasteError || undefined}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus && index === 0}
            onFocus={(event) => {
              if (!movingFocus.current && index > lastEditable) focus(lastEditable);
              else event.currentTarget.select();
            }}
            onChange={(event) => {
              if (index > lastEditable) {
                focus(lastEditable);
                return;
              }
              const next = event.currentTarget.value.toUpperCase();
              if (next && !/^[A-Z0-9]$/.test(next)) return;
              const updated = update(index, next);
              focus(next ? index + 1 : index, updated);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData.getData('text/plain').trim().toUpperCase();
              const start = pasted.length === INVITATION_CODE_LENGTH ? 0 : Math.min(index, lastEditable);
              if (!/^[A-Z0-9]+$/.test(pasted) || pasted.length > INVITATION_CODE_LENGTH - start) {
                onChange('');
                setPasteError(true);
                focus(0, []);
                return;
              }
              const next = [...characters];
              for (let offset = 0; offset < pasted.length; offset++) next[start + offset] = pasted[offset];
              onChange(next.map((item) => item || ' ').join('').trimEnd());
              setPasteError(false);
              focus(start + pasted.length, next);
            }}
          />
        ))}
      </div>
    </Input.Wrapper>
  );
}
