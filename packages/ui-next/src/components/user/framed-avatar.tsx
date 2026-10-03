import { Avatar, type AvatarProps } from '@mantine/core';
import { type CSSProperties, useState } from 'react';
import { avatarFrameInset, type HonorFrame, honorFrameImageUrl } from '@/utils/honor-frame';

export interface FramedAvatarProps extends AvatarProps {
  frame?: HonorFrame | null;
  frameClassName?: string;
}

/** The reserved footprint is identical before and after a decoration loads. */
export function FramedAvatar({ frame, frameClassName, size = 'md', ...props }: FramedAvatarProps) {
  const src = honorFrameImageUrl(frame?.imageUrl);
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span
      className={['hydro-avatar-frame', frameClassName].filter(Boolean).join(' ')}
      style={{ '--hydro-avatar-frame-inset': `${avatarFrameInset(size)}px` } as CSSProperties}
      data-frame-id={src && src !== failedSrc ? frame?.id : undefined}
    >
      <Avatar component="span" size={size} {...props} />
      {src && src !== failedSrc && (
        <img
          className="hydro-avatar-frame__decoration"
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}
