/**
 * Teaching (plan 11.4, D49, D59): what a guild house's trainer teaches, each ability with the level it asks and
 * its price. Opened from talk with the trainer ("Can you teach me to fight?"); a click on an ability learns it,
 * and the hours pass. In warded brass (windows.css): the window is set down like a slate, each ability a brass
 * rule whose ward line runs up as the hero's level nears the ability's; one just learned lights up and its
 * number turns over. The guild's task is asked for at the foot (its dearer abilities wait for it), and once it
 * is done the trainer thanks the hero for it. A master with a deed of their own (C14) speaks of it once the hero
 * is their student and of the level it asks.
 */
import type { AbilityDef, GuildDef, SettingModule } from '../setting/contract';
import { taskOf } from '../vgm/quests';
import { abilityPrice, questDue, teach, teachRefusal, teachingsOf, type GuildBook, type TeachRefusal } from '../game/guilds';
import type { Standing } from '../game/standing';
import type { DecisionLog } from '../world/decisions';
import type { Character } from '../game/character';
import { coinText } from '../game/items';
import { fill } from '../talk/folk';
import { el } from './dom';
import { BodyWindow, type WindowHost } from './window';

export interface LessonsHost extends WindowHost {
  /** An ability was taught: its hours pass and a sound plays. */
  taught(hours: number): void;
  /** Something was learned: the action bar and the like to redraw. */
  changed(): void;
  /** The hero's dealings with the guilds, and the decision log (a guild's task is done by a promise kept). */
  readonly book: GuildBook;
  log(): DecisionLog;
  hours(): number;
  /** The hero's standing with the peoples (a guild's task done is a good deed with the trainer's). */
  readonly standing: Standing;
  /** A master speaks of their one deed (C14): the VGM makes its place; what it is called, or null if none fits. */
  quest(g: GuildDef): string | null;
  /** The guild's task given (D49): the VGM names its place, the journal and map take it up; what it is called, or null if none fits. */
  task(g: GuildDef, who: string): string | null;
}

export class LessonsUi extends BodyWindow {
  private said = '';
  /** The ability just learned (its rule lights up). */
  private rose: string | null = null;
  /** The trainer's guild. */
  private guild: GuildDef | null = null;
  /** The trainer's name. */
  private who = '';

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly lessonsHost: LessonsHost) {
    super('Lessons', 'lessons', null, lessonsHost);
  }

  /** Open with this trainer (`who`: their name, `people`: their people). */
  teach(g: GuildDef, who: string, people: string): void {
    this.guild = g;
    this.who = who;
    this.said = `“${g.line}”`;
    // The guild's task done: thanked for once, a good deed (D54) and experience (D58); the trainer's people think better of the hero.
    const h = this.lessonsHost, said: string[] = [];
    if (h.book.thank(g, h.log())) {
      h.standing.deed(`task:${g.keeper}`, people, this.setting.standing.task);
      this.hero.earn(`task:${g.keeper}`, 'task');
      said.push(`“${g.task.done}”`);
    }
    // A task given in a save from before tasks named a place, and not done: it names one now.
    if (h.book.asked(g.keeper) && !h.book.taskDone(g, h.log()) && !taskOf(h.log(), g.keeper)) h.task(g, who);
    if (g.quest && questDue(g, this.hero, h.log())) {
      // A student of the level it asks: the master speaks of the deed for what no trainer sells (C14), on the
      // same visit as the thanks if both come at once.
      const place = h.quest(g);
      if (place) said.push(`“${fill(g.quest.ask, { place })}”`);
    }
    if (said.length) this.said = said.join(' ');
    this.rose = null;
    const h2 = this.body.parentElement?.querySelector('.head h2');
    if (h2) h2.textContent = fill(g.title, { name: who });
    this.setOpen(true);
  }

  protected opened(): void {
    const g = this.guild;
    if (!g) return;
    const h = this.lessonsHost;
    const rows = teachingsOf(this.setting, g).map((a) => this.abilityRow(g, a));
    const hint = `${g.name}: each ability is taught once your level is up to it, costs an ability point and takes ${g.hours === 1 ? 'an hour' : `${g.hours} hours`}. Abilities of level ${g.task.from} and above wait for the guild's task. Every level brings a point; a potion of learning gives one more.`;
    const pts = this.hero.points;
    const foot: Node[] = [el('span', { className: 'purse', textContent: `Your purse: ${coinText(this.hero.coins)}` }),
      el('span', { className: `points${pts ? '' : ' none'}`, textContent: `Ability points: ${pts}` })];
    if (!h.book.asked(g.keeper)) {
      const ask = el('button', { textContent: 'Is there work for the guild?' });
      ask.addEventListener('click', () => { this.said = this.give(g); this.opened(); });
      foot.push(ask);
    }
    foot.push(el('span', { className: 'standing', textContent: `Your level: ${this.hero.level}${h.book.asked(g.keeper) ? (h.book.taskDone(g, h.log()) ? ' · task done' : ' · task open') : ''}` }));
    this.fill([
      el('p', { className: 'says', textContent: this.said }),
      el('div', { className: 'rules' }, ...rows),
      el('p', { className: 'hint', textContent: hint })], foot);
  }

  /** An ability the trainer teaches: known, its level not yet reached, the task first, or its price. */
  private abilityRow(g: GuildDef, a: AbilityDef): HTMLElement {
    const h = this.lessonsHost, no = teachRefusal(g, this.hero, a, h.book, h.log()), need = a.level ?? 1;
    const label = no === 'known' ? 'known' : no === 'level' ? `at level ${need}` : no === 'task' ? 'the task first' : no === 'point' ? 'no point free' : coinText(abilityPrice(g, a));
    const rule = el('div', { className: 'rule' }, el('i', { className: 'line' }), el('i', { className: 'cap' }));
    rule.style.setProperty('--v', String(Math.min(1, this.hero.level / need)));
    rule.style.setProperty('--cap', '1');
    const r = el('div', { className: `lesson${no === 'known' ? ' done' : no ? ' dear' : ''}${this.rose === a.id ? ' rose' : ''}`, title: a.text },
      el('div', { className: 'name', textContent: `${a.icon ? `${a.icon} ` : ''}${a.name}` }),
      el('div', { className: 'level' }, el('b', { textContent: String(need) })),
      rule,
      el('div', { className: 'price', textContent: label }));
    r.addEventListener('click', () => this.learn(g, a));
    return r;
  }

  /** The guild's task given: its place named (the journal takes it up); what the trainer says. */
  private give(g: GuildDef): string {
    const h = this.lessonsHost;
    h.book.assign(g.keeper, h.hours());
    return `“${fill(g.task.ask, { place: h.task(g, this.who) ?? g.task.anywhere })}”`;
  }

  /** Learn an ability here (by click, or from the console). */
  learn(g: GuildDef, a: AbilityDef): TeachRefusal {
    const h = this.lessonsHost, no = teach(g, this.hero, a, h.book, h.log());
    this.said = no === null ? `“${fill(g.teachesLine, { ability: a.name })}”`
      : no === 'task' ? (h.book.asked(g.keeper) ? '“Your task first. You know what I asked.”' : this.give(g))
      : no === 'level' ? `“${fill(g.distrust, { ability: a.name.toLowerCase() })}”`
      : no === 'point' ? `“${this.setting.growth.points.none}”`
      : no === 'coin' ? '“Come back when your purse is heavier.”'
      : no === 'known' ? '“You know that one already.”' : '“That is not mine to teach.”';
    this.rose = no === null ? a.id : null;
    if (no === null) { h.taught(g.hours); h.changed(); }
    this.opened();
    return no;
  }
}
