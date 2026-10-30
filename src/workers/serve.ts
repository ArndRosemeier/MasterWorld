/// <reference lib="webworker" />
/**
 * The worker side of WorkerPool (pool.ts): answer each `{ id, job }` with `{ id, result }` (its buffers
 * transferred) or `{ id, error }`.
 */
export function serve<Job, Result>(handle: (job: Job) => { result: Result; transfer: Transferable[] }, stats?: () => Record<string, number>): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = (e: MessageEvent<{ id: number; job: Job }>) => {
    const { id, job } = e.data;
    try {
      const t0 = performance.now();
      const { result, transfer } = handle(job);
      // How long the job took here, and what the worker counts (the load probe's job log, tools/shot/load.mjs).
      scope.postMessage({ id, result, ms: performance.now() - t0, stats: stats?.() }, transfer);
    } catch (err) {
      scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
