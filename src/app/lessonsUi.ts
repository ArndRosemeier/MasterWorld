/**
 * Lessons (plan 11.4, 11.5): a teacher's skills, how far the hero has come in each and what the next point
 * costs. Opened from talk with someone who teaches ("Can you teach me to fight?"); a click on a skill takes
 * one lesson, and the hours pass. In warded brass (windows.css): the window is set down like a slate, each
 * skill is a brass rule with a ward line up to the hero's level and a notch where the teacher's knowledge
 * ends; a lesson taken lights the next mark, the number turns over and the line runs up to it.
 * At a guild house (D49) the trainer also opens a skill never learned and its next ranks: such a row shows
 * the rank's price and opens it on a click; the guild's task is asked for at the foot.
 */
import type { GuildDef, SettingModule, TrainerDef } from '../setting/contract';
import { isGuild, nextRank, openRank, rankRefusal, type GuildBook, type RankRefusal } from '../game/guilds';
import type { DecisionLog } from '../world/decisions';
import type { Character } from '../game/character';
import { coinText } from '../game/items';
import { lessonsFor, takeLesson, type Lesson } from '../game/lessons';
import { fill } from '../talk/folk';
import { el } from './dom';
import { BodyWindow, type WindowHost } from './window';

export interface LessonsHost extends WindowHost {
  /** A lesson was taken: its hours pass and a sound plays. */
  taught(hours: number): void;
  /** Health and the like grew with a skill: anything to redraw. */
  changed(): void;
  /** The hero's dealings with the guilds, and the decision log (a guild's task is done by a promise kept). */
  readonly book: GuildBook;
  log(): DecisionLog;
  hours(): number;
}

export class LessonsUi extends BodyWindow {
  private t: TrainerDef | null = null;
  private who = '';
  private said = '';
  /** The skill just taught (its rule lights up). */
  private rose: string | null = null;
  /** The teacher's guild, at a guild house (D49). */
  private guild: GuildDef | null = null;

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly lessonsHost: LessonsHost) {
    super('Lessons', 'lessons', null, lessonsHost);
  }

  /** Open with this teacher (`who`: their name). */
  teach(t: TrainerDef, who: string): void {
    this.guild = isGuild(t) ? t : null;
    this.t = t;
    this.who = who;
    this.said = `“${t.line}”`;
    this.rose = null;
    const h2 = this.body.parentElement?.querySelector('.head h2');
    if (h2) h2.textContent = fill(t.title, { name: who });
    this.setOpen(true);
  }

  protected opened(): void {
    const t = this.t;
    if (!t) return;
    const rows = lessonsFor(this.setting, t, this.hero).map((l) => this.lessonRow(t, l));
    const g = this.guild, h = this.lessonsHost;
    const hint = g
      ? `${g.name}: a skill opened here grows by use up to its rank. A lesson is one point and ${t.hours === 1 ? 'an hour' : `${t.hours} hours`}; the last points of each rank only use teaches, and then the next rank can be opened.`
      : `A lesson is one point of a skill and ${t.hours === 1 ? 'an hour' : `${t.hours} hours`}. The higher the skill, the dearer the lesson; past ${t.upTo} you learn only by doing.`;
    const foot: Node[] = [el('span', { className: 'purse', textContent: `Your purse: ${coinText(this.hero.coins)}` })];
    if (g && !h.book.asked(g.keeper)) {
      const ask = el('button', { textContent: 'Is there work for the guild?' });
      ask.addEventListener('click', () => { h.book.assign(g.keeper, h.hours()); this.said = `“${g.task.ask}”`; this.opened(); });
      foot.push(ask);
    }
    if (g) foot.push(el('span', { className: 'standing', textContent: `Standing: ${h.book.standing(g, this.hero, h.log())}${h.book.asked(g.keeper) ? (h.book.taskDone(g, h.log()) ? ' · task done' : ' · task open') : ''}` }));
    this.fill([
      el('p', { className: 'says', textContent: this.said }),
      el('div', { className: 'rules' }, ...rows),
      el('p', { className: 'hint', textContent: hint })], foot);
  }

  private lessonRow(t: TrainerDef, l: Lesson): HTMLElement {
    // Nothing more to learn here now, but a rank to open (D49): the row opens it.
    const g = this.guild, rank = g && l.price === null ? nextRank(this.setting, this.hero, l.skill) : null;
    if (g && rank) return this.rankRow(g, l, rank.rank, rank.def.price);
    const dear = l.price !== null && l.price > this.hero.coins;
    const rule = el('div', { className: 'rule' }, el('i', { className: 'line' }), el('i', { className: 'cap' }));
    rule.style.setProperty('--v', String(Math.min(1, l.level / 100)));
    rule.style.setProperty('--cap', String(l.top / 100));
    const r = el('div', { className: `lesson${dear ? ' dear' : ''}${l.price === null ? ' done' : ''}${this.rose === l.skill ? ' rose' : ''}`, title: l.price === null ? `${this.who} has taught you all they know of it` : dear ? 'Not enough coin' : `One lesson: ${coinText(l.price)}` },
      el('div', { className: 'name', textContent: l.name }),
      el('div', { className: 'level' }, el('b', { textContent: String(l.level) })),
      rule,
      el('div', { className: 'price', textContent: l.price === null ? 'taught out' : coinText(l.price) }));
    r.addEventListener('click', () => this.take(t, l));
    return r;
  }

  /** A skill not opened, or at the top of its rank: what opening the next rank costs and needs. */
  private rankRow(g: GuildDef, l: Lesson, rank: number, price: number): HTMLElement {
    const h = this.lessonsHost, no = rankRefusal(this.setting, g, this.hero, l.skill, h.book, h.log());
    const what = rank === 0 ? 'open' : `rank ${rank}`;
    const label = no === 'unearned' ? 'use it more' : no === 'task' ? 'the task first' : no === 'standing' ? 'more standing' : `${what}: ${coinText(price)}`;
    const rule = el('div', { className: 'rule' }, el('i', { className: 'line' }), el('i', { className: 'cap' }));
    rule.style.setProperty('--v', String(Math.min(1, l.level / 100)));
    rule.style.setProperty('--cap', String(this.hero.capOf(l.skill) / 100));
    const r = el('div', { className: `lesson opens${no ? ' dear' : ''}${this.rose === l.skill ? ' rose' : ''}`, title: rank === 0 ? `Open ${l.name.toLowerCase()} here` : `Open rank ${rank} of ${l.name.toLowerCase()}` },
      el('div', { className: 'name', textContent: l.name }),
      el('div', { className: 'level' }, el('b', { textContent: String(l.level) })),
      rule,
      el('div', { className: 'price', textContent: label }));
    r.addEventListener('click', () => this.open(g, l));
    return r;
  }

  /** Open a skill or its next rank at this guild house (by click, or from the console). */
  open(g: GuildDef, l: Pick<Lesson, 'skill' | 'name'>): RankRefusal {
    const h = this.lessonsHost, no = openRank(this.setting, g, this.hero, l.skill, h.book, h.log());
    const skill = l.name.toLowerCase();
    this.said = no === null ? `“${fill(g.opens, { skill })}”`
      : no === 'unearned' ? `“${fill(g.unearned, { skill })}”`
      : no === 'task' ? `“${h.book.asked(g.keeper) ? 'Your task first. You know what I asked.' : g.task.ask}”`
      : no === 'standing' ? '“The Hall does not know you well enough yet.”'
      : no === 'coin' ? '“Come back when your purse is heavier.”'
      : no === 'top' ? '“There is nothing higher I can open for you.”' : `“I do not teach ${skill}.”`;
    if (no === 'task') h.book.assign(g.keeper, h.hours());
    this.rose = no === null ? l.skill : null;
    if (no === null) h.changed();
    this.opened();
    return no;
  }

  /** Take one lesson in `skill` (by click, or from the console). */
  take(t: TrainerDef, l: Pick<Lesson, 'skill' | 'name'>): void {
    const no = takeLesson(this.hero, t, l.skill);
    if (no) {
      this.said = no === 'coin' ? `“Come back when your purse is heavier.”` : no === 'closed' ? `“You never learned ${l.name.toLowerCase()}. That is for a guild house to open.”` : `“I have taught you all I know of ${l.name.toLowerCase()}. The rest the road will teach you.”`;
      this.rose = null;
    } else {
      this.said = `You spend ${t.hours === 1 ? 'an hour' : `${t.hours} hours`} with ${this.who} on ${l.name.toLowerCase()}. It aches, and it sticks.`;
      this.rose = l.skill;
      this.lessonsHost.taught(t.hours);
      this.lessonsHost.changed();
    }
    this.opened();
  }
}
