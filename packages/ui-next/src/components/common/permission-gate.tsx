import { usePermission } from '@/hooks/use-permission';

interface PermissionGateProps {
  priv: number | bigint;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ priv, children, fallback = null }: PermissionGateProps) {
  const { hasPriv } = usePermission();

  if (!hasPriv(priv)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
