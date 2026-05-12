<script lang="ts">
  import { images } from "$lib/state/images.svelte";
  import { history } from "$lib/state/history.svelte";
  import { atlas } from "$lib/state/atlas.svelte";
  import fx from "$lib/glfx.js";
  import AtlasControls from "./AtlasControls.svelte";
  import { CrosshairSimpleIcon } from "phosphor-svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { save } from "@tauri-apps/plugin-dialog";

  let viewport: HTMLDivElement;
  let panning = $state(false);
  let view = $state({ x: 0, y: 0, scale: 1 });
  let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

  function dist(a: vec2, b: vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function orderCorners(corners: vec2[]): vec2[] {
    const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length;
    const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length;
    return [...corners].sort(
      (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
    );
  }

  function flattenedDims(
    corners: vec2[],
  ): { width: number; height: number } | null {
    if (corners.length < 4) return null;
    const c = orderCorners(corners);
    const edges = [
      { dx: Math.abs(c[1].x - c[0].x), len: dist(c[0], c[1]) },
      { dx: Math.abs(c[2].x - c[1].x), len: dist(c[1], c[2]) },
      { dx: Math.abs(c[3].x - c[2].x), len: dist(c[2], c[3]) },
      { dx: Math.abs(c[0].x - c[3].x), len: dist(c[3], c[0]) },
    ];
    const pairAdx = edges[0].dx + edges[2].dx;
    const pairBdx = edges[1].dx + edges[3].dx;
    const widthPair =
      pairAdx >= pairBdx ? [edges[0], edges[2]] : [edges[1], edges[3]];
    const heightPair =
      pairAdx >= pairBdx ? [edges[1], edges[3]] : [edges[0], edges[2]];
    return {
      width: (widthPair[0].len + widthPair[1].len) / 2,
      height: (heightPair[0].len + heightPair[1].len) / 2,
    };
  }

  type Tile = {
    frame: Rectangle;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
  };

  const tiles: Tile[] = $derived.by(() => {
    return images.items
      .flatMap((i) => i.frames)
      .map((frame): Tile | null => {
        const d = flattenedDims(frame.corners);
        if (!d) return null;
        const w = d.width * frame.renderScaleX;
        const h = d.height * frame.renderScaleY;
        return {
          frame,
          x: frame.renderPosition.x,
          y: frame.renderPosition.y,
          w,
          h,
          rotation: frame.renderRotation,
        };
      })
      .filter((t): t is Tile => t !== null);
  });

  const tileBounds = $derived.by(() => {
    if (tiles.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, hasTiles: false };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of tiles) {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      const cos = Math.cos(t.rotation);
      const sin = Math.sin(t.rotation);
      const hw = t.w / 2;
      const hh = t.h / 2;
      const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
      for (const p of corners) {
        const x = cx + cos * p.x - sin * p.y;
        const y = cy + sin * p.x + cos * p.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY, hasTiles: true };
  });

  $effect(() => {
    atlas.minX = tileBounds.minX;
    atlas.minY = tileBounds.minY;
    atlas.maxX = tileBounds.maxX;
    atlas.maxY = tileBounds.maxY;
    atlas.hasTiles = tileBounds.hasTiles;
  });

  const selected: Rectangle | null = $derived(
    images.selectedFrameId
      ? (images.items
          .flatMap((i) => i.frames)
          .find((f) => f.id === images.selectedFrameId) ?? null)
      : null,
  );

  type HandleSet = {
    tl: vec2;
    tr: vec2;
    br: vec2;
    bl: vec2;
    rotateAnchor: vec2;
    rotateHandle: vec2;
  };

  const handles: HandleSet | null = $derived.by(() => {
    if (!selected) return null;
    const d = flattenedDims(selected.corners);
    if (!d) return null;
    const W = d.width * selected.renderScaleX;
    const H = d.height * selected.renderScaleY;
    const cx = selected.renderPosition.x + W / 2;
    const cy = selected.renderPosition.y + H / 2;
    const θ = selected.renderRotation;
    const cos = Math.cos(θ);
    const sin = Math.sin(θ);
    const rotateOffset = 28 / view.scale;

    function local(lx: number, ly: number): vec2 {
      const ax = cx + cos * lx - sin * ly;
      const ay = cy + sin * lx + cos * ly;
      return {
        x: ax * view.scale + view.x,
        y: ay * view.scale + view.y,
      };
    }

    return {
      tl: local(-W / 2, -H / 2),
      tr: local(W / 2, -H / 2),
      br: local(W / 2, H / 2),
      bl: local(-W / 2, H / 2),
      rotateAnchor: local(0, -H / 2),
      rotateHandle: local(0, -H / 2 - rotateOffset),
    };
  });

  /**
   *
   * Inputs:
   *  - frame.corners: 4 vec2s in source-image coordinates (any click order)
   *  - frame.imageId: source image id; look up the source via
   *      images.items.find(i => i.id === frame.imageId)
   *    to get url / naturalWidth / naturalHeight.
   *
   * Output: render the flattened pixels into `canvas`. The canvas's
   * width/height attributes already match the flattened output dimensions.
   */
  async function renderFrame(
    frame: Rectangle,
    renderCanvas: HTMLCanvasElement,
  ): Promise<void> {
    let canvas = fx.canvas();
    const image = images.items.find((i) => i.id === frame.imageId);
    if (!image) {
      console.error("Image not found for frame: " + frame.imageId);
      return;
    }
    const img = new Image();
    img.src = image.url;
    await img.decode();
    let tex = canvas.texture(img);
    const c = orderCorners(frame.corners);
    const before = [
      c[0].x,
      c[0].y,
      c[1].x,
      c[1].y,
      c[2].x,
      c[2].y,
      c[3].x,
      c[3].y,
    ];
    const after = [
      0,
      0,
      renderCanvas.width,
      0,
      renderCanvas.width,
      renderCanvas.height,
      0,
      renderCanvas.height,
    ];
    //@ts-ignore
    canvas.draw(tex).perspective(before, after).update();
    const ctx = renderCanvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get 2D context");
      return;
    }
    ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    ctx.drawImage(canvas, 0, 0);
  }

  function renderTile(canvas: HTMLCanvasElement, frame: Rectangle) {
    let lastCornerKey = JSON.stringify(frame.corners);
    let lastScaleX = frame.renderScaleX;
    let lastScaleY = frame.renderScaleY;
    void renderFrame(frame, canvas);
    return {
      update(next: Rectangle) {
        const cornerKey = JSON.stringify(next.corners);
        if (
          cornerKey !== lastCornerKey ||
          next.renderScaleX !== lastScaleX ||
          next.renderScaleY !== lastScaleY
        ) {
          lastCornerKey = cornerKey;
          lastScaleX = next.renderScaleX;
          lastScaleY = next.renderScaleY;
          void renderFrame(next, canvas);
        }
      },
    };
  }

  async function exportAtlas(): Promise<void> {
    const W = atlas.width;
    const H = atlas.height;
    if (W <= 0 || H <= 0) return;

    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    if (atlas.bgColor.a > 0) {
      ctx.fillStyle = atlas.bgColorCSS;
      ctx.fillRect(0, 0, W, H);
    }

    for (const t of tiles) {
      const tw = Math.max(1, Math.round(t.w));
      const th = Math.max(1, Math.round(t.h));
      const tile = document.createElement("canvas");
      tile.width = tw;
      tile.height = th;
      await renderFrame(t.frame, tile);

      const cx = t.x + t.w / 2 - atlas.left;
      const cy = t.y + t.h / 2 - atlas.top;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t.rotation);
      ctx.drawImage(tile, -t.w / 2, -t.h / 2, t.w, t.h);
      ctx.restore();
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;

    const path = await save({
      title: "Export atlas",
      defaultPath: "atlas.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!path) return;

    const data = new Uint8Array(await blob.arrayBuffer());
    await invoke("save_image", { path, data });
  }

  function clientToCanvas(clientX: number, clientY: number): vec2 {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  }

  function attachDocDrag(
    onMove: (e: PointerEvent) => void,
    onUp?: (e: PointerEvent) => void,
  ) {
    function move(e: PointerEvent) {
      onMove(e);
    }
    function up(e: PointerEvent) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      onUp?.(e);
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey) {
      const rect = viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newScale = Math.min(40, Math.max(0.05, view.scale * factor));
      const k = newScale / view.scale;
      view.x = cx - (cx - view.x) * k;
      view.y = cy - (cy - view.y) * k;
      view.scale = newScale;
    } else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
    }
  }

  function onAtlasPointerDown(e: PointerEvent) {
    if (e.button === 1) {
      e.preventDefault();
      panning = true;
      panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 0) {
      // tiles and handles call stopPropagation; reaching here means background
      images.selectedFrameId = null;
    }
  }

  function onAtlasPointerMove(e: PointerEvent) {
    if (!panning) return;
    view.x = panStart.vx + (e.clientX - panStart.x);
    view.y = panStart.vy + (e.clientY - panStart.y);
  }

  function onAtlasPointerUp(e: PointerEvent) {
    if (panning) {
      panning = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }

  function onTilePointerDown(e: PointerEvent, frame: Rectangle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    images.selectedFrameId = frame.id;
    const start = clientToCanvas(e.clientX, e.clientY);
    const before = { x: frame.renderPosition.x, y: frame.renderPosition.y };
    attachDocDrag(
      (ev) => {
        const cur = clientToCanvas(ev.clientX, ev.clientY);
        frame.renderPosition = {
          x: before.x + (cur.x - start.x),
          y: before.y + (cur.y - start.y),
        };
      },
      () => {
        const after = { x: frame.renderPosition.x, y: frame.renderPosition.y };
        if (after.x === before.x && after.y === before.y) return;
        history.push({
          label: "Move frame",
          apply: () => {
            frame.renderPosition = { ...after };
          },
          revert: () => {
            frame.renderPosition = { ...before };
          },
        });
      },
    );
  }

  function onScaleHandlePointerDown(
    e: PointerEvent,
    frame: Rectangle,
    sgn: vec2,
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const baseDims = flattenedDims(frame.corners);
    if (!baseDims) return;
    const baseW = baseDims.width;
    const baseH = baseDims.height;
    const θ = frame.renderRotation;
    const cos = Math.cos(θ);
    const sin = Math.sin(θ);

    const scaleX0 = frame.renderScaleX;
    const scaleY0 = frame.renderScaleY;
    const W0 = baseW * scaleX0;
    const H0 = baseH * scaleY0;
    const C0 = {
      x: frame.renderPosition.x + W0 / 2,
      y: frame.renderPosition.y + H0 / 2,
    };
    // anchor (opposite corner) in atlas space — held fixed during scale drag
    const localAnchor = { x: (-sgn.x * W0) / 2, y: (-sgn.y * H0) / 2 };
    const A = {
      x: C0.x + cos * localAnchor.x - sin * localAnchor.y,
      y: C0.y + sin * localAnchor.x + cos * localAnchor.y,
    };
    // vector from anchor to dragged corner at the *current* scale — used as
    // the diagonal direction so uniform scaling preserves the existing aspect
    // ratio after a prior freeform resize, instead of snapping back to 1:1.
    const cornerX = cos * sgn.x * W0 - sin * sgn.y * H0;
    const cornerY = sin * sgn.x * W0 + cos * sgn.y * H0;
    const Dcurr = Math.hypot(cornerX, cornerY) || 1;
    const u_x = cornerX / Dcurr;
    const u_y = cornerY / Dcurr;

    const before = {
      position: { ...frame.renderPosition },
      scaleX: scaleX0,
      scaleY: scaleY0,
    };

    attachDocDrag(
      (ev) => {
        const P = clientToCanvas(ev.clientX, ev.clientY);
        let newScaleX: number;
        let newScaleY: number;
        if (ev.shiftKey) {
          // non-uniform: project mouse-from-anchor delta into local axes
          const relW = P.x - A.x;
          const relH = P.y - A.y;
          const localX = cos * relW + sin * relH;
          const localY = -sin * relW + cos * relH;
          newScaleX = Math.max(0.05, localX / (sgn.x * baseW));
          newScaleY = Math.max(0.05, localY / (sgn.y * baseH));
        } else {
          // uniform: scale proportionally along the current corner direction
          const l = (P.x - A.x) * u_x + (P.y - A.y) * u_y;
          const minRatio =
            0.05 / Math.max(0.0001, Math.min(scaleX0, scaleY0));
          const ratio = Math.max(minRatio, l / Dcurr);
          newScaleX = scaleX0 * ratio;
          newScaleY = scaleY0 * ratio;
        }
        const W_new = baseW * newScaleX;
        const H_new = baseH * newScaleY;
        const C_new = {
          x: A.x + (cos * sgn.x * W_new) / 2 - (sin * sgn.y * H_new) / 2,
          y: A.y + (sin * sgn.x * W_new) / 2 + (cos * sgn.y * H_new) / 2,
        };
        frame.renderScaleX = newScaleX;
        frame.renderScaleY = newScaleY;
        frame.renderPosition = {
          x: C_new.x - W_new / 2,
          y: C_new.y - H_new / 2,
        };
      },
      () => {
        const after = {
          position: { ...frame.renderPosition },
          scaleX: frame.renderScaleX,
          scaleY: frame.renderScaleY,
        };
        if (
          before.scaleX === after.scaleX &&
          before.scaleY === after.scaleY &&
          before.position.x === after.position.x &&
          before.position.y === after.position.y
        )
          return;
        history.push({
          label: "Scale frame",
          apply: () => {
            frame.renderPosition = { ...after.position };
            frame.renderScaleX = after.scaleX;
            frame.renderScaleY = after.scaleY;
          },
          revert: () => {
            frame.renderPosition = { ...before.position };
            frame.renderScaleX = before.scaleX;
            frame.renderScaleY = before.scaleY;
          },
        });
      },
    );
  }

  function onRotateHandlePointerDown(e: PointerEvent, frame: Rectangle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const baseDims = flattenedDims(frame.corners);
    if (!baseDims) return;
    const W = baseDims.width * frame.renderScaleX;
    const H = baseDims.height * frame.renderScaleY;
    const C = {
      x: frame.renderPosition.x + W / 2,
      y: frame.renderPosition.y + H / 2,
    };
    const start = clientToCanvas(e.clientX, e.clientY);
    const startAngle = Math.atan2(start.y - C.y, start.x - C.x);
    const before = frame.renderRotation;
    attachDocDrag(
      (ev) => {
        const cur = clientToCanvas(ev.clientX, ev.clientY);
        const angle = Math.atan2(cur.y - C.y, cur.x - C.x);
        let next = before + (angle - startAngle);
        if (ev.shiftKey) {
          const step = Math.PI / 12; // 15°
          next = Math.round(next / step) * step;
        }
        frame.renderRotation = next;
      },
      () => {
        const after = frame.renderRotation;
        if (after === before) return;
        history.push({
          label: "Rotate frame",
          apply: () => {
            frame.renderRotation = after;
          },
          revert: () => {
            frame.renderRotation = before;
          },
        });
      },
    );
  }

  $effect(() => {
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  });

  let centerAnim = 0;

  function centerOnFragments() {
    if (!tileBounds.hasTiles || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const cx = (tileBounds.minX + tileBounds.maxX) / 2;
    const cy = (tileBounds.minY + tileBounds.maxY) / 2;
    const targetX = rect.width / 2 - cx * view.scale;
    const targetY = rect.height / 2 - cy * view.scale;
    const startX = view.x;
    const startY = view.y;
    const duration = 260;
    const t0 = performance.now();
    cancelAnimationFrame(centerAnim);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      view.x = startX + (targetX - startX) * e;
      view.y = startY + (targetY - startY) * e;
      if (t < 1) centerAnim = requestAnimationFrame(tick);
    };
    centerAnim = requestAnimationFrame(tick);
  }
</script>

<div
  class="atlas"
  class:panning
  bind:this={viewport}
  onpointerdown={onAtlasPointerDown}
  onpointermove={onAtlasPointerMove}
  onpointerup={onAtlasPointerUp}
  onpointercancel={onAtlasPointerUp}
  role="application"
>
  <div
    class="canvas"
    style:transform="translate({view.x}px, {view.y}px) scale({view.scale})"
  >
    {#if atlas.hasTiles}
      <div
        class="atlas-bg"
        style:left="{atlas.left}px"
        style:top="{atlas.top}px"
        style:width="{atlas.width}px"
        style:height="{atlas.height}px"
        style:background={atlas.bgColorCSS}
      ></div>
    {/if}
    {#each tiles as t (t.frame.id)}
      <div
        class="tile-wrapper"
        class:selected={images.selectedFrameId === t.frame.id}
        style:left="{t.x}px"
        style:top="{t.y}px"
        style:width="{t.w}px"
        style:height="{t.h}px"
        style:transform="rotate({t.rotation}rad)"
      >
        <canvas
          class="tile"
          use:renderTile={t.frame}
          width={Math.max(1, Math.round(t.w))}
          height={Math.max(1, Math.round(t.h))}
          style:border-color={images.selectedFrameId === t.frame.id
            ? t.frame.color
            : null}
          onpointerdown={(e) => onTilePointerDown(e, t.frame)}
        ></canvas>
      </div>
    {/each}
  </div>

  {#if atlas.hasTiles}
    <svg class="overlay-svg outline-svg" xmlns="http://www.w3.org/2000/svg">
      <rect
        x={atlas.left * view.scale + view.x}
        y={atlas.top * view.scale + view.y}
        width={atlas.width * view.scale}
        height={atlas.height * view.scale}
        fill="none"
        stroke="rgba(255, 255, 255, 0.35)"
        stroke-width="1"
        shape-rendering="crispEdges"
      />
    </svg>
    <div
      class="dim-label"
      style:left="{atlas.left * view.scale + view.x}px"
      style:top="{atlas.top * view.scale + view.y}px"
    >
      {atlas.width} × {atlas.height}
    </div>
  {/if}

  {#if handles && selected}
    {@const sel = selected}
    {@const h = handles}
    <svg class="overlay-svg" xmlns="http://www.w3.org/2000/svg">
      <line
        x1={h.rotateAnchor.x}
        y1={h.rotateAnchor.y}
        x2={h.rotateHandle.x}
        y2={h.rotateHandle.y}
        stroke={sel.color}
        stroke-width="1.5"
      />
    </svg>
    <div class="handles">
      <div
        role="button"
        tabindex="-1"
        aria-label="Resize from top-left"
        class="handle handle-corner"
        style:left="{h.tl.x}px"
        style:top="{h.tl.y}px"
        style:cursor="nwse-resize"
        style:border-color={sel.color}
        onpointerdown={(e) =>
          onScaleHandlePointerDown(e, sel, { x: -1, y: -1 })}
      ></div>
      <div
        role="button"
        tabindex="-1"
        aria-label="Resize from top-right"
        class="handle handle-corner"
        style:left="{h.tr.x}px"
        style:top="{h.tr.y}px"
        style:cursor="nesw-resize"
        style:border-color={sel.color}
        onpointerdown={(e) =>
          onScaleHandlePointerDown(e, sel, { x: 1, y: -1 })}
      ></div>
      <div
        role="button"
        tabindex="-1"
        aria-label="Resize from bottom-right"
        class="handle handle-corner"
        style:left="{h.br.x}px"
        style:top="{h.br.y}px"
        style:cursor="nwse-resize"
        style:border-color={sel.color}
        onpointerdown={(e) =>
          onScaleHandlePointerDown(e, sel, { x: 1, y: 1 })}
      ></div>
      <div
        role="button"
        tabindex="-1"
        aria-label="Resize from bottom-left"
        class="handle handle-corner"
        style:left="{h.bl.x}px"
        style:top="{h.bl.y}px"
        style:cursor="nesw-resize"
        style:border-color={sel.color}
        onpointerdown={(e) =>
          onScaleHandlePointerDown(e, sel, { x: -1, y: 1 })}
      ></div>
      <div
        role="button"
        tabindex="-1"
        aria-label="Rotate"
        class="handle handle-rotate"
        style:left="{h.rotateHandle.x}px"
        style:top="{h.rotateHandle.y}px"
        style:border-color={sel.color}
        onpointerdown={(e) => onRotateHandlePointerDown(e, sel)}
      ></div>
    </div>
  {/if}
  <button
    class="center-fab"
    type="button"
    aria-label="Center view on fragments"
    title="Center view on fragments"
    disabled={!tileBounds.hasTiles}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={centerOnFragments}
  >
    <CrosshairSimpleIcon size={20} weight="duotone" />
  </button>

  <AtlasControls onExport={exportAtlas} />
</div>

<style>
  .atlas {
    position: relative;
    width: 100%;
    height: 100%;
    background: var(--bg);
    overflow: hidden;
    touch-action: none;
    cursor: default;
    --accent: #5b9bf2;
  }

  .atlas.panning {
    cursor: grabbing;
  }

  .canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  .atlas-bg {
    position: absolute;
    pointer-events: none;
  }

  .outline-svg {
    z-index: 19;
  }

  .dim-label {
    position: absolute;
    transform: translateY(-100%);
    padding: 2px 6px 4px;
    font-size: 11px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
    z-index: 19;
  }

  .tile-wrapper {
    position: absolute;
    transform-origin: center;
    will-change: transform;
  }

  .tile-wrapper.selected {
    z-index: 10;
  }

  .tile {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--bg-elevated);
    border: 1px solid var(--ring);
    box-sizing: border-box;
    image-rendering: pixelated;
    cursor: move;
  }

  .tile-wrapper.selected .tile {
    border-color: var(--accent);
  }

  .overlay-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 20;
    overflow: visible;
  }

  .handles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 21;
  }

  .handle {
    position: absolute;
    width: 12px;
    height: 12px;
    transform: translate(-50%, -50%);
    background: var(--bg-elevated, #fff);
    border: 1.5px solid var(--accent);
    box-sizing: border-box;
    pointer-events: auto;
  }

  .handle-corner {
    border-radius: 2px;
  }

  .handle-rotate {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    cursor: grab;
  }

  .handle-rotate:active {
    cursor: grabbing;
  }

  .center-fab {
    position: absolute;
    right: 14px;
    bottom: 50px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--bg-elevated);
    border: 1px solid var(--divider);
    padding: 0;
    display: grid;
    place-items: center;
    cursor: pointer;
    color: var(--fg);
    box-shadow: var(--shadow);
    z-index: 25;
    transition:
      box-shadow 0.15s ease,
      background 0.15s ease,
      transform 0.08s ease;
  }

  .center-fab:hover:not(:disabled) {
    box-shadow:
      0 0 0 2px var(--ring),
      var(--shadow);
  }

  .center-fab:active:not(:disabled) {
    transform: scale(0.94);
  }

  .center-fab:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .center-fab :global(svg) {
    display: block;
  }
</style>
