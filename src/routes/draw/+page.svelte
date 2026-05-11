<script lang="ts">
	import Icon from '@iconify/svelte';
	import { siteConfig } from '$lib/config/site';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { forumAuth } from '$lib/forum/stores/auth';
	import { drawEnv } from '$lib/draw/stores/env';
	import { connectRunWs, connectStatusWs } from '$lib/draw/api/ws';
	import { fetchMyImages, getImageUrl, getImageProxyUrl, forkOutputImage, recommendImage, fetchMyRecommendations } from '$lib/draw/api/client';
	import { consumeFork } from '$lib/draw/stores/fork';
	import type { WsRunMessage, WsStatusEvent, WsRunPayload, DrawWorkflow, DrawRecommendation } from '$lib/draw/types';

	import EnvironmentSwitcher from '$lib/components/draw/EnvironmentSwitcher.svelte';
	import WorkflowDialog from '$lib/components/draw/WorkflowDialog.svelte';
	import StyleDialog from '$lib/components/draw/StyleDialog.svelte';
	import PromptForm from '$lib/components/draw/PromptForm.svelte';
	import ProgressPanel from '$lib/components/draw/ProgressPanel.svelte';
	import ResultGrid from '$lib/components/draw/ResultGrid.svelte';
	import FeaturedTab from '$lib/components/draw/FeaturedTab.svelte';
	import StatusMonitor from '$lib/components/draw/StatusMonitor.svelte';
	import ImageLightbox from '$lib/components/draw/ImageLightbox.svelte';

	// State
	let currentBaseUrl = $state('');
	let onlineCount = $state(0);
	let globalBusy = $state(false);
	let isGenerating = $state(false);
	let authToken = $state<string | null>(null);
	let isLoggedIn = $derived(!!authToken);

	// Form state
	let workflowPath = $state('');
	let workflowName = $state('');
	let styleTags = $state('');
	let styleName = $state('');
	let directPrompt = $state('');
	let negativePrompt = $state('');
	let nlPrompt = $state('');
	let rewrite = $state(true);
	let width = $state(0);
	let height = $state(0);
	let inlineWorkflow = $state<object | null>(null);

	// Progress state
	let progressMessages = $state<WsRunMessage[]>([]);
	let showProgress = $state(false);
	let resultImages = $state<{ url: string; filename: string }[]>([]);

	// My images state
	let myImages = $state<{ path: string; mtime: number }[]>([]);
	let myImagesTotal = $state(0);
	let myImagesLoading = $state(false);
	let myImagesLoaded = $state(false);

	// My images lightbox
	let myLbOpen = $state(false);
	let myLbIndex = $state(0);
	let myLbImages = $derived(myImages.map((it) => ({ src: getImageUrl(it.path), creator_id: '' })));

	// Recommendations
	let myRecommendations = $state<DrawRecommendation[]>([]);
	let myRecsLoaded = $state(false);

	// WebSocket refs
	let statusConn: ReturnType<typeof connectStatusWs> | null = null;
	let runWs: WebSocket | null = null;

	// Tab state
	let activeTab = $state('generate');

	$effect(() => {
		if (activeTab === 'mine' && isLoggedIn && !myRecsLoaded) {
			loadMyRecommendations();
		}
	});

	$effect(() => {
		const u1 = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
		authToken = forumAuth.getToken();

		// 检查是否有待消费的 fork 数据（从其他页面跳转过来）
		const fork = consumeFork();
		if (fork) {
			inlineWorkflow = fork.workflow;
			if (fork.builtin_prompt) directPrompt = fork.builtin_prompt;
			if (fork.builtin_negative_prompt) negativePrompt = fork.builtin_negative_prompt;
			if (fork.default_width) width = fork.default_width;
			if (fork.default_height) height = fork.default_height;
			workflowPath = '';
			workflowName = '(fork)';
			activeTab = 'generate';
		}

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
		workflowName = wf.path.replace('.json', '');
		inlineWorkflow = null;
	}

	function handleStyleSelect(tags: string, name: string) {
		styleTags = tags;
		styleName = name;
	}

	function handlePromptLoad(positive: string, negative: string) {
		directPrompt = positive;
		negativePrompt = negative;
	}

	async function handleFork(path: string) {
		try {
			const res = await forkOutputImage(path);
			inlineWorkflow = res.workflow;
			if (res.builtin_prompt) directPrompt = res.builtin_prompt;
			if (res.builtin_negative_prompt) negativePrompt = res.builtin_negative_prompt;
			if (res.default_width) width = res.default_width;
			if (res.default_height) height = res.default_height;
			workflowPath = '';
			workflowName = '(fork)';
			activeTab = 'generate';
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Fork 失败');
		}
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
			inline_workflow: inlineWorkflow || undefined,
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

	async function loadMyRecommendations() {
		try {
			const res = await fetchMyRecommendations();
			myRecommendations = res.items;
			myRecsLoaded = true;
		} catch {
			myRecommendations = [];
		}
	}

	async function handleRecommend(path: string) {
		try {
			await recommendImage(path);
			alert('自荐成功，等待管理员审核');
			loadMyRecommendations();
		} catch (e) {
			alert(e instanceof Error ? e.message : '自荐失败');
		}
	}

	function recStatusBadge(status: string) {
		switch (status) {
			case 'pending': return '⏳ 待审核';
			case 'approved': return '✅ 已通过';
			case 'rejected': return '❌ 已拒绝';
			default: return status;
		}
	}
</script>

<svelte:head>
	<title>AI 生图 - {siteConfig.title}</title>
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
			{#if workflowName || styleName}
				<span class="text-xs text-muted-foreground">
					{#if workflowName}{workflowName}{/if}{#if workflowName && styleName} / {/if}{#if styleName}{styleName}{/if}
				</span>
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
				<WorkflowDialog bind:value={workflowPath} onselect={handleWorkflowSelect} onpromptload={handlePromptLoad} />
				<StyleDialog bind:value={styleTags} onselect={handleStyleSelect} />
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

			<ResultGrid images={resultImages} onFork={handleFork} />
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
										type="button"
										class="aspect-square rounded-md overflow-hidden border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
										onclick={() => { myLbIndex = i; myLbOpen = true; }}
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

					<!-- 自荐区 -->
					<div class="space-y-2 mt-4">
						<h3 class="text-sm font-medium flex items-center gap-1.5">
							<Icon icon="mdi:star-plus-outline" class="size-4" />
							我的自荐
						</h3>
						{#if !myRecsLoaded}
							<Button variant="outline" size="sm" onclick={loadMyRecommendations}>加载自荐记录</Button>
						{:else if myRecommendations.length === 0}
							<div class="text-xs text-muted-foreground">暂无自荐记录</div>
						{:else}
							<div class="space-y-1.5">
								{#each myRecommendations as rec}
									<div class="flex items-center gap-2 text-xs">
										<img src={getImageProxyUrl(rec.image_path)} alt="" class="size-10 rounded object-cover border" />
										<span class="truncate flex-1">{rec.image_path}</span>
										<Badge variant={rec.status === "approved" ? "default" : rec.status === "rejected" ? "destructive" : "secondary"} class="text-[10px]">
											{recStatusBadge(rec.status)}
										</Badge>
									</div>
									{#if rec.admin_reason}
										<div class="text-[10px] text-muted-foreground ml-12">管理员: {rec.admin_reason}</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
					</div>
				{/if}
			{/if}
		</TabsContent>

		<!-- Featured Tab -->
		<TabsContent value="featured" class="mt-4">
			{#if activeTab === 'featured'}
				{#if !isLoggedIn}
					<Alert>
						<Icon icon="mdi:account-alert-outline" class="size-4" />
						<AlertDescription class="text-xs">
							请先<a href="/forum/auth/login" class="underline font-medium">登录论坛</a>查看精选图片。
						</AlertDescription>
					</Alert>
				{:else}
					<FeaturedTab onFork={handleFork} />
				{/if}
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

<ImageLightbox
	open={myLbOpen}
	images={myLbImages}
	index={myLbIndex}
	onclose={() => (myLbOpen = false)}
	onfork={handleFork}
	onrecommend={handleRecommend}
/>
