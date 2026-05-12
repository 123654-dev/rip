<script lang="ts">
  import { atlas } from "$lib/state/atlas.svelte";
  import { ArrowSquareOutIcon } from "phosphor-svelte";
  import ColorPicker from "svelte-awesome-color-picker";

  let { onExport }: { onExport?: () => void } = $props();

  let scroller: HTMLDivElement;

  // Atlas attaches a non-passive wheel listener that preventDefaults for
  // pan/zoom; without stopPropagation the bar would never see native scroll.
  // Vertical wheel is mapped to horizontal scroll so a regular mouse can reach
  // overflow when the right pane is narrow.
  function onWheel(e: WheelEvent) {
    e.stopPropagation();
    if (scroller && e.deltaX === 0 && e.deltaY !== 0) {
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    }
  }
</script>

<div class="control-bar" onwheel={onWheel}>
  <div class="bar-scroll" bind:this={scroller}>
    <div class="cell color">
      <span>Background</span>
      <span
        class="cp"
        style="--cp-bg-color: #333;
               --cp-border-color: transparent;
               --cp-text-color: white;
               --cp-input-color: #555;
               --cp-button-hover-color: #777;"
      >
        <ColorPicker
          bind:rgb={atlas.bgColor}
          label=""
          dir="ltr"
          position="fixed"
          --picker-indicator-size="4px"
          --input-size="20px"
          --label-color="transparent"
          --picker-height="100px"
        />
      </span>
    </div>

    <div class="cell padding">
      <span>Padding</span>
      <input
        class="num"
        type="number"
        min="0"
        step="1"
        value={atlas.padding}
        oninput={(e) => {
          const n = parseInt(e.currentTarget.value, 10);
          if (isFinite(n) && n >= 0) atlas.padding = n;
        }}
        onblur={(e) => {
          e.currentTarget.value = String(atlas.padding);
        }}
        aria-label="Padding"
      />
      <span class="unit">px</span>
    </div>

    <button class="cell action" type="button" onclick={() => onExport?.()}>
      <span>Export</span>
      <ArrowSquareOutIcon weight="duotone" size={16} />
    </button>
  </div>
</div>

<style>
  .control-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 36px;
    display: flex;
    background: var(--bg-elevated);
    border-top: 1px solid var(--divider);
    box-shadow: var(--shadow);
    z-index: 30;
    /* overflow stays visible so the color picker popup isn't clipped */
  }

  .bar-scroll {
    flex: 2 1 0;
    min-width: 0;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .bar-scroll::-webkit-scrollbar {
    height: 4px;
  }

  .bar-scroll::-webkit-scrollbar-thumb {
    background: var(--divider-hover);
    border-radius: 2px;
  }

  .cell {
    flex: 1 0 auto;
    height: 100%;
    margin: 0;
    padding: 0 14px;
    background: transparent;
    border: none;
    border-right: 1px solid var(--divider);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    letter-spacing: 0.01em;
    transition: background 0.15s ease;
  }

  .bar-scroll .cell:last-child {
    border-right: none;
  }

  .cell :global(svg) {
    display: block;
    flex-shrink: 0;
  }

  .cp {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .color :global(.color-picker) {
    display: inline-flex;
    align-items: center;
  }

  .color :global(.color-picker label) {
    margin: 0;
    padding: 0;
  }

  .color :global(.color-picker .container) {
    padding: 0;
  }

  .action {
    cursor: pointer;
  }

  .action:hover {
    background: var(--divider);
  }

  .action:active {
    background: var(--divider-hover);
  }

  .num {
    width: 56px;
    height: 24px;
    background: transparent;
    border: 1px solid var(--divider);
    border-radius: 6px;
    color: var(--fg);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: center;
    padding: 0 4px;
    appearance: textfield;
    -moz-appearance: textfield;
    cursor: text;
    user-select: text;
    -webkit-user-select: text;
  }

  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .num:focus {
    outline: none;
    border-color: var(--ring);
  }

  .unit {
    color: var(--fg-muted);
    font-size: 12px;
  }
</style>
