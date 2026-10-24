import { Avatar, type AvatarProps } from '@mantine/core';
import { type CSSProperties, useState } from 'react';
import { avatarFrameInset, avatarPixelSize, type HonorFrame, honorFrameImageSources, honorFrameImageUrl } from '../../utils/honor-frame';

export interface FramedAvatarProps extends AvatarProps {
  frame?: HonorFrame | null;
  frameClassName?: string;
  shape?: 'circle' | 'square';
  loading?: 'eager' | 'lazy';
}

/** The reserved footprint is identical before and after a decoration loads. */
export function FramedAvatar({
  frame, frameClassName, shape = 'square', size = 'md', style, loading = 'lazy', imageProps, ...props
}: FramedAvatarProps) {
  const src = honorFrameImageUrl((shape === 'circle' ? frame?.circleImageUrl : frame?.squareImageUrl) || frame?.imageUrl);
  const [failedVariant, setFailedVariant] = useState<string>();
  const sources = failedVariant === src ? { src } : honorFrameImageSources(src, size);
  const pixels = avatarPixelSize(size);
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
        imageProps={{ loading, decoding: 'async', width: pixels, height: pixels, ...imageProps }}
        style={[...(Array.isArray(style) ? style : [style]), { borderRadius: shape === 'circle' ? '50%' : '16.6667%' }]} />
      {src && src !== failedSrc && (
        <img
          className="hydro-avatar-frame__decoration"
          {...sources}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading={loading}
          width={512}
          height={512}
          decoding="async"
          onError={() => sources.srcSet ? setFailedVariant(src) : setFailedSrc(src)}
        />
      )}
    </span>
  );
}
