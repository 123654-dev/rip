<script lang="ts">
  import { images } from "$lib/state/images.svelte";
  import { history } from "$lib/state/history.svelte";
  import { image } from "@tauri-apps/api";
  import TabStrip from "./TabStrip.svelte";
  // @ts-ignore
  import { Canvas, Layer } from "svelte-canvas";

  let viewport: HTMLDivElement;
  let dragOver = $state(false);
  let droppedAt = 0;
  let panning = $state(false);
  let editing = $state(false);
  let cursor_pos = $state({ x: 0, y: 0 });
  let draggingCorner = $state<{
    frameId: string;
    cornerIndex: number;
    before: vec2;
  } | null>(null);
  let hiddenFrameIds = $state<Set<string>>(new Set());

  function hexToRgba(hex: string, alpha: number): string {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  /*
   * When not editing, currentRectangle is undefined. It is only set when the user has initiated editing with a first click.
   */
  let currentRect: Rectangle | undefined = $state(undefined);

  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

  let viewportSize = $state({ w: 0, h: 0 });

  function clientToImage(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const item = images.active;
    if (!item || !viewport) return null;
    const rect = viewport.getBoundingClientRect();
    const ix = (clientX - rect.left - item.view.x) / item.view.scale;
    const iy = (clientY - rect.top - item.view.y) / item.view.scale;
    return {
      x: Math.max(0, Math.min(item.naturalWidth, ix)),
      y: Math.max(0, Math.min(item.naturalHeight, iy)),
    };
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    droppedAt = performance.now();
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    for (const f of files) await images.addFile(f);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function onDragLeave(e: DragEvent) {
    if (!viewport.contains(e.relatedTarget as Node)) {
      dragOver = false;
    }
  }

  function handleWheel(e: WheelEvent) {
    const item = images.active;
    if (!item) return;
    e.preventDefault();

    if (e.ctrlKey) {
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newScale = Math.min(40, Math.max(0.05, item.view.scale * factor));
      const k = newScale / item.view.scale;
      item.view.x = cx - (cx - item.view.x) * k;
      item.view.y = cy - (cy - item.view.y) * k;
      item.view.scale = newScale;
    } else {
      item.view.x -= e.deltaX;
      item.view.y -= e.deltaY;
    }
  }

  function completeDraw(rect: Rectangle) {
    const total = images.items.reduce((s, i) => s + i.frames.length, 0);
    rect.renderPosition = { x: total * 24, y: total * 24 };
    images.addFrame(rect);
  }

  function onPointerDown(e: PointerEvent) {
    // Suppress events that arrive during or immediately after a file drop —
    // WebKit occasionally synthesizes a pointerdown at the release position,
    // which would otherwise start a fragment draw on the freshly added image.
    if (dragOver || performance.now() - droppedAt < 400) return;

    // middle mouse button to pan.
    if (e.button === 1) {
      const item = images.active;
      if (!item) return;
      if ((e.target as HTMLElement).closest(".tab, .close")) return;

      panning = true;
      panStart = {
        x: e.clientX,
        y: e.clientY,
        vx: item.view.x,
        vy: item.view.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    //Left click to initiate ripping.
    else if (e.button === 0) {
      const v = clientToImage(e.clientX, e.clientY);
      if (
        images.active?.frames.some((f) =>
          f.corners.some(
            (c) =>
              Math.hypot(c.x - v!.x, c.y - v!.y) <
              8 / images.active!.view.scale,
          ),
        )
      ) {
        // User clicked near an existing corner -> start dragging it.
        for (const f of images.active.frames) {
          const ci = f.corners.findIndex(
            (c) =>
              Math.hypot(c.x - v!.x, c.y - v!.y) <
              8 / images.active!.view.scale,
          );
          if (ci >= 0) {
            draggingCorner = {
              frameId: f.id,
              cornerIndex: ci,
              before: { x: f.corners[ci].x, y: f.corners[ci].y },
            };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
        }
      }
      if (!editing) {
        //implicitly initialize editing mode and create new currentRect object with first corner
        console.log("Started editing");
        editing = true;
        cursor_pos = v ?? { x: 0, y: 0 };

        currentRect = {
          imageId: images.active?.id ?? "unknown",
          id: crypto.randomUUID(),
          renderPosition: { x: 0, y: 0 },
          renderScaleX: 1,
          renderScaleY: 1,
          renderRotation: 0,
          color: images.nextFrameColor,
          // TODO: update coords
          corners: [],
        };
      }

      let vec = clientToImage(e.clientX, e.clientY);
      currentRect?.corners.push({ x: vec?.x ?? 0, y: vec?.y ?? 0 });
      let n = currentRect!.corners.length;
      console.log("At node " + n);
      if (n > 3) {
        editing = false;
        completeDraw(currentRect!);
        currentRect = undefined;
      }
    } else if (e.button === 2) {
      //CANCEL editing
      editing = false;
      console.log("Cancelled editing mode.");
      currentRect = undefined;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (draggingCorner) {
      const item = images.active;
      const frame = item?.frames.find((f) => f.id === draggingCorner!.frameId);
      if (!frame) return;
      const vec = clientToImage(e.clientX, e.clientY);
      if (!vec) return;
      frame.corners[draggingCorner.cornerIndex] = { x: vec.x, y: vec.y };
      return;
    }
    if (editing && currentRect) {
      let vec = clientToImage(e.clientX, e.clientY);
      if (vec) {
        cursor_pos = { x: vec.x, y: vec.y };
      }
    }
    if (!panning) return;
    const item = images.active;
    if (!item) return;
    item.view.x = panStart.vx + (e.clientX - panStart.x);
    item.view.y = panStart.vy + (e.clientY - panStart.y);
  }

  function onPointerUp(e: PointerEvent) {
    if (draggingCorner) {
      const dc = draggingCorner;
      draggingCorner = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const frame = images.active?.frames.find((f) => f.id === dc.frameId);
      if (!frame) return;
      const after = {
        x: frame.corners[dc.cornerIndex].x,
        y: frame.corners[dc.cornerIndex].y,
      };
      if (after.x === dc.before.x && after.y === dc.before.y) return;
      history.push({
        label: "Move corner",
        apply: () => {
          frame.corners[dc.cornerIndex] = { ...after };
        },
        revert: () => {
          frame.corners[dc.cornerIndex] = { ...dc.before };
        },
      });
      return;
    }
    panning = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  $effect(() => {
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Shift" && !e.repeat) {
      const ids = images.active?.frames.map((f) => f.id) ?? [];
      hiddenFrameIds = new Set(ids);
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === "Shift") {
      hiddenFrameIds = new Set();
    }
  }

  $effect(() => {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  $effect(() => {
    if (!viewport) return;
    const sync = () => {
      const r = viewport.getBoundingClientRect();
      viewportSize = { w: r.width, h: r.height };
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(viewport);
    return () => ro.disconnect();
  });

  /**
   * Render hook for the overlay canvas. Drawing happens in image-source
   * coordinates: the context is pre-translated/scaled to match the image's
   * pan + zoom, so a corner at `frame.corners[i]` lands exactly on top of
   * its source pixel.
   *
   * Divide stroke widths and dot radii by `view.scale` to keep them visually
   * constant regardless of zoom level.
   */
  const renderOverlay = $derived(
    ({ context }: { context: CanvasRenderingContext2D }) => {
      const item = images.active;
      if (!item) return;

      context.save();
      context.translate(item.view.x, item.view.y);
      context.scale(item.view.scale, item.view.scale);

      const lw = 1.5 / item.view.scale;
      const dotR = 4 / item.view.scale;

      // Committed frames
      context.lineWidth = lw;
      for (const f of item.frames) {
        if (f.corners.length === 0) continue;
        if (
          hiddenFrameIds.has(f.id) &&
          draggingCorner?.frameId !== f.id
        )
          continue;

        for (let i = 0; i < f.corners.length; i++) {
          const c = f.corners[i];
          context.beginPath();
          context.arc(c.x, c.y, dotR, 0, Math.PI * 2);
          context.closePath();
          context.fillStyle = hexToRgba(f.color, i === 0 ? 0.95 : 0.57);
          context.fill();
        }
        context.strokeStyle = hexToRgba(f.color, 0.95);
        context.fillStyle = hexToRgba(f.color, 0.18);
        context.beginPath();
        context.moveTo(f.corners[0].x, f.corners[0].y);
        for (let i = 1; i < f.corners.length; i++) {
          context.lineTo(f.corners[i].x, f.corners[i].y);
        }
        if (f.corners.length >= 4) {
          context.closePath();
          context.fill();
        }
        context.stroke();
      }

      // In-progress rect
      if (editing && currentRect && currentRect.corners.length > 0) {
        context.strokeStyle = hexToRgba(currentRect.color, 0.95);
        context.fillStyle = hexToRgba(currentRect.color, 0.2);
        context.lineWidth = lw;
        context.beginPath();
        context.moveTo(currentRect.corners[0].x, currentRect.corners[0].y);
        for (let i = 1; i < currentRect.corners.length; i++) {
          context.lineTo(currentRect.corners[i].x, currentRect.corners[i].y);
        }
        if (currentRect.corners.length >= 4) {
          context.closePath();
          context.fill();
        } else if (cursor_pos) {
          context.lineTo(cursor_pos.x, cursor_pos.y);
          if (currentRect.corners.length === 3) {
            // Draw a helper line from the first corner to the cursor, to make it easier to place the second corner.
            context.moveTo(currentRect.corners[0].x, currentRect.corners[0].y);
            context.lineTo(cursor_pos.x, cursor_pos.y);
          }
        }
        context.stroke();

        for (const c of currentRect.corners) {
          context.beginPath();
          context.arc(c.x, c.y, dotR, 0, Math.PI * 2);
          context.fillStyle = hexToRgba(currentRect.color, 0.95);
          context.fill();
        }
      }

      context.restore();
    },
  );

  $effect(() => {
    const item = images.active;
    if (!item || item.view.fitted || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fit = Math.min(
      rect.width / item.naturalWidth,
      rect.height / item.naturalHeight,
      1,
    );
    item.view.scale = fit;
    item.view.x = (rect.width - item.naturalWidth * fit) / 2;
    item.view.y = (rect.height - item.naturalHeight * fit) / 2;
    item.view.fitted = true;
  });
</script>

<div
  class="viewer"
  class:drag-over={dragOver}
  class:panning
  class:has-image={images.active !== null}
  bind:this={viewport}
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  role="application"
>
  {#if images.active}
    {@const a = images.active}
    <img
      src={a.url}
      alt={a.name}
      style:transform="translate({a.view.x}px, {a.view.y}px) scale({a.view
        .scale})"
      style:width="{a.naturalWidth}px"
      style:height="{a.naturalHeight}px"
      draggable="false"
    />
    <Canvas
      width={viewportSize.w}
      height={viewportSize.h}
      style="position: absolute; inset: 0; pointer-events: none;"
    >
      <Layer render={renderOverlay} />
    </Canvas>
  {:else}
    <div class="hint">Drop images here</div>
  {/if}

  {#if draggingCorner && images.active}
    {@const dc = draggingCorner}
    {@const item = images.active}
    {@const frame = item.frames.find((f) => f.id === dc.frameId)}
    {#if frame}
      {@const corner = frame.corners[dc.cornerIndex]}
      {@const magSize = 96}
      {@const zoom = 5}
      {@const offset = 28}
      {@const cursorScreenX = corner.x * item.view.scale + item.view.x}
      {@const cursorScreenY = corner.y * item.view.scale + item.view.y}
      <div
        class="magnifier"
        style:left="{cursorScreenX + offset}px"
        style:top="{cursorScreenY - magSize - offset}px"
        style:width="{magSize}px"
        style:height="{magSize}px"
      >
        <img
          class="mag-img"
          src={item.url}
          alt=""
          style:width="{item.naturalWidth}px"
          style:height="{item.naturalHeight}px"
          style:transform="translate({magSize / 2 -
            corner.x * zoom}px, {magSize / 2 - corner.y * zoom}px) scale({zoom})"
          draggable="false"
        />
        <div class="mag-cross"></div>
      </div>
    {/if}
  {/if}

  <TabStrip />
</div>

<style>
  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    user-select: none;
    touch-action: none;
  }

  .viewer.has-image {
    cursor: crosshair;
  }

  .viewer.panning {
    cursor: grabbing;
  }

  .viewer.drag-over::before {
    content: "";
    position: absolute;
    inset: 14px;
    border: 2px dashed var(--drop-hint-border);
    border-radius: 12px;
    pointer-events: none;
    z-index: 2;
  }

  img {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
    image-rendering: pixelated;
    -webkit-user-drag: none;
    pointer-events: none;
  }

  .hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--fg-muted);
    font-size: 13px;
    letter-spacing: 0.01em;
    pointer-events: none;
  }

  .magnifier {
    position: absolute;
    border-radius: 50%;
    overflow: hidden;
    pointer-events: none;
    border: 2px solid var(--bg-elevated);
    background: var(--bg);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    z-index: 30;
  }

  .mag-img {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    image-rendering: pixelated;
    pointer-events: none;
    -webkit-user-drag: none;
  }

  .mag-cross {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .mag-cross::before,
  .mag-cross::after {
    content: "";
    position: absolute;
    background: rgba(255, 255, 255, 0.75);
    mix-blend-mode: difference;
  }

  .mag-cross::before {
    left: 12%;
    right: 12%;
    top: 50%;
    height: 1px;
  }

  .mag-cross::after {
    top: 12%;
    bottom: 12%;
    left: 50%;
    width: 1px;
  }
</style>
