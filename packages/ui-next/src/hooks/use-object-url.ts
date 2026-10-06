import { useEffect, useState } from 'react';

/** Allocate only after commit: abandoned renders must not leak blob URLs. */
export function useObjectUrl(blob: Blob | null) {
  const [preview, setPreview] = useState<{ blob: Blob, url: string } | null>(null);
  useEffect(() => {
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    // Publish the browser resource allocated by this committed effect; creating
    // it during render would leak URLs from abandoned/StrictMode renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return preview?.blob === blob ? preview.url : '';
}
