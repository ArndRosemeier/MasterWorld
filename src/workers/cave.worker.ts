/// <reference lib="webworker" />
/**
 * Formed caves (D63, phase K): a cave of one rock and size formed, carved and meshed off the main thread. The preview
 * gallery asks for them (tools/preview/formed.ts) and the game does (app/cellars.ts); the work itself is world/cave/job.ts.
 */
import { runCaveJob } from '../world/cave/job';
import { serve } from './serve';

export type { CaveJob, CaveResult } from '../world/cave/job';

serve(runCaveJob);
