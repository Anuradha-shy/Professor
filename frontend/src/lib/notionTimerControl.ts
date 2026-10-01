let activeStopper: (() => void) | null = null;

export function registerNotionTimerStopper(stop: () => void): () => void {
  activeStopper = stop;
  return () => {
    if (activeStopper === stop) activeStopper = null;
  };
}

export function stopActiveNotionTimer(): void {
  activeStopper?.();
}