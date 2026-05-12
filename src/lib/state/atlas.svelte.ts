import type { RgbaColor } from "svelte-awesome-color-picker";

class AtlasStore {
  bgColor = $state<RgbaColor>({ r: 0, g: 0, b: 0, a: 0 });

  #padding = $state(0);
  get padding(): number {
    return this.#padding;
  }
  set padding(v: number) {
    this.#padding = !isFinite(v) || v < 0 ? 0 : Math.round(v);
  }

  // Bounds of all tiles (set by Atlas component via $effect).
  minX = $state(0);
  minY = $state(0);
  maxX = $state(0);
  maxY = $state(0);
  hasTiles = $state(false);

  get left(): number {
    return this.hasTiles ? this.minX - this.padding : 0;
  }

  get top(): number {
    return this.hasTiles ? this.minY - this.padding : 0;
  }

  get width(): number {
    return this.hasTiles
      ? Math.ceil(this.maxX - this.minX) + 2 * this.padding
      : 0;
  }

  get height(): number {
    return this.hasTiles
      ? Math.ceil(this.maxY - this.minY) + 2 * this.padding
      : 0;
  }

  get bgColorCSS(): string {
    const { r, g, b, a } = this.bgColor;
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
  }
}

export const atlas = new AtlasStore();
