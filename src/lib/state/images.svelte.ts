import { history } from "./history.svelte";

export const FRAME_COLORS: string[] = [
  "#e3de88",
  "#76bd5e",
  "#b35f47",
  "#5c9974",
  "#d9a871",
  "#7c6eae",
  "#4f6459",
];

export type ImageView = {
  x: number;
  y: number;
  scale: number;
  fitted: boolean;
};

export type ImageItem = {
  id: string;
  name: string;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
  view: ImageView;
  frames: Rectangle[];
};

function loadDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = url;
  });
}

class ImageStore {
  items = $state<ImageItem[]>([]);
  activeId = $state<string | null>(null);
  frames = $state<Rectangle[]>([]);
  selectedFrameId = $state<string | null>(null);

  get active(): ImageItem | null {
    return this.items.find((i) => i.id === this.activeId) ?? null;
  }

  get nextFrameColor(): string {
    return FRAME_COLORS[this.frames.length % FRAME_COLORS.length];
  }

  async addFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    const { width, height } = await loadDimensions(url);
    const id = crypto.randomUUID();
    const item: ImageItem = {
      id,
      name: file.name,
      url,
      naturalWidth: width,
      naturalHeight: height,
      view: { x: 0, y: 0, scale: 1, fitted: false },
      frames: [],
    };
    const prevActiveId = this.activeId;

    this.items.push(item);
    this.activeId = id;

    history.push({
      label: "Add image",
      apply: () => {
        if (!this.items.some((i) => i.id === id)) this.items.push(item);
        this.activeId = id;
      },
      revert: () => {
        const idx = this.items.findIndex((i) => i.id === id);
        if (idx >= 0) this.items.splice(idx, 1);
        this.activeId = prevActiveId;
      },
    });
  }

  setActive(id: string): void {
    this.activeId = id;
  }

  remove(id: string): void {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const item = this.items[idx];
    const prevActiveId = this.activeId;
    const removedFrames = this.frames.filter((f) => f.imageId === id);
    const removedFrameIndices = removedFrames.map((f) =>
      this.frames.indexOf(f),
    );

    this.items.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.items[idx] ?? this.items[idx - 1];
      this.activeId = next?.id ?? null;
    }
    this.frames = this.frames.filter((f) => f.imageId !== id);
    if (
      this.selectedFrameId &&
      removedFrames.some((f) => f.id === this.selectedFrameId)
    ) {
      this.selectedFrameId = null;
    }

    history.push({
      label: "Remove image",
      apply: () => {
        const j = this.items.findIndex((i) => i.id === id);
        if (j >= 0) this.items.splice(j, 1);
        if (this.activeId === id) {
          const next = this.items[j] ?? this.items[j - 1];
          this.activeId = next?.id ?? null;
        }
        this.frames = this.frames.filter((f) => f.imageId !== id);
      },
      revert: () => {
        if (!this.items.some((i) => i.id === id)) {
          this.items.splice(Math.min(idx, this.items.length), 0, item);
        }
        this.activeId = prevActiveId;
        const sorted = removedFrameIndices
          .map((i, k) => ({ idx: i, frame: removedFrames[k] }))
          .sort((a, b) => a.idx - b.idx);
        for (const { idx: fi, frame } of sorted) {
          if (!this.frames.some((f) => f.id === frame.id)) {
            this.frames.splice(Math.min(fi, this.frames.length), 0, frame);
          }
        }
      },
    });
  }

  reorder(fromId: string, toId: string): void {
    if (fromId === toId) return;
    const fromIdx = this.items.findIndex((i) => i.id === fromId);
    const toIdx = this.items.findIndex((i) => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = this.items.splice(fromIdx, 1);
    this.items.splice(toIdx, 0, item);
  }

  addFrame(rect: Rectangle): void {
    const img = this.items.find((i) => i.id === rect.imageId);
    img?.frames.push(rect);
    this.frames.push(rect);

    history.push({
      label: "Add frame",
      apply: () => {
        const i = this.items.find((it) => it.id === rect.imageId);
        if (i && !i.frames.some((f) => f.id === rect.id)) i.frames.push(rect);
        if (!this.frames.some((f) => f.id === rect.id)) this.frames.push(rect);
      },
      revert: () => {
        const i = this.items.find((it) => it.id === rect.imageId);
        if (i) {
          const k = i.frames.findIndex((f) => f.id === rect.id);
          if (k >= 0) i.frames.splice(k, 1);
        }
        const k2 = this.frames.findIndex((f) => f.id === rect.id);
        if (k2 >= 0) this.frames.splice(k2, 1);
        if (this.selectedFrameId === rect.id) this.selectedFrameId = null;
      },
    });
  }

  removeFrame(frameId: string): void {
    const frame = this.frames.find((f) => f.id === frameId);
    if (!frame) return;
    const flatIdx = this.frames.indexOf(frame);
    const img = this.items.find((i) => i.id === frame.imageId);
    const imgIdx = img ? img.frames.findIndex((f) => f.id === frameId) : -1;
    const wasSelected = this.selectedFrameId === frameId;

    if (flatIdx >= 0) this.frames.splice(flatIdx, 1);
    if (img && imgIdx >= 0) img.frames.splice(imgIdx, 1);
    if (wasSelected) this.selectedFrameId = null;

    history.push({
      label: "Remove frame",
      apply: () => {
        const j = this.frames.findIndex((f) => f.id === frameId);
        if (j >= 0) this.frames.splice(j, 1);
        if (img) {
          const k = img.frames.findIndex((f) => f.id === frameId);
          if (k >= 0) img.frames.splice(k, 1);
        }
        if (this.selectedFrameId === frameId) this.selectedFrameId = null;
      },
      revert: () => {
        if (!this.frames.some((f) => f.id === frameId)) {
          this.frames.splice(Math.min(flatIdx, this.frames.length), 0, frame);
        }
        if (img && !img.frames.some((f) => f.id === frameId)) {
          img.frames.splice(Math.min(imgIdx, img.frames.length), 0, frame);
        }
      },
    });
  }
}

export const images = new ImageStore();
