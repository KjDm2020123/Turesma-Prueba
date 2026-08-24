import { useEffect, useRef } from "react";

type UseAutoRefreshOptions = {
  enabled: boolean;
  intervalMs?: number;
  immediate?: boolean;
};

export function useAutoRefresh(callback: () => void | Promise<void>, options: UseAutoRefreshOptions) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!options.enabled) return;

    if (options.immediate !== false) {
      callbackRef.current();
    }
    const interval = window.setInterval(() => {
      void callbackRef.current();
    }, options.intervalMs ?? 5000);

    return () => window.clearInterval(interval);
  }, [options.enabled, options.intervalMs]);
}