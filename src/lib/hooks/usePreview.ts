/**
 * usePreview — manages live preview panel state (URL, loading, error, view mode).
 */

import { usePreviewStore } from '@/lib/store/previewStore';
import { useCallback } from 'react';

export function usePreview() {
  const { url, isLoading, error, viewMode, setUrl, setLoading, setError, setViewMode, refresh } =
    usePreviewStore();

  const loadUrl = useCallback(
    (newUrl: string) => {
      setLoading(true);
      setError(null);
      setUrl(newUrl);
    },
    [setUrl, setLoading, setError]
  );

  const handleError = useCallback(
    (msg: string) => {
      setError(msg);
      setLoading(false);
    },
    [setError, setLoading]
  );

  const handleLoad = useCallback(() => {
    setLoading(false);
    setError(null);
  }, [setLoading, setError]);

  return {
    url,
    isLoading,
    error,
    viewMode,
    loadUrl,
    setViewMode,
    refresh,
    handleError,
    handleLoad,
  };
}
