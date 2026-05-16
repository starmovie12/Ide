import { useAPIKeyStore } from '@/lib/store/apiKeyStore';
import { useMemo } from 'react';

export function useAPIKeys() {
  const {
    keys,
    addKey,
    removeKey,
    updateKeyStatus,
    markFailure,
    markSuccess,
    getNextAvailableKey,
    getHealthStatus,
    testKey,
    _incrementRequest,
  } = useAPIKeyStore();

  const activeKeys = useMemo(() => keys.filter((k) => k.status === 'active'), [keys]);
  const warningKeys = useMemo(() => keys.filter((k) => k.status === 'warning'), [keys]);
  const deadKeys = useMemo(() => keys.filter((k) => k.status === 'dead'), [keys]);

  const hasKeys = keys.length > 0;
  const hasActiveKeys = activeKeys.length > 0;

  const totalRequests = useMemo(() => keys.reduce((sum, k) => sum + k.requestCount, 0), [keys]);
  const totalDailyRequests = useMemo(() => keys.reduce((sum, k) => sum + k.dailyRequests, 0), [keys]);

  return {
    keys,
    activeKeys,
    warningKeys,
    deadKeys,
    hasKeys,
    hasActiveKeys,
    totalRequests,
    totalDailyRequests,

    addKey,
    removeKey,
    updateKeyStatus,
    markFailure,
    markSuccess,
    getNextAvailableKey,
    getHealthStatus,
    testKey,
    _incrementRequest,
  };
}
