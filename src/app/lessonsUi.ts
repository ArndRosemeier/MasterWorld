/**
 * Lessons (plan 11.4, 11.5): a teacher's skills, how far the hero has come in each and what the next point
 * costs. Opened from talk with someone who teaches ("Can you teach me to fight?"); a click on a skill takes
 * one lesson, and the hours pass. In warded brass (windows.css): the window is set down like a slate, each
 * skill is a brass rule with a ward line up to the hero's level and a notch where the teacher's knowledge
 * ends; a lesson taken lights the next mark, the number turns over and the line runs up to it.
 */
import type { SettingModule, TrainerDef } from '../setting/contract';
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
}

export class LessonsUi extends BodyWindow {
  private t: TrainerDef | null = null;
  private who = '';
  private said = '';
  /** The skill just taught (its rule lights up). */
  private rose: string | null = null;

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly lessonsHost: LessonsHost) {
    super('Lessons', 'lessons', null, lessonsHost);
  }

  /** Open with this teacher (`who`: their name). */
  teach(t: TrainerDef, who: string): void {
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
    this.fill([
      el('p', { className: 'says', textContent: this.said }),
      el('div', { className: 'rules' }, ...rows),
      el('p', { className: 'hint', textContent: `A lesson is one point of a skill and ${t.hours === 1 ? 'an hour' : `${t.hours} hours`}. The higher the skill, the dearer the lesson; past ${t.upTo} you learn only by doing.` })],
    [el('span', { className: 'purse', textContent: `Your purse: ${coinText(this.hero.coins)}` })]);
  }

  private lessonRow(t: TrainerDef, l: Lesson): HTMLElement {
    const dear = l.price !== null && l.price > this.hero.coins;
    const rule = el('div', { className: 'rule' }, el('i', { className: 'line' }), el('i', { className: 'cap' }));
    rule.style.setProperty('--v', String(Math.min(1, l.level / 100)));
    rule.style.setProperty('--cap', String(t.upTo / 100));
    const r = el('div', { className: `lesson${dear ? ' dear' : ''}${l.price === null ? ' done' : ''}${this.rose === l.skill ? ' rose' : ''}`, title: l.price === null ? `${this.who} has taught you all they know of it` : dear ? 'Not enough coin' : `One lesson: ${coinText(l.price)}` },
      el('div', { className: 'name', textContent: l.name }),
      el('div', { className: 'level' }, el('b', { textContent: String(l.level) })),
      rule,
      el('div', { className: 'price', textContent: l.price === null ? 'taught out' : coinText(l.price) }));
    r.addEventListener('click', () => this.take(t, l));
    return r;
  }

  /** Take one lesson in `skill` (by click, or from the console). */
  take(t: TrainerDef, l: Pick<Lesson, 'skill' | 'name'>): void {
    const no = takeLesson(this.hero, t, l.skill);
    if (no) {
      this.said = no === 'coin' ? `“Come back when your purse is heavier.”` : `“I have taught you all I know of ${l.name.toLowerCase()}. The rest the road will teach you.”`;
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
