/**
 * The trade window (plan 11.5, 17.1): opened from talk with a merchant ("Show me your iron."). Their wares
 * on the left, the hero's pack on the right, each thing as its rarity card with a brass price tag; a
 * click buys or sells. Between them a brass balance, the window's signature (D45): the beam tips towards
 * whoever just paid and coins drop into that pan, then it swings back to rest. A ware the hero can afford
 * that makes them stronger is marked "for you". In the setting's coin: copper, silver and gold.
 */
import type { SettingModule } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, type Item } from '../game/items';
import type { Market, Merchant, Refusal } from '../game/trade';
import { el } from './dom';
import { itemCard } from './itemCard';
import { replay } from './ward';
import { KeyWindow, type WindowHost } from './window';

export interface TradeHost extends WindowHost {
  /** The game's day now (merchants restock with the days). */
  readonly day: number;
  /** What is worn changed (nothing yet: bought things go into the pack), or coins moved: a sound. */
  traded(): void;
  /** A trade did not happen: say why. */
  say(text: string): void;
}

/** A price as coin pips: gold, silver, copper. */
function coins(copper: number): HTMLElement {
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  const pips = ([[g, 'g'], [s, 's'], [c, 'c']] as const).filter(([n, k]) => n || (k === 'c' && !g && !s));
  return el('span', { className: 'coins', title: coinText(copper) }, ...pips.map(([n, k]) => el('span', { className: `coin ${k}` }, String(n))));
}

export class TradeUi extends KeyWindow {
  private readonly body: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  private readonly scales: HTMLDivElement;
  private readonly line: HTMLParagraphElement;
  private with: Merchant | null = null;
  private who = '';
  /** The thing that just changed hands: it arrives on its new side. */
  private moved: Item | null = null;

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly market: Market, private readonly tradeHost: TradeHost) {
    const body = el('div', { className: 'body' }), foot = el('div', { className: 'foot' });
    super('Trade', 'trade', null, tradeHost, body, foot);
    this.body = body;
    this.foot = foot;
    this.line = el('p', { className: 'says' });
    const pan = (side: string) => el('div', { className: `pan ${side}` }, el('i', { className: 'cord l' }), el('i', { className: 'cord r' }), el('div', { className: 'dish' }));
    this.scales = el('div', { className: 'scales', ariaHidden: 'true' },
      el('div', { className: 'post' }), el('div', { className: 'beam' }, pan('theirs'), pan('yours')), el('div', { className: 'knob' }));
  }

  /** Open the window with this merchant (`who`: their name). */
  show(m: Merchant, who: string): void {
    this.with = m;
    this.who = who;
    this.moved = null;
    this.market.restock(this.tradeHost.day);
    this.line.textContent = `“${m.shop.line}”`;
    const h2 = this.body.parentElement?.querySelector('.head h2');
    if (h2) h2.textContent = m.shop.name;
    this.setOpen(true);
  }

  /** Buy one of the merchant's wares (by index; for `?trade` checks and the console). */
  buyAt(i: number): Refusal { const m = this.with, it = m?.stock[i]; return m && it ? this.deal(() => this.market.buy(this.hero, m, it), it, 'yours') : 'gone'; }

  protected opened(): void {
    const m = this.with;
    if (!m) return;
    const h = this.hero, speech = h.skill('speech');
    const enter = this.entrances(0.45, 0.04);
    const up = this.market.upgradeFor(h, m)?.item;
    const wares = m.stock.map((it) => {
      const price = this.market.asks(m, it, speech), dear = price > h.coins;
      const card = itemCard(it, this.setting, enter());
      const tag = el('div', { className: `tag${dear ? ' dear' : ''}` }, coins(price));
      const cell = el('div', { className: `ware${it === up ? ' for-you' : ''}${it === this.moved ? ' arrived' : ''}`, title: dear ? 'More than you have' : `Buy it for ${coinText(price)}` }, card, tag);
      if (it === up) cell.append(el('div', { className: 'mark', textContent: 'for you' }));
      cell.addEventListener('click', () => this.deal(() => this.market.buy(h, m, it), it, 'yours'));
      return cell;
    });
    const pack = h.pack.map((it) => {
      const offer = this.market.pays(m, it, speech);
      const card = itemCard(it, this.setting, enter());
      const tag = el('div', { className: `tag${!offer ? ' none' : offer > m.coins ? ' dear' : ''}` }, offer ? coins(offer) : 'not their trade');
      const cell = el('div', { className: `ware${!offer ? ' dim' : ''}${it === this.moved ? ' arrived' : ''}`, title: offer ? `Sell it for ${coinText(offer)}` : `${this.who} does not deal in that` }, card, tag);
      cell.addEventListener('click', () => this.deal(() => this.market.sell(h, m, it), it, 'theirs'));
      return cell;
    });
    this.body.replaceChildren(
      el('div', { className: 'counter' }, this.scales, this.line),
      el('div', { className: 'sides' },
        el('section', {}, el('h3', { textContent: `${this.who}’s wares` }), wares.length ? el('div', { className: 'wares' }, ...wares) : el('p', { className: 'hint', textContent: 'The shelves are bare. Come back another day.' })),
        el('section', {}, el('h3', { textContent: 'Your pack' }), pack.length ? el('div', { className: 'wares' }, ...pack) : el('p', { className: 'hint', textContent: 'Nothing to sell but lint.' }))),
      el('p', { className: 'hint', textContent: 'Click a ware to buy it, or something of yours to sell it. What you wear stays on you: take it off in the pack (I) to sell it.' }));
    this.foot.replaceChildren(
      el('span', { className: 'purse' }, 'Your purse ', coins(h.coins)),
      el('span', { className: 'purse' }, `${this.who}’s purse `, coins(m.coins)));
  }

  /** A trade: on success the balance tips towards the pan that was paid into and the thing arrives on its side. */
  private deal(act: () => Refusal, it: Item, paid: 'theirs' | 'yours'): Refusal {
    const no = act();
    if (no) {
      replay(this.scales, 'balk');
      this.tradeHost.say(no === 'coin' ? 'You cannot afford that.' : no === 'their-coin' ? `${this.who} has not the coin for that today.` : no === 'not-bought' ? `${this.who} does not deal in that.` : no === 'worn' ? 'Take it off first.' : 'That is gone.');
      return no;
    }
    this.moved = it;
    // The coins go to whoever sold: buying, into their pan; selling, into yours.
    this.scales.dataset.tip = paid === 'yours' ? 'theirs' : 'yours';
    replay(this.scales, 'tipped');
    this.tradeHost.traded();
    this.opened();
    return null;
  }
}
