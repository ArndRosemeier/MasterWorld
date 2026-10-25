/**
 * The VGM's orders to a town's people (plan 9.3, D27): logged as decisions, so a save replays them;
 * the town's simulation (sim/townLife) carries them out.
 */
import type { TownOrder } from '../sim/townLife';
import type { DecisionLog, OrderDecision } from '../world/decisions';

/** A new order for `town`, to append to the log. */
export function townOrder(log: DecisionLog, town: string, order: TownOrder): OrderDecision {
  const n = log.filter((d) => d.kind === 'order').length;
  return { kind: 'order', id: `order-${n + 1}`, town, order };
}

/** Every order the log holds for `town`, oldest first (the newest wins where they overlap). */
export function ordersOf(log: DecisionLog, town: string): TownOrder[] {
  return log.flatMap((d) => (d.kind === 'order' && d.town === town ? [d.order] : []));
}
