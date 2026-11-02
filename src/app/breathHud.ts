/**
 * The hero's breath under water (S5): a row of warded-brass bubbles over the action bar, shown while the head is under
 * or the breath is still coming back; they burst one by one as it runs out. With water breathing, one steady bubble
 * ring instead, so the hero knows they are safe down there.
 */
import { overlay } from './dom';

const BUBBLES = 8;

export class BreathHud {
  private readonly el = overlay('breath-hud', 'position:fixed;left:50%;bottom:118px;transform:translateX(-50%);display:none;gap:6px;z-index:5;pointer-events:none');
  private readonly dots: HTMLElement[] = [];
  private shown = '';

  constructor() {
    for (let i = 0; i < BUBBLES; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'width:14px;height:14px;border-radius:50%;border:1.5px solid #c9a25a;box-shadow:inset -3px -3px 0 0 #e2bd6855,0 0 5px #e2bd6844;transition:opacity .25s,transform .25s';
      this.dots.push(d);
    }
    this.el.replaceChildren(...this.dots);
  }

  /** Each frame: how full the breath is (0..1), whether the head is under, whether the hero breathes water. */
  showBreath(share: number, under: boolean, gills: boolean): void {
    const n = gills ? -1 : Math.ceil(share * BUBBLES - 1e-6);
    const key = under || share < 1 ? `${n}` : '';
    if (key === this.shown) return;
    this.shown = key;
    this.el.style.display = key ? 'flex' : 'none';
    this.dots.forEach((d, i) => {
      const on = n < 0 ? i === 0 : i < n;
      d.style.opacity = on ? '1' : '0';
      d.style.transform = on ? 'scale(1)' : 'scale(1.6)';
      d.style.borderColor = n < 0 ? '#9fe0ff' : '#c9a25a';
    });
  }
}
