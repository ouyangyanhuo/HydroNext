import { Avatar, type AvatarProps } from '@mantine/core';
import { type CSSProperties, useState } from 'react';
import { avatarFrameInset, type HonorFrame, honorFrameImageUrl } from '@/utils/honor-frame';

export interface FramedAvatarProps extends AvatarProps {
  frame?: HonorFrame | null;
  frameClassName?: string;
  shape?: 'circle' | 'square';
}

/** The reserved footprint is identical before and after a decoration loads. */
export function FramedAvatar({ frame, frameClassName, shape = 'square', size = 'md', style, ...props }: FramedAvatarProps) {
  const src = honorFrameImageUrl((shape === 'circle' ? frame?.circleImageUrl : frame?.squareImageUrl) || frame?.imageUrl);
  const [failedSrc, setFailedSrc] = useState<string>();
  return (
    <span
      className={['hydro-avatar-frame', frameClassName].filter(Boolean).join(' ')}
      style={{ '--hydro-avatar-frame-inset': `${avatarFrameInset(size, 2)}px` } as CSSProperties}
      data-avatar-shape={shape}
      data-frame-id={src && src !== failedSrc ? frame?.id : undefined}
    >
      <Avatar
        component="span"
        size={size}
        {...props}
        style={[...(Array.isArray(style) ? style : [style]), { borderRadius: shape === 'circle' ? '50%' : '16.6667%' }]} />
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
