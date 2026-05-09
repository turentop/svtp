<script lang="ts">
	import { siteConfig } from '$lib/config/site';
	import Icon from '@iconify/svelte';
</script>

<footer class="mt-auto border-t py-6">
	<div class="container mx-auto flex flex-col items-center gap-2 text-sm text-muted-foreground">
		<div class="flex items-center gap-4">
			<a href="/posts/privacy-policy/" class="inline-flex items-center gap-1 hover:text-foreground transition-colors">
				<Icon icon="mdi:shield-lock" class="w-4 h-4" />
				隐私政策
			</a>
			<span class="text-border">|</span>
			<a href="#" id="open_preferences_center" class="inline-flex items-center gap-1 hover:text-foreground transition-colors">
				<Icon icon="mdi:cookie-settings" class="w-4 h-4" />
				Cookie 设置
			</a>
		</div>
		<p>&copy; {new Date().getFullYear()} {siteConfig.bio.name}</p>
	</div>
</footer>
