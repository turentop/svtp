<script lang="ts">
import Icon from '@iconify/svelte';
import { Button } from '$lib/components/ui/button';
import { Alert, AlertDescription } from '$lib/components/ui/alert';
import { Badge } from '$lib/components/ui/badge';
import { chatRequest, addToQueue, fetchMyQueue, getImageProxyUrl } from '$lib/draw/api/client';

let {
	workflowPath = '',
	styleTags = '',
	negativePrompt = '',
	width = 0,
	height = 0,
	turnstileToken = '',
	pointsCostSubmit = 0,
}: {
	workflowPath?: string;
	styleTags?: string;
	negativePrompt?: string;
	width?: number;
	height?: number;
	turnstileToken?: string;
	pointsCostSubmit?: number;
} = $props();

const PRESETS_KEY = 'chat_presets_v1';

interface ChatPreset {
	name: string;
	systemPrompt: string;
}

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
	streaming?: boolean;
}

let presets = $state<ChatPreset[]>([]);
let selectedPresetIdx = $state<number>(-1);
let presetName = $state('');
let systemPrompt = $state('');
let chatMessages = $state<ChatMessage[]>([]);
let chatHistory = $state<Array<{ role: string; content: string }>>([]);
let inputText = $state('');
let sending = $state(false);
let settingsOpen = $state(true);
let errorText = $state('');
let genEnabled = $state(true);
let helpOpen = $state(false);

// 消耗统计
let totalLlmCost = $state(0);
let totalLlmTokens = $state(0);
let totalGenCount = $state(0);
let totalGenCost = $state(0);

// 生图队列跟踪：item_id → { tags, status, imageUrl }
let genJobs = $state<Map<number, { tags: string; status: string; imageUrl: string }>>(new Map());

function loadPresets(): ChatPreset[] {
	try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); }
	catch { return []; }
}

function savePresets(list: ChatPreset[]) {
	localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

$effect(() => { presets = loadPresets(); });

function selectPreset(idx: number) {
	selectedPresetIdx = idx;
	if (idx >= 0 && presets[idx]) {
		presetName = presets[idx].name;
		systemPrompt = presets[idx].systemPrompt;
	} else {
		presetName = '';
		systemPrompt = '';
	}
}

function savePreset() {
	if (!presetName.trim() || !systemPrompt.trim()) return;
	const list = [...presets];
	const existing = list.findIndex(p => p.name === presetName.trim());
	const entry: ChatPreset = { name: presetName.trim(), systemPrompt: systemPrompt.trim() };
	if (existing >= 0) list[existing] = entry;
	else list.push(entry);
	presets = list;
	savePresets(list);
	selectedPresetIdx = list.findIndex(p => p.name === presetName.trim());
}

function deletePreset() {
	if (selectedPresetIdx < 0 || !presets[selectedPresetIdx]) return;
	const list = presets.filter((_, i) => i !== selectedPresetIdx);
	presets = list;
	savePresets(list);
	selectedPresetIdx = -1;
	presetName = '';
	systemPrompt = '';
}

function newPreset() {
	selectedPresetIdx = -1;
	presetName = '';
	systemPrompt = '';
}

function clearChat() {
	chatMessages = [];
	chatHistory = [];
	genJobs = new Map();
}

async function submitGenJob(tags: string) {
	// 和文生图完全一样的提交逻辑，只替换 prompt
	let finalWfPath = workflowPath;
	if (finalWfPath.endsWith('.txt')) {
		finalWfPath = 'WAI/通用/无Lora.json';
	}

	try {
		const res = await addToQueue({
			direct_prompt: tags,
			width: width || undefined,
			height: height || undefined,
			style_tags: styleTags || undefined,
			negative_prompt: negativePrompt || undefined,
			workflow_path: finalWfPath,
			turnstile_token: turnstileToken || undefined,
		});
		genJobs = new Map(genJobs).set(res.item_id, { tags, status: 'pending', imageUrl: '' });
		totalGenCount++;
		totalGenCost += pointsCostSubmit;
		startQueuePolling();
		return res.item_id;
	} catch (e: any) {
		return null;
	}
}

async function sendMessage() {
	const msg = inputText.trim();
	if (!msg || sending) return;
	if (!systemPrompt.trim()) { errorText = '请先填写角色设定'; return; }
	if (!workflowPath) { errorText = '请先在文生图页选择工作流'; return; }
	errorText = '';
	sending = true;

	chatMessages = [...chatMessages, { role: 'user', content: msg }];
	inputText = '';

	const assistantIdx = chatMessages.length;
	chatMessages = [...chatMessages, { role: 'assistant', content: '', streaming: true }];

	try {
		const response = await chatRequest({
			message: msg,
			workflow_path: workflowPath || undefined,
			style_tags: styleTags || undefined,
			system_prompt: systemPrompt,
			negative_prompt: negativePrompt || 'worst quality, low quality, blurry',
			history: chatHistory,
			gen_enabled: genEnabled,
		});

		const reader = response.body?.getReader();
		if (!reader) throw new Error('无法读取响应流');
		const decoder = new TextDecoder();
		let buffer = '';
		let textContent = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			while (true) {
				const newlineIdx = buffer.indexOf('\n');
				if (newlineIdx === -1) break;
				const line = buffer.slice(0, newlineIdx).trim();
				buffer = buffer.slice(newlineIdx + 1);

				if (line.startsWith('event: ')) {
					const eventType = line.slice(7).trim();
					const nextNewline = buffer.indexOf('\n');
					if (nextNewline === -1) { buffer = line + '\n' + buffer; break; }
					const dataLine = buffer.slice(0, nextNewline).trim();
					buffer = buffer.slice(nextNewline + 1);

					if (dataLine.startsWith('data: ')) {
						try {
							const data = JSON.parse(dataLine.slice(6));
							if (eventType === 'text' && data.content) {
								textContent += data.content;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: textContent, streaming: true } : m
								);
							} else if (eventType === 'gen_tags' && genEnabled && data.tags?.length) {
								// 逐个提交生图
								for (const tags of data.tags) {
									textContent += `\n🎨 正在提交: ${tags.slice(0, 40)}...`;
									chatMessages = chatMessages.map((m, i) =>
										i === assistantIdx ? { ...m, content: textContent, streaming: true } : m
									);
									await submitGenJob(tags);
								}
							} else if (eventType === 'error') {
								textContent += `\n❌ ${data.message}`;
								chatMessages = chatMessages.map((m, i) =>
									i === assistantIdx ? { ...m, content: textContent } : m
								);
							} else if (eventType === 'done') {
								if (data.llm_cost) totalLlmCost += data.llm_cost;
								if (data.llm_tokens) totalLlmTokens += data.llm_tokens;
							}
						} catch {}
					}
				}
			}
		}

		chatMessages = chatMessages.map((m, i) =>
			i === assistantIdx ? { ...m, streaming: false } : m
		);

		chatHistory = [...chatHistory, { role: 'user', content: msg }, { role: 'assistant', content: textContent }];
		if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);
	} catch (e: any) {
		chatMessages = chatMessages.map((m, i) =>
			i === assistantIdx ? { ...m, content: `❌ ${e.message || '请求失败'}`, streaming: false } : m
		);
	}
	sending = false;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollRunning = false;

function startQueuePolling() {
	if (pollTimer) return;
	pollRunning = true;
	pollTimer = setInterval(async () => {
		const pending = [...genJobs.entries()].filter(([, v]) => v.status === 'pending' || v.status === 'waiting' || v.status === 'running');
		if (pending.length === 0) { stopQueuePolling(); return; }
		try {
			const res = await fetchMyQueue();
			for (const item of res.items) {
				const job = genJobs.get(item.id);
				if (!job) continue;
				if (item.status === 'done') {
					// 用 _output_files 构造图片 URL
					const files = (item as any)._output_files as string[] | undefined;
					let imageUrl = '';
					if (files?.length) {
						const f = files[0];
						const parts = f.split('/');
						const filename = parts.pop()!;
						const subfolder = parts.join('/');
						imageUrl = getImageProxyUrl(filename, subfolder);
					}
					genJobs = new Map(genJobs).set(item.id, { ...job, status: 'done', imageUrl });
				} else if (item.status === 'failed') {
					genJobs = new Map(genJobs).set(item.id, { ...job, status: 'failed' });
				} else if (item.status !== job.status) {
					genJobs = new Map(genJobs).set(item.id, { ...job, status: item.status });
				}
			}
		} catch {}
	}, 3000);
}

function stopQueuePolling() {
	if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	pollRunning = false;
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

let chatContainer: HTMLDivElement | undefined;
$effect(() => {
	if (chatMessages.length && chatContainer) {
		requestAnimationFrame(() => { if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight; });
	}
});
</script>

<div class="flex flex-col h-[calc(100vh-260px)] min-h-[400px]">
	<!-- 设定区 -->
	<div class="border rounded-lg bg-card mb-3">
		<button
			class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
			onclick={() => settingsOpen = !settingsOpen}
		>
			<span class="flex items-center gap-1.5">
				<Icon icon="mdi:cog-outline" class="size-4" />
				角色扮演设定
				{#if presetName}
					<Badge variant="secondary" class="text-[10px]">{presetName}</Badge>
				{/if}
			</span>
			<Icon icon={settingsOpen ? "mdi:chevron-up" : "mdi:chevron-down"} class="size-4 text-muted-foreground" />
		</button>

		{#if settingsOpen}
			<div class="px-3 pb-3 space-y-2 border-t pt-2">
				<div class="flex gap-2">
					<select
						class="flex-1 h-8 text-xs border rounded px-2 bg-background"
						value={selectedPresetIdx}
						onchange={(e) => selectPreset(Number(e.currentTarget.value))}
					>
						<option value={-1}>-- 选择或新建 --</option>
						{#each presets as p, i}
							<option value={i}>{p.name}</option>
						{/each}
					</select>
					{#if selectedPresetIdx >= 0}
						<Button variant="outline" size="sm" class="h-8 px-2 text-xs text-destructive" onclick={deletePreset}>
							<Icon icon="mdi:delete-outline" class="size-3.5" />
						</Button>
					{/if}
				</div>
				<input type="text" class="w-full h-8 text-xs border rounded px-2 bg-background" placeholder="给这个角色设定起个名字" bind:value={presetName} />
				<textarea class="w-full text-xs border rounded px-2 py-1.5 bg-background resize-none" rows="3" placeholder="你正在扮演遐蝶。你是一个..." bind:value={systemPrompt}></textarea>
				<div class="flex gap-2">
					<Button variant="default" size="sm" class="h-7 text-xs" onclick={savePreset}>
						<Icon icon="mdi:content-save-outline" class="size-3.5 mr-1" />保存预设
					</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs" onclick={newPreset}>新建</Button>
					<Button variant="outline" size="sm" class="h-7 text-xs ml-auto" onclick={clearChat}>
						<Icon icon="mdi:chat-remove-outline" class="size-3.5 mr-1" />清空聊天
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- 聊天消息区 -->
	<div bind:this={chatContainer} class="flex-1 overflow-y-auto space-y-3 px-1 pb-3">
		{#if chatMessages.length === 0}
			<div class="flex items-center justify-center h-full text-muted-foreground text-sm">开始与角色对话吧</div>
		{/if}
		{#each chatMessages as msg, i}
			<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
				<div class="max-w-[80%] {msg.role === 'user'
					? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
					: 'bg-muted rounded-2xl rounded-bl-sm'
				} px-3 py-2 text-sm whitespace-pre-wrap break-words">
					{msg.content}
					{#if msg.streaming}
						<span class="animate-pulse">|</span>
					{/if}
				</div>
			</div>
		{/each}

		<!-- 生图结果 -->
		{#if genJobs.size > 0}
			<div class="flex flex-wrap gap-2 px-1">
				{#each [...genJobs.entries()] as [id, job]}
					<div class="border rounded-lg p-2 text-xs bg-card max-w-[200px]">
						<div class="text-muted-foreground mb-1 truncate" title={job.tags}>{job.tags.slice(0, 50)}</div>
						{#if job.status === 'done' && job.imageUrl}
							<a href={job.imageUrl} target="_blank" rel="noopener">
								<img src={job.imageUrl} alt="" class="w-full rounded" loading="lazy" />
							</a>
						{:else if job.status === 'failed'}
							<span class="text-destructive">❌ 生图失败</span>
						{:else}
							<span class="text-muted-foreground">
								<Icon icon="mdi:loading" class="size-3 animate-spin inline" />
								{job.status === 'pending' ? '排队中' : job.status === 'waiting' ? '等待中' : '生图中'}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- 输入区 -->
	<div class="flex gap-2 pt-2 border-t items-center">
		<!-- 生图开关 + 帮助 -->
		<div class="flex h-9 border rounded overflow-hidden">
			<button
				class="flex items-center gap-1 px-2 text-xs transition-colors {genEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}"
				onclick={() => genEnabled = !genEnabled}
				title={genEnabled ? '生图已开启，点击关闭' : '生图已关闭，点击开启'}
			>
				<Icon icon="mdi:image-outline" class="size-4" />
				<span class="hidden sm:inline">{genEnabled ? '生图' : '纯聊'}</span>
			</button>
			<button
				class="flex items-center justify-center w-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-l"
				onclick={() => helpOpen = true}
				title="使用帮助"
			>
				?
			</button>
		</div>
		<input type="text" class="flex-1 h-9 text-sm border rounded px-3 bg-background" placeholder={genEnabled ? '输入消息，AI 会边聊边生图...' : '输入消息...'} bind:value={inputText} onkeydown={handleKeydown} disabled={sending} />
		<Button variant="default" size="sm" class="h-9 px-4" onclick={sendMessage} disabled={sending || !inputText.trim()}>
			{#if sending}
				<Icon icon="mdi:loading" class="size-4 animate-spin" />
			{:else}
				<Icon icon="mdi:send" class="size-4" />
			{/if}
		</Button>
	</div>

	{#if errorText}
		<Alert variant="destructive" class="mt-2">
			<Icon icon="mdi:alert-circle" class="size-4" />
			<AlertDescription class="text-xs">{errorText}</AlertDescription>
		</Alert>
	{/if}

	{#if totalLlmCost > 0 || totalGenCount > 0}
		<div class="flex items-center gap-3 text-[10px] text-muted-foreground pt-1.5 border-t mt-1.5">
			<span>本次消耗：</span>
			{#if totalLlmCost > 0}
				<span>💬 LLM {totalLlmTokens} tokens / {totalLlmCost} 点</span>
			{/if}
			{#if totalGenCount > 0}
				<span>🎨 生图 ×{totalGenCount} / {totalGenCost} 点</span>
			{/if}
			<span class="font-medium text-foreground">共 {totalLlmCost + totalGenCost} 点</span>
		</div>
	{/if}
</div>

<!-- 帮助弹窗 -->
{#if helpOpen}
	<div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onclick={() => helpOpen = false}>
		<div class="bg-card rounded-lg shadow-xl max-w-md w-full p-5 space-y-3" onclick={(e) => e.stopPropagation()}>
			<h3 class="text-lg font-bold">酒馆使用说明</h3>
			<div class="text-sm text-muted-foreground space-y-2">
				<p><strong>酒馆</strong>是一个角色扮演聊天功能，AI 会扮演你设定的角色与你对话。</p>
				<p><strong>生图开关</strong>：开启后，AI 会在对话中自动插入生图指令，每句话都会生成一张图片（消耗生图点数）。关闭后为纯文字聊天。</p>
				<p><strong>使用步骤</strong>：</p>
				<ol class="list-decimal pl-4 space-y-1">
					<li>在上方「角色设定」中填写角色名和 System Prompt（角色性格、背景等）</li>
					<li>在「文生图」页选择好工作流、画风、分辨率（生图会继承这些设置）</li>
					<li>开始聊天，AI 会以角色身份回复</li>
				</ol>
				<p><strong>计费</strong>：聊天按 LLM token 消耗点数，生图按次扣费。</p>
			</div>
			<button class="w-full py-2 bg-primary text-primary-foreground rounded text-sm" onclick={() => helpOpen = false}>知道了</button>
		</div>
	</div>
{/if}
