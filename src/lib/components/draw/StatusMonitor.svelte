<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { fetchGpuStatus, fetchAnnouncement } from '$lib/draw/api/client';
	import type { DrawGpuInfo } from '$lib/draw/types';

	// 合肥市居民用电均价 0.5653 元/kWh
	const ELECTRICITY_RATE = 0.5653;

	let gpu = $state<DrawGpuInfo[]>([]);
	let gpuAvailable = $state(false);
	let gpuError = $state('');
	let announcement = $state<{ enabled: boolean; title: string; content: string } | null>(null);
	let loading = $state(true);

	// 电费累加
	let totalKWh = $state(0);
	let totalCost = $derived(totalKWh * ELECTRICITY_RATE);
	let lastPowerDraw = $state(0);
	let lastTick = $state(Date.now());

	$effect(() => {
		loadStatus();
	});

	async function loadStatus() {
		loading = true;
		try {
			const [gpuRes, annRes] = await Promise.all([fetchGpuStatus(), fetchAnnouncement()]);
			gpu = gpuRes.gpus;
			gpuAvailable = gpuRes.available;
			gpuError = gpuRes.error || '';
			announcement = annRes.announcement;

			// 累加电费：总功耗(W) * 时间差 / 1000 / 3600 => kWh
			const now = Date.now();
			const totalW = gpu.reduce((sum, g) => sum + (g['power.draw'] || 0), 0);
			if (lastTick > 0 && totalW > 0) {
				const hours = (now - lastTick) / 3600000;
				totalKWh += (totalW * hours) / 1000;
			}
			lastPowerDraw = totalW;
			lastTick = now;
		} catch {
			// ignore
		} finally {
			loading = false;
		}
	}

	// 每 5 秒自动刷新以累加电费
	$effect(() => {
		const interval = setInterval(loadStatus, 5000);
		return () => clearInterval(interval);
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium flex items-center gap-1.5">
			<Icon icon="mdi:information-outline" class="size-4" />
			状态
		</h3>
		<Button variant="ghost" size="sm" onclick={loadStatus} disabled={loading}>
			<Icon icon="mdi:refresh" class="size-4" />
		</Button>
	</div>

	<!-- Announcement -->
	{#if announcement?.enabled}
		<Alert>
			<Icon icon="mdi:bullhorn-outline" class="size-4" />
			<AlertTitle class="text-sm">{announcement.title}</AlertTitle>
			<AlertDescription class="text-xs mt-1 whitespace-pre-wrap">{announcement.content}</AlertDescription>
		</Alert>
	{/if}

	<!-- GPU Status -->
	<Card>
		<CardHeader class="pb-2">
			<CardTitle class="text-sm flex items-center gap-1.5">
				<Icon icon="mdi:expansion-card" class="size-4" />
				GPU 状态
				{#if gpuAvailable}
					<Badge variant="default" class="text-[10px]">在线</Badge>
				{:else}
					<Badge variant="secondary" class="text-[10px]">离线</Badge>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent>
			{#if loading}
				<div class="text-xs text-muted-foreground">加载中...</div>
			{:else if !gpuAvailable}
				<div class="text-xs text-muted-foreground">{gpuError || 'GPU 不可用'}</div>
			{:else}
				{#each gpu as g}
					<div class="space-y-2 text-xs">
						<div class="font-medium">{g.name}</div>
						<div class="grid grid-cols-2 gap-x-4 gap-y-1">
							<div class="flex justify-between">
								<span class="text-muted-foreground">显存</span>
								<span>{g['memory.used']}MB / {g['memory.total']}MB</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">GPU 利用率</span>
								<span>{g['utilization.gpu']}%</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">温度</span>
								<span>{g['temperature.gpu']}°C</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">功耗</span>
								<span>{g['power.draw']}W / {g['power.limit']}W</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">风扇</span>
								<span>{g['fan.speed']}%</span>
							</div>
							<div class="flex justify-between">
								<span class="text-muted-foreground">显存利用率</span>
								<span>{g['utilization.memory']}%</span>
							</div>
						</div>
						<!-- Memory bar -->
						<div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
							<div
								class="h-full rounded-full transition-all {g['memory.used'] / g['memory.total'] > 0.9 ? 'bg-destructive' : g['memory.used'] / g['memory.total'] > 0.7 ? 'bg-yellow-500' : 'bg-primary'}"
								style="width: {(g['memory.used'] / g['memory.total']) * 100}%"
							></div>
						</div>
					</div>
				{/each}
				{#if lastPowerDraw > 0}
					<div class="text-[11px] text-yellow-500 pt-1">
						已烧掉 ¥{totalCost.toFixed(6)}
					</div>
				{/if}
			{/if}
		</CardContent>
	</Card>
</div>
