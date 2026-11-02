/**
 * Posts (Arnd 2026-11-02): whoever the game's mechanics rest on (the innkeeper's room and cart, the smith's
 * mending, every shop's keeper, the harbour master's passage, each guild's teacher, the bard, a market seller at
 * a stall) is found at their post in every hour: awake they stay in their building, asleep they lie in its bed
 * and can be woken to talk. Nobody who offers a service is ever out in the town or missing from the house the
 * hero comes to. ONE list says which trades those are, built from the setting's own tables plus the few trades
 * the upkeep and voyage code answers for, so a new shop or guild joins it without further work, and a test
 * (test/posts.test.ts) holds each of them to their post and scans the app for a service on a trade not listed.
 * Pure.
 */
import type { TownPlan } from '@futuremagic/settlement';
import type { SettingModule } from '../setting/contract';
import type { Person } from '../sim/people';
import { bardOf } from './guilds';

/** The trades the upkeep and voyage code answers for besides the setting's shops and guilds (app/upkeepUi.ts services). */
export const SERVICE_TRADES = ['innkeeper', 'smith', 'harbourmaster'] as const;

/** Every trade whose master the hero comes to for something: shops, guilds, upkeep, passage. The market's traders are `role: 'trader'`, not here. */
export function postTrades(setting: Pick<SettingModule, 'shops' | 'guilds'>): Set<string> {
  const out = new Set<string>(SERVICE_TRADES);
  for (const s of setting.shops) if (s.keeper !== 'trader') out.add(s.keeper);
  for (const g of setting.guilds ?? []) out.add(g.keeper);
  return out;
}

/**
 * Who holds a post, by person id: the building they keep to while awake and sleep in. A master of a service trade
 * (any of the town's, not only the first of the trade: a hand lending a hand at the harbour master's has the trade
 * too but serves nothing) keeps the building they work; the bard keeps the inn.
 */
export function postsOf(plan: TownPlan, people: readonly Person[], trades: ReadonlySet<string>): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of people) if (p.role === 'trade' && p.work >= 0 && trades.has(p.trade)) out.set(p.id, p.work);
  const bard = bardOf(people, plan), inn = bard && plan.buildings[bard.work];
  if (bard && inn && inn.kind === 'inn') out.set(bard.id, inn.id);
  return out;
}
