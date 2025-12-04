import { useCallback, useEffect, useState } from 'react';
import { pauseBulk, resumeBulk, cancelBulk } from '../services/api';

export type BulkQueueStatus = 'idle' | 'running' | 'waiting' | 'paused' | 'cancelled' | 'completed';

interface BulkProgressLike {
  status?: 'processing' | 'waiting' | 'completed';
}

interface UseBulkQueueControlResult {
  status: BulkQueueStatus;
  isPaused: boolean;
  isWaiting: boolean;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Hook global para controlar la cola de envíos masivos (pausa/reanudar/cancelar).
 * Puede reutilizarse en cualquier parte pasando el estado de bulkProgress si se desea.
 */
export function useBulkQueueControl(bulkProgress?: BulkProgressLike | null): UseBulkQueueControlResult {
  const [status, setStatus] = useState<BulkQueueStatus>('idle');
  const [isPaused, setIsPaused] = useState(false);

  // Derivar estado base desde bulkProgress cuando cambie
  useEffect(() => {
    if (!bulkProgress) {
      if (!isPaused) {
        setStatus('idle');
      }
      return;
    }

    if (isPaused) {
      setStatus('paused');
      return;
    }

    if (bulkProgress.status === 'waiting') {
      setStatus('waiting');
    } else if (bulkProgress.status === 'completed') {
      setStatus('completed');
    } else {
      setStatus('running');
    }
  }, [bulkProgress, isPaused]);

  const pause = useCallback(async () => {
    await pauseBulk();
    setIsPaused(true);
    setStatus('paused');
  }, []);

  const resume = useCallback(async () => {
    await resumeBulk();
    setIsPaused(false);
    if (bulkProgress?.status === 'waiting') {
      setStatus('waiting');
    } else if (bulkProgress?.status === 'completed') {
      setStatus('completed');
    } else {
      setStatus('running');
    }
  }, [bulkProgress]);

  const cancel = useCallback(async () => {
    await cancelBulk();
    setIsPaused(false);
    setStatus('cancelled');
  }, []);

  return {
    status,
    isPaused,
    isWaiting: status === 'waiting',
    pause,
    resume,
    cancel,
  };
}
