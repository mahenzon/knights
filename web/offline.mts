// navigator.serviceWorker.ready never rejects, including after a failed first installation.
export function waitForActiveWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker> {
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) return Promise.reject(new Error('Offline installation did not start'));
  return new Promise((resolve, reject) => {
    const changed = () => {
      const active = registration.active;
      if (active?.state === 'activated' || worker.state === 'activated') {
        worker.removeEventListener('statechange', changed);
        resolve(active?.state === 'activated' ? active : worker);
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', changed);
        reject(new Error('Offline installation was interrupted'));
      }
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
}

export function waitForOfflineReady(
  container: ServiceWorkerContainer,
  registration: ServiceWorkerRegistration,
  onProgress?: (completed: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let active: ServiceWorker | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      repairing = false,
      settled = false;
    const ready = new Set<ServiceWorker>(),
      incomplete = new Set<ServiceWorker>();
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      container.removeEventListener('message', message);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const request = (worker: ServiceWorker, type: 'status' | 'repair-offline') => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error('Offline readiness check timed out')), 10_000);
      try {
        worker.postMessage({ type });
      } catch (error) {
        finish(error);
      }
    };
    const repair = (worker: ServiceWorker) => {
      if (repairing)
        finish(new Error('Offline files could not be restored. Reconnect and try again.'));
      else {
        repairing = true;
        request(worker, 'repair-offline');
      }
    };
    const message = (event: MessageEvent) => {
      const source = event.source as ServiceWorker | null;
      if (
        !source ||
        ![active, registration.active, registration.installing, registration.waiting].includes(
          source,
        )
      )
        return;
      const data = event.data;
      if (data?.type === 'offline-ready') {
        ready.add(source);
        if (source === active) finish();
      } else if (data?.type === 'offline-error') {
        incomplete.add(source);
        if (source === active) repair(source);
      } else if (data?.type === 'offline-repairing' && source === active && repairing) {
        clearTimeout(timer);
      } else if (
        data?.type === 'offline-progress' &&
        Number.isSafeInteger(data.completed) &&
        Number.isSafeInteger(data.total) &&
        data.total > 0 &&
        data.completed >= 0 &&
        data.completed <= data.total
      ) {
        if (source === active && repairing) clearTimeout(timer);
        onProgress?.(data.completed, data.total);
      }
    };
    container.addEventListener('message', message);
    void waitForActiveWorker(registration).then((worker) => {
      active = worker;
      if (incomplete.has(worker)) repair(worker);
      else if (ready.has(worker)) finish();
      else request(worker, 'status');
    }, finish);
  });
}
