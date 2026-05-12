<script lang="ts">
  import { images, type ImageItem } from "$lib/state/images.svelte";

  let dragId = $state<string | null>(null);

  function onTabPointerDown(e: PointerEvent, item: ImageItem) {
    e.stopPropagation();
    dragId = item.id;
    images.setActive(item.id);
  }

  function onTabEnter(item: ImageItem) {
    if (dragId && dragId !== item.id) {
      images.reorder(dragId, item.id);
    }
  }

  function endDrag() {
    dragId = null;
  }

  function onClose(e: MouseEvent, id: string) {
    e.stopPropagation();
    images.remove(id);
  }
</script>

<svelte:window onpointerup={endDrag} onpointercancel={endDrag} />

{#if images.items.length > 0}
  <div class="strip">
    {#each images.items as item (item.id)}
      <div
        class="tab"
        class:active={item.id === images.activeId}
        class:dragging={item.id === dragId}
        onpointerdown={(e) => onTabPointerDown(e, item)}
        onpointerenter={() => onTabEnter(item)}
        title={item.name}
        role="tab"
        tabindex="0"
        aria-selected={item.id === images.activeId}
      >
        <img src={item.url} alt="" draggable="false" />
        <button
          class="close"
          aria-label="Close {item.name}"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => onClose(e, item.id)}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M3 3 L9 9 M9 3 L3 9"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .strip {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: var(--tab-strip-padding);
    display: flex;
    gap: 10px;
    justify-content: center;
    align-items: end;
    pointer-events: none;
    background: var(--tab-gradient);
    z-index: 3;
  }

  .tab {
    pointer-events: auto;
    width: var(--tab-thumb-size);
    height: var(--tab-thumb-size);
    border: none;
    padding: 0;
    background: var(--bg-elevated);
    border-radius: 28%;
    position: relative;
    cursor: pointer;
    box-shadow: var(--shadow);
    transition: box-shadow 0.15s ease;
    flex-shrink: 0;
  }

  .tab.dragging {
    opacity: 0.55;
  }

  .tab.active {
    box-shadow:
      0 0 0 2px var(--ring),
      var(--shadow);
  }

  .tab img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 28%;
    display: block;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .close {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: none;
    padding: 0;
    background: var(--bg-elevated);
    color: var(--fg);
    cursor: pointer;
    box-shadow: var(--shadow);
    opacity: 0;
    transition: opacity 0.12s ease;
    display: grid;
    place-items: center;
  }

  .close svg {
    width: 10px;
    height: 10px;
    display: block;
  }

  .tab:hover .close,
  .tab:focus-within .close {
    opacity: 1;
  }
</style>
