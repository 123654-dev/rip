<script lang="ts">
  import SplitPane from "$lib/components/SplitPane.svelte";
  import ImageViewer from "$lib/components/ImageViewer.svelte";
  import Atlas from "$lib/components/Atlas.svelte";
</script>

<SplitPane>
  {#snippet left()}
    <ImageViewer />
  {/snippet}
  {#snippet right()}
    <Atlas />
  {/snippet}
</SplitPane>
