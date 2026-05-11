<script lang="ts">
	import Icon from '@iconify/svelte';
	import { getImageProxyUrl, getImageUrl } from '$lib/draw/api/client';
	import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';

	let {
		images = [],
		onFork
	}: {
		images?: { url: string; filename: string }[];
		onFork?: (path: string) => void;
	} = $props();

	let lbOpen = $state(false);
	let lbIndex = $state(0);
	let lbImages = $derived(images.map((img) => ({ src: getImageUrl(img.filename), creator_id: '' })));

	function openLightbox(i: number) {
		lbIndex = i;
		lbOpen = true;
	}
</script>

{#if images.length > 0}
	<div class="space-y-2">
		<h3 class="text-sm font-medium flex items-center gap-1.5">
			<Icon icon="mdi:image-multiple-outline" class="size-4" />
			生成结果
			<span class="text-xs text-muted-foreground">({images.length})</span>
		</h3>
		<div class="grid grid-cols-2 md:grid-cols-3 gap-2">
			{#each images as img, i}
				<button
					type="button"
					class="aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
					onclick={() => openLightbox(i)}
				>
					<img
						src={getImageProxyUrl(img.filename)}
						alt={img.filename}
						class="w-full h-full object-cover"
						loading="lazy"
					/>
				</button>
			{/each}
		</div>
	</div>
{/if}

<ImageLightbox
	open={lbOpen}
	images={lbImages}
	index={lbIndex}
	onclose={() => (lbOpen = false)}
	onfork={onFork}
/>
