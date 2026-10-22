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
