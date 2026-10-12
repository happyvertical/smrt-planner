<script lang="ts">
import AdvancedStyles from '$lib/components/AdvancedStyles.svelte';
</script>

<svelte:head><title>Advanced Styles · smrt planner</title></svelte:head>
<main><AdvancedStyles backHref="/?tab=theme" /></main>

<style>
  main { width: min(100%, 72rem); margin-inline: auto; padding: var(--smrt-spacing-6); }
</style>
