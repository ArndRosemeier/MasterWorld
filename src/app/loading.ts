/** The loading screen drawn by index.html: step text while booting, then fades out. */
export class LoadingScreen {
  private readonly root = document.getElementById('loading');
  private readonly step = this.root?.querySelector('.step') ?? null;

  private readonly t0 = performance.now();

  /** Shows the step (and logs when it began, for timing a load). */
  set(text: string): void {
    if (this.step) this.step.textContent = text;
    console.info(`[load] ${((performance.now() - this.t0) / 1000).toFixed(1)} s: ${text}`);
  }

  done(): void {
    this.root?.classList.add('done');
  }

  fail(title: string, detail: string): void {
    if (this.step) this.step.textContent = `${title}: ${detail}`;
  }
}
