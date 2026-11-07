const listeners = new Set<() => void>();
let requested = false;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToCloseConfirmation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCloseConfirmationSnapshot(): boolean {
  return requested;
}

export function dismissCloseConfirmation(): void {
  if (!requested) {
    return;
  }
  requested = false;
  emit();
}

export function requestCloseConfirmation(): void {
  if (requested) {
    return;
  }
  requested = true;
  emit();
}
