<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    left,
    right,
    minFraction = 0.3,
  }: { left: Snippet; right: Snippet; minFraction?: number } = $props();

  let fraction = $state(0.5);
  let dragging = $state(false);
  let container: HTMLDivElement;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    const max = 1 - minFraction;
    fraction = Math.min(max, Math.max(minFraction, f));
  }

  function onPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<div class="split" bind:this={container} style:--left-fraction={fraction}>
  <div class="pane">{@render left()}</div>
  <div
    class="divider"
    class:dragging
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    role="separator"
    aria-orientation="vertical"
    tabindex="-1"
  ></div>
  <div class="pane">{@render right()}</div>
</div>

<style>
  .split {
    display: grid;
    grid-template-columns: calc(var(--left-fraction) * 100%) auto 1fr;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .pane {
    position: relative;
    overflow: hidden;
    min-width: 0;
  }

  .divider {
    width: 1px;
    background: var(--divider);
    position: relative;
    cursor: col-resize;
    transition: background 0.15s ease;
  }

  .divider::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    right: -4px;
    cursor: col-resize;
  }

  .divider:hover,
  .divider.dragging {
    background: var(--divider-hover);
  }
</style>
