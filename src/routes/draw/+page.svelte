<script lang="ts">
	import Icon from '@iconify/svelte';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv } from '$lib/draw/stores/env';
	import { connectRunWs, connectStatusWs } from '$lib/draw/api/ws';
	import { fetchMyImages, getImageUrl, getImageProxyUrl } from '$lib/draw/api/client';
	import type { WsRunMessage, WsStatusEvent, WsRunPayload, DrawWorkflow } from '$lib/draw/types';

	import EnvironmentSwitcher from '$lib/components/draw/EnvironmentSwitcher.svelte';
	import WorkflowSelector from '$lib/components/draw/WorkflowSelector.svelte';
	import StyleSelector from '$lib/components/draw/StyleSelector.svelte';
	import PromptForm from '$lib/components/draw/PromptForm.svelte';
	import ProgressPanel from '$lib/components/draw/ProgressPanel.svelte';
	import ResultGrid from '$lib/components/draw/ResultGrid.svelte';
	import GalleryTab from '$lib/components/draw/GalleryTab.svelte';
	import FeaturedTab from '$lib/components/draw/FeaturedTab.svelte';
	import StatusMonitor from '$lib/components/draw/StatusMonitor.svelte';

	// State
	let currentBaseUrl = $state('');
	let onlineCount = $state(0);
	let globalBusy = $state(false);
	let isGenerating = $state(false);
	let authToken = $state<string | null>(null);
	let isLoggedIn = $derived(!!authToken);

	// Form state
	let workflowPath = $state('');
	let styleTags = $state('');
	let directPrompt = $state('');
	let negativePrompt = $state('');
	let nlPrompt = $state('');
	let rewrite = $state(true);
	let width = $state(0);
	let height = $state(0);

	// Progress state
	let progressMessages = $state<WsRunMessage[]>([]);
	let showProgress = $state(false);
	let resultImages = $state<{ url: string; filename: string }[]>([]);

	// My images state
	let myImages = $state<{ path: string; mtime: number }[]>([]);
	let myImagesTotal = $state(0);
	let myImagesLoading = $state(false);
	let myImagesLoaded = $state(false);
	let myLbOpen = $state(false);
	let myLbIndex = $state(0);

	// WebSocket refs
	let statusConn: ReturnType<typeof connectStatusWs> | null = null;
	let runWs: WebSocket | null = null;

	// Tab state
	let activeTab = $state('generate');

	$effect(() => {
		const u1 = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		authToken = forumAuth.getToken();

		// Connect status WebSocket
		statusConn = connectStatusWs(
			currentBaseUrl,
			handleStatusMessage
		);

		return () => {
			u1();
			statusConn?.close();
			runWs?.close();
		};
	});

	// Reconnect status WS when base URL changes
	$effect(() => {
		const url = currentBaseUrl;
		if (!url) return;
		statusConn?.close();
		statusConn = connectStatusWs(url, handleStatusMessage);
	});

	function handleStatusMessage(msg: WsStatusEvent) {
		switch (msg.type) {
			case 'status':
				onlineCount = msg.online;
				globalBusy = msg.busy;
				break;
			case 'online':
				onlineCount = msg.count;
				break;
			case 'mirror':
				if (!isGenerating && globalBusy) {
					progressMessages = [...progressMessages, msg.event];
					showProgress = true;
				}
				break;
		}
	}

	function handleWorkflowSelect(wf: DrawWorkflow) {
		workflowPath = wf.path;
	}

	function handlePromptLoad(positive: string, negative: string) {
		directPrompt = positive;
		negativePrompt = negative;
	}

	function startGeneration() {
		if (isGenerating || globalBusy) return;
		if (!authToken) {
			alert('请先在论坛登录');
			return;
		}
		if (!workflowPath) {
			alert('请选择工作流');
			return;
		}

		isGenerating = true;
		showProgress = true;
		progressMessages = [];
		resultImages = [];

		const payload: WsRunPayload = {
			token: authToken,
			workflow_path: workflowPath,
			direct_prompt: directPrompt,
			nl_prompt: nlPrompt || undefined,
			rewrite,
			width: width || undefined,
			height: height || undefined,
			style_tags: styleTags || undefined,
			negative_prompt: negativePrompt || undefined
		};

		runWs = connectRunWs(
			currentBaseUrl,
			payload,
			handleRunMessage,
			undefined,
			() => {
				isGenerating = false;
			},
			() => {
				isGenerating = false;
			}
		);
	}

	function handleRunMessage(msg: WsRunMessage) {
		progressMessages = [...progressMessages, msg];

		if (msg.type === 'image') {
			resultImages = [...resultImages, { url: msg.url, filename: msg.filename }];
		}
		if (msg.type === 'error') {
			isGenerating = false;
		}
		if (msg.type === 'done') {
			isGenerating = false;
		}
	}

	async function loadMyImages() {
		if (myImagesLoaded) return;
		myImagesLoading = true;
		try {
			const res = await fetchMyImages();
			myImages = res.items;
			myImagesTotal = res.total;
			myImagesLoaded = true;
		} catch {
			myImages = [];
		} finally {
			myImagesLoading = false;
		}
	}

	function openMyLb(index: number) {
		myLbIndex = index;
		myLbOpen = true;
	}
</script>

<svelte:head>
	<title>AI 生图 - SVAF</title>
</svelte:head>

<div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-4">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<Icon icon="mdi:palette" class="size-6 text-primary" />
			<h1 class="text-xl font-bold">AI 生图</h1>
			{#if onlineCount > 0}
				<Badge variant="secondary" class="text-xs">
					<Icon icon="mdi:account-multiple" class="size-3 mr-0.5" />
					{onlineCount}
				</Badge>
			{/if}
			{#if globalBusy}
				<Badge variant="default" class="text-xs animate-pulse">生成中</Badge>
			{/if}
		</div>
	</div>

	<!-- Environment Switcher -->
	<EnvironmentSwitcher />

	<!-- Auth warning -->
	{#if !isLoggedIn}
		<Alert>
			<Icon icon="mdi:account-alert-outline" class="size-4" />
			<AlertDescription class="text-xs">
				请先<a href="/forum/auth/login" class="underline font-medium">登录论坛</a>后使用生图功能。
			</AlertDescription>
		</Alert>
	{/if}

	<!-- Tabs -->
	<Tabs bind:value={activeTab} class="w-full">
		<TabsList class="w-full">
			<TabsTrigger value="generate" class="flex-1">
				<Icon icon="mdi:sparkles" class="size-4 mr-1" />
				生成
			</TabsTrigger>
			<TabsTrigger value="gallery" class="flex-1">
				<Icon icon="mdi:image-multiple-outline" class="size-4 mr-1" />
				画廊
			</TabsTrigger>
			<TabsTrigger value="mine" class="flex-1">
				<Icon icon="mdi:account-outline" class="size-4 mr-1" />
				我的
			</TabsTrigger>
			<TabsTrigger value="featured" class="flex-1">
				<Icon icon="mdi:star-outline" class="size-4 mr-1" />
				精选
			</TabsTrigger>
			<TabsTrigger value="more" class="flex-1">
				<Icon icon="mdi:dots-horizontal" class="size-4 mr-1" />
				更多
			</TabsTrigger>
		</TabsList>

		<!-- Generate Tab -->
		<TabsContent value="generate" class="space-y-4 mt-4">
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<WorkflowSelector bind:value={workflowPath} onselect={handleWorkflowSelect} onpromptload={handlePromptLoad} />
				<StyleSelector bind:value={styleTags} />
			</div>

			<PromptForm
				bind:directPrompt
				bind:negativePrompt
				bind:nlPrompt
				bind:rewrite
				bind:width
				bind:height
				onsubmit={startGeneration}
				disabled={isGenerating || globalBusy || !isLoggedIn}
			/>

			<ProgressPanel
				bind:messages={progressMessages}
				visible={showProgress}
				busy={isGenerating}
			/>

			<ResultGrid images={resultImages} />
		</TabsContent>

		<!-- Gallery Tab -->
		<TabsContent value="gallery" class="mt-4">
			{#if activeTab === 'gallery'}
				<GalleryTab />
			{/if}
		</TabsContent>

		<!-- My Images Tab -->
		<TabsContent value="mine" class="mt-4">
			{#if activeTab === 'mine'}
				{#if !isLoggedIn}
					<Alert>
						<Icon icon="mdi:account-alert-outline" class="size-4" />
						<AlertDescription class="text-xs">
							请先<a href="/forum/auth/login" class="underline font-medium">登录论坛</a>查看自己的图片。
						</AlertDescription>
					</Alert>
				{:else}
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-medium flex items-center gap-1.5">
								<Icon icon="mdi:account-outline" class="size-4" />
								我的图片
								<span class="text-xs text-muted-foreground">({myImages.length}/{myImagesTotal})</span>
							</h3>
							<Button variant="ghost" size="sm" onclick={() => { myImagesLoaded = false; loadMyImages(); }} disabled={myImagesLoading}>
								<Icon icon="mdi:refresh" class="size-4" />
							</Button>
						</div>

						{#if myImagesLoading}
							<div class="text-xs text-muted-foreground py-8 text-center">加载中...</div>
						{:else if !myImagesLoaded}
							<div class="text-xs text-muted-foreground py-8 text-center">
								<Button variant="outline" size="sm" onclick={loadMyImages}>加载我的图片</Button>
							</div>
						{:else if myImages.length === 0}
							<div class="text-xs text-muted-foreground py-8 text-center">你还没有生成过图片</div>
						{:else}
							<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5">
								{#each myImages as item, i}
									<button
										class="aspect-square rounded-md overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all"
										onclick={() => openMyLb(i)}
									>
										<img
											src={getImageProxyUrl(item.path)}
											alt={item.path}
											class="w-full h-full object-cover"
											loading="lazy"
										/>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</TabsContent>

		<!-- Featured Tab -->
		<TabsContent value="featured" class="mt-4">
			{#if activeTab === 'featured'}
				<FeaturedTab />
			{/if}
		</TabsContent>

		<!-- More Tab -->
		<TabsContent value="more" class="mt-4">
			{#if activeTab === 'more'}
				<StatusMonitor />
			{/if}
		</TabsContent>
	</Tabs>
</div>

<!-- My Images Lightbox -->
<Dialog.Root bind:open={myLbOpen}>
	<Dialog.Content class="max-w-3xl p-0 overflow-hidden">
		{#if myImages[myLbIndex]}
			<div class="relative">
				<img
					src={getImageUrl(myImages[myLbIndex].path)}
					alt={myImages[myLbIndex].path}
					class="w-full max-h-[70vh] object-contain"
				/>
				<div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3">
					<div class="flex items-center justify-between text-white text-xs">
						<span class="truncate">{myImages[myLbIndex].path}</span>
						<a
							href={getImageUrl(myImages[myLbIndex].path, true)}
							download
							class="p-1.5 rounded bg-white/20 hover:bg-white/30"
						>
							<Icon icon="mdi:download" class="size-4" />
						</a>
					</div>
				</div>
			</div>
			{#if myImages.length > 1}
				<div class="flex items-center justify-between px-3 py-2 border-t">
					<Button variant="ghost" size="sm" onclick={() => (myLbIndex = (myLbIndex - 1 + myImages.length) % myImages.length)}>
						<Icon icon="mdi:chevron-left" class="size-5" />
					</Button>
					<span class="text-xs text-muted-foreground">{myLbIndex + 1} / {myImages.length}</span>
					<Button variant="ghost" size="sm" onclick={() => (myLbIndex = (myLbIndex + 1) % myImages.length)}>
						<Icon icon="mdi:chevron-right" class="size-5" />
					</Button>
				</div>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>
