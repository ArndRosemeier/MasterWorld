/** The loading screen drawn by index.html: step text while booting, then fades out. */
export class LoadingScreen {
  private readonly root = document.getElementById('loading');
  private readonly step = this.root?.querySelector('.step') ?? null;

  set(text: string): void {
    if (this.step) this.step.textContent = text;
  }

  done(): void {
    this.root?.classList.add('done');
  }

  fail(title: string, detail: string): void {
    if (this.step) this.step.textContent = `${title}: ${detail}`;
  }
}
