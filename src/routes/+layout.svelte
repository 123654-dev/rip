<script lang="ts">
  import "$lib/theme.css";
  import { history } from "$lib/state/history.svelte";
  import { images } from "$lib/state/images.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";

  let { children } = $props();

  function swallow(e: Event) {
    e.preventDefault();
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const isTextEditable =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    const meta = e.metaKey || e.ctrlKey;

    if (meta && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      history.undo();
      return;
    }
    if (
      (meta && e.shiftKey && e.key.toLowerCase() === "z") ||
      (meta && e.key.toLowerCase() === "y")
    ) {
      e.preventDefault();
      history.redo();
      return;
    }

    if (!isTextEditable && (e.key === "Delete" || e.key === "Backspace")) {
      // Selected frame takes priority over active image.
      if (images.selectedFrameId) {
        e.preventDefault();
        images.removeFrame(images.selectedFrameId);
      } else if (images.activeId) {
        e.preventDefault();
        images.remove(images.activeId);
      }
    }
  }

  // Tauri's WKWebView frequently fails to refresh the cursor when the pointer
  // moves between regions with different `cursor:` rules — moving from the
  // .viewer's crosshair (or the divider's col-resize) onto a tile in the
  // atlas leaves the previous cursor stuck. Compositor layers on tiles
  // (`will-change: transform`) make this worse. Toggling body.style.cursor
  // on each target change forces WebKit to recompute it. The pointerleave
  // handler covers crossing into the native titlebar, where no pointermove
  // fires inside the WebView to refresh things.
  $effect(() => {
    let last: EventTarget | null = null;
    const refresh = () => {
      document.body.style.cursor = "auto";
      requestAnimationFrame(() => {
        document.body.style.cursor = "";
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.target === last) return;
      last = e.target;
      refresh();
    };
    const onLeave = () => {
      last = null;
      refresh();
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  });
</script>

<svelte:window
  ondragover={swallow}
  ondrop={swallow}
  oncontextmenu={swallow}
  onkeydown={onKeyDown}
/>

<TitleBar />

<div class="app-body">
  {@render children()}
</div>

<style>
  .app-body {
    position: absolute;
    top: var(--titlebar-height);
    left: 0;
    right: 0;
    bottom: 0;
  }
</style>
