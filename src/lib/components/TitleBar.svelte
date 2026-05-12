<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let { title = "RIP" }: { title?: string } = $props();

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.detail === 2) {
      void getCurrentWindow().toggleMaximize();
      return;
    }
    void getCurrentWindow().startDragging();
  }
</script>

<div class="titlebar" onpointerdown={onPointerDown}>
  <span class="title">{title}</span>
</div>

<style>
  .titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--titlebar-height);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    pointer-events: auto;
  }

  .title {
    font-size: 13px;
    font-weight: 500;
    color: var(--fg);
    letter-spacing: 0.02em;
    user-select: none;
    -webkit-user-select: none;
  }
</style>
