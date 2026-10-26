/**
 * The end of a roguelike hero's tale (plan 11.1, D12, 17.1): once the wards have gone dark the screen fades
 * to ash and a brass plaque settles over it. Its signature: the epitaph is engraved letter by letter while the
 * ward round the plaque burns down from both ends like a wick, and an ember drifts up from it. One button: a
 * new hero, in the same world (the save is already written when this shows).
 */
import { button, el } from './dom';
import './windows.css';

export class TalesEnd {
  private readonly root = el('div', { className: 'tales-end', role: 'dialog', ariaLabel: 'The tale ends' });

  /** Shows the plaque; `next` is called once the player asks for a new hero. */
  show(name: string, epitaph: string, next: () => void): void {
    const words = el('p', { className: 'te-epitaph' });
    // Engraved letter by letter.
    [...epitaph].forEach((ch, i) => {
      const c = words.appendChild(el('span', { textContent: ch }));
      c.style.animationDelay = `${(1.6 + i * 0.035).toFixed(3)}s`;
    });
    const go = button('A new hero', next, { className: 't-btn primary', type: 'button' });
    go.style.animationDelay = `${(2 + epitaph.length * 0.035).toFixed(2)}s`;
    this.root.replaceChildren(el('div', { className: 'te-plaque' },
      el('div', { className: 'te-wick l' }), el('div', { className: 'te-wick r' }), el('div', { className: 'te-ember' }),
      el('div', { className: 'label', textContent: 'The tale ends' }),
      el('h2', { textContent: name }),
      words,
      el('p', { className: 'te-world', textContent: 'The world goes on. What you carried lies where you fell, and the next hero may hear of it.' }),
      go));
    document.body.append(this.root);
    requestAnimationFrame(() => this.root.classList.add('open'));
  }
}
