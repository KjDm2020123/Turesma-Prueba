import { useEffect, useRef } from "react";

type UseAutoRefreshOptions = {
  enabled: boolean;
  intervalMs?: number;
  immediate?: boolean;
};

export function useAutoRefresh(callback: () => void | Promise<void>, options: UseAutoRefreshOptions) {
  const callbackRef = useRef(callback);
  const runningRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!options.enabled) return;

    let disposed = false;
    const run = () => {
      if (disposed || runningRef.current || document.visibilityState === "hidden") return;
      runningRef.current = true;
      Promise.resolve()
        .then(() => callbackRef.current())
        .finally(() => {
        runningRef.current = false;
        });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") run();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (options.immediate !== false) run();
    const interval = window.setInterval(run, options.intervalMs ?? 5000);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [options.enabled, options.intervalMs, options.immediate]);
}