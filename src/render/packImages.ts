/**
 * Actors loads its textures with three's TextureLoader, which hands the URL to an <img> and so bypasses `fetch`:
 * those files would skip the pack bundles and the browser's cache (workers/packStore.ts) and download again. For
 * pack URLs the image loader here fetches the file (through the store) and gives the <img> its bytes instead.
 */
import { ImageLoader } from 'three/webgpu';
import { isPackUrl } from '../workers/packFetch';

let routed = false;

export function routePackImages(base: string = import.meta.env.BASE_URL): void {
  if (routed) return;
  routed = true;
  const load = ImageLoader.prototype.load;
  ImageLoader.prototype.load = function (this: ImageLoader, url, onLoad, onProgress, onError) {
    const full = this.manager.resolveURL((this.path ?? '') + url);
    if (!isPackUrl(full, base)) return load.call(this, url, onLoad, onProgress, onError);
    const path = this.path;
    void fetch(full)
      .then((r) => { if (!r.ok) throw new Error(`Failed to load ${full}: ${r.status}`); return r.blob(); })
      .then((blob) => {
        const local = URL.createObjectURL(blob);
        this.path = '';
        load.call(this, local, (img) => { URL.revokeObjectURL(local); onLoad?.(img); }, onProgress, (e) => { URL.revokeObjectURL(local); onError?.(e); });
        this.path = path;
      })
      .catch((e: unknown) => onError?.(e));
    return undefined as unknown as HTMLImageElement;
  };
}
