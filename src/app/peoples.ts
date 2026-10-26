/**
 * The peoples in town talk (plan 11.6): the services their folk offer besides talk that touch standing.
 * Folk of a people with a hold tell of it (the journal takes a lead and the map the gate's mark), and take
 * a gift for their people while gifts still raise the hero's standing with them.
 */
import type { Character } from '../game/character';
import { coinText } from '../game/items';
import { changeLine, type Standing } from '../game/standing';
import type { SettingModule } from '../setting/contract';
import type { Person } from '../sim/people';
import { fill } from '../talk/folk';
import type { Journal } from '../talk/journal';
import type { Service } from '../talk/townTalk';
import type { HoldDecision } from '../world/decisions';

export interface PeoplesHost {
  readonly setting: SettingModule;
  readonly character: Character;
  readonly standing: Standing;
  readonly journal: Journal;
  /** The holds on the land. */
  readonly holds: readonly HoldDecision[];
  /** The person's name. */
  nameOf(person: number): string;
  say(text: string, secs?: number): void;
  /** A lead was given: the map is handed over and marked. */
  marked(id: string): void;
  /** Coin changed hands. */
  paid(): void;
}

export const PEOPLE_SERVICES = ['hold', 'gift'] as const;

export class PeoplesTalk {
  constructor(private readonly host: PeoplesHost) {}

  /** What a townsperson offers for their people: where the hold is, a gift (grown-ups of a people with a hold). */
  services(p: Person): Service[] {
    const h = this.host, people = h.setting.peoples.find((x) => x.id === p.race), hold = people?.hold;
    const site = h.holds.find((x) => x.people === p.race);
    if (!hold || !site || p.role === 'child' || p.role === 'traveller' || !h.standing.talks(p.race)) return [];
    const out: Service[] = [];
    if (!h.journal.leads.some((l) => l.id === site.id)) out.push({ id: 'hold', label: hold.topic, line: fill(hold.told, { hold: hold.name }) });
    const price = h.standing.giftPrice(p.race), g = h.setting.standing.gift;
    if (price !== null && p.race !== h.standing.race) out.push({ id: 'gift', label: fill(g.topic, { coins: coinText(price) }), line: g.line });
    return out;
  }

  /** The service picked (its line was said; the talk has closed). */
  serve(id: (typeof PEOPLE_SERVICES)[number], p: Person): void {
    const h = this.host, people = h.setting.peoples.find((x) => x.id === p.race), hold = people?.hold;
    const site = h.holds.find((x) => x.people === p.race);
    if (!people || !hold || !site) return;
    if (id === 'hold') {
      h.journal.remember({ id: site.id, title: hold.lead, notes: [{ text: fill(hold.told, { hold: hold.name }), from: h.nameOf(p.id) }], mark: { x: site.x, z: site.z, label: hold.name }, done: false });
      h.marked(site.id);
      return;
    }
    const price = h.standing.giftPrice(p.race);
    if (price === null) return;
    if (h.character.coins < price) { h.say(`A gift worth giving would cost ${coinText(price)}; your purse is too light.`); return; }
    h.character.coins -= price;
    h.paid();
    const c = h.standing.gift(p.race);
    h.say(`You hand ${h.nameOf(p.id)} ${coinText(price)} for the ${people.plural}.${c ? ` ${changeLine(c)}` : ''}`, 6);
  }
}
