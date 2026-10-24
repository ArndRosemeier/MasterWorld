/// <reference lib="webworker" />
/**
 * The worker side of WorkerPool (pool.ts): answer each `{ id, job }` with `{ id, result }` (its buffers
 * transferred) or `{ id, error }`.
 */
export function serve<Job, Result>(handle: (job: Job) => { result: Result; transfer: Transferable[] }): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = (e: MessageEvent<{ id: number; job: Job }>) => {
    const { id, job } = e.data;
    try {
      const { result, transfer } = handle(job);
      scope.postMessage({ id, result }, transfer);
    } catch (err) {
      scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
