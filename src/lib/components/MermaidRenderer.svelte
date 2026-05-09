<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMermaidIn, watchMermaidTheme } from '$lib/utils/mermaid';

	let { selector = '.prose' }: { selector?: string } = $props();

	onMount(async () => {
		await tick();
		const container = document.querySelector(selector) as HTMLElement | null;
		renderMermaidIn(container);
		const cleanup = watchMermaidTheme();
		return cleanup;
	});
</script>
