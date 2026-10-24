/* eslint-disable react-refresh/only-export-components -- Addon setup and slot definitions are registration modules. */
import { Avatar, type AvatarProps } from '@mantine/core';
import { defineSlot } from '@/registry';
import { avatarPixelSize } from '@/utils/avatar';

export interface AvatarViewProps extends AvatarProps {
  user?: Record<string, any>;
  shape?: 'circle' | 'square';
  loading?: 'eager' | 'lazy';
  wrapperClassName?: string;
}

function PlainAvatar({
  user: _user, wrapperClassName, shape = 'square', size = 'md', loading = 'lazy', imageProps, style, ...props
}: AvatarViewProps) {
  const pixels = avatarPixelSize(size);
  return <span className={wrapperClassName} style={{ display: 'inline-flex', flexShrink: 0 }}><Avatar
    component="span"
    size={size}
    {...props}
    imageProps={{ loading, decoding: 'async', width: pixels, height: pixels, ...imageProps }}
    style={[...(Array.isArray(style) ? style : [style]), { borderRadius: shape === 'circle' ? '50%' : '16.6667%' }]}
  /></span>;
}

export const AvatarView = defineSlot('component:avatar-view', PlainAvatar);
