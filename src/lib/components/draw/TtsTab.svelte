<script lang="ts">
import Icon from '@iconify/svelte';
import { Button } from '$lib/components/ui/button';
import { Label } from '$lib/components/ui/label';
import { Alert, AlertDescription } from '$lib/components/ui/alert';
import { forumAuth } from '$lib/forum/stores/auth';
import { generateTts, fetchTtsStatus, getTtsResultUrl } from '$lib/draw/api/client';
import { Badge } from '$lib/components/ui/badge';

let { ttsPerChar = 0.01, ttsPerSec = 0.033 }: { ttsPerChar?: number; ttsPerSec?: number } = $props();

let audioFile = $state<File | null>(null);
let audioUrl = $state('');
let audioDuration = $state(0);

let estimatedCost = $derived(Math.max(1, Math.ceil(targetText.length * ttsPerChar) + Math.ceil(audioDuration * ttsPerSec)));
let costLabel = $derived(estimatedCost > 0 ? `⚡${estimatedCost}~` : '');
let refText = $state('');
let targetText = $state('');
let xVectorMode = $state(false);
let language = $state('auto');
let submitting = $state(false);
let error = $state('');
let queueItemId = $state<number | null>(null);
let queueStatus = $state('');
let queuePosition = $state<number | null>(null);
let queueError = $state('');
let pollTimer: ReturnType<typeof setInterval> | null = null;
let resultUrl = $state('');
let done = $state(false);

function handleFileSelect(e: Event) {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;
	audioFile = file;
	audioUrl = URL.createObjectURL(file);
	const temp = new Audio(audioUrl);
	temp.addEventListener('loadedmetadata', () => {
		audioDuration = temp.duration;
	}, { once: true });
}

async function handleSubmit() {
	if (submitting || !audioFile || !targetText) return;
	if (!xVectorMode && !refText.trim()) {
		error = '非 X-Vector 模式下参考文本为必填项';
		return;
	}
	error = '';
	queueStatus = '';
	queueError = '';
	resultUrl = '';
	done = false;
	submitting = true;
	try {
		const fd = new FormData();
		fd.append('audio', audioFile);
		fd.append('text', targetText);
		if (refText) fd.append('ref_text', refText);
		fd.append('x_vector_mode', String(xVectorMode));
		fd.append('language', language);
		fd.append('audio_duration', String(audioDuration));
		const res = await generateTts(fd);
		queueItemId = res.item_id;
		queueStatus = 'pending';
		pollTimer = setInterval(pollStatus, 2000);
	} catch (e: unknown) {
		error = e instanceof Error ? e.message : '提交失败';
	} finally {
		submitting = false;
	}
}

async function pollStatus() {
	if (queueItemId === null) return;
	try {
		const st = await fetchTtsStatus(queueItemId);
		queueStatus = st.status;
		queuePosition = st.position ?? null;
		if (st.status === 'done') {
			if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
			resultUrl = getTtsResultUrl(queueItemId);
			done = true;
		} else if (st.status === 'failed') {
			if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
			queueError = st.error || '生成失败';
		}
	} catch {
		if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	}
}

function handleReset() {
	if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
	queueItemId = null;
	queueStatus = '';
	queuePosition = null;
	queueError = '';
	resultUrl = '';
	done = false;
	error = '';
}

function statusLabel(s: string): string {
	switch (s) {
		case 'pending': return '排队中';
		case 'running': return '转换中';
		case 'done': return '完成';
		case 'failed': return '失败';
		default: return s;
	}
}
</script>

<div class="space-y-4">
	<h3 class="text-sm font-medium flex items-center gap-1.5">
		<Icon icon="mdi:voice" class="size-4" />
		语音克隆 (TTS)
	</h3>

	<!-- 上传参考音频 -->
	<div class="space-y-1.5">
		<Label for="tts-audio">参考音频</Label>
		<input
			id="tts-audio"
			type="file"
			accept="audio/*"
			onchange={handleFileSelect}
			class="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
		/>
		{#if audioFile}
			<div class="text-xs text-muted-foreground">{audioFile.name} ({(audioFile.size / 1024).toFixed(1)} KB)</div>
			<audio src={audioUrl} controls class="w-full h-10 mt-1" />
		{/if}
	</div>

	<!-- 参考文本（可选） -->
	<div class="space-y-1.5">
		<Label for="tts-reftext">参考文本 <span class="text-muted-foreground text-[10px]">(可选，ICL 模式需要)</span></Label>
		<textarea
			id="tts-reftext"
			bind:value={refText}
			rows={2}
			placeholder="输入参考音频对应的文本（非 X-Vector 模式下建议填写）"
			class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground resize-none"
		></textarea>
	</div>

	<!-- X-Vector 模式 -->
	<div class="flex items-center gap-2">
		<input id="tts-xvec" type="checkbox" bind:checked={xVectorMode} class="size-4 accent-primary" />
		<Label for="tts-xvec" class="text-xs">X-Vector 模式（仅提取音色，忽略参考文本）</Label>
	</div>

	<!-- 语言 -->
	<div class="space-y-1.5">
		<Label for="tts-lang">语言</Label>
		<select id="tts-lang" bind:value={language} class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs">
			<option value="auto">自动检测</option>
			<option value="zh">中文</option>
			<option value="en">英文</option>
			<option value="ja">日文</option>
			<option value="ko">韩文</option>
		</select>
	</div>

	<!-- 目标文本 -->
	<div class="space-y-1.5">
		<Label for="tts-text">要克隆的文字</Label>
		<textarea
			id="tts-text"
			bind:value={targetText}
			rows={3}
			placeholder="输入要合成语音的文字内容"
			class="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground resize-none"
		></textarea>
	</div>

	<!-- 提交 -->
	<Button onclick={handleSubmit} disabled={submitting || !audioFile || !targetText || !!queueItemId} class="w-full">
		<Icon icon="mdi:send" class="size-4 mr-1" />
		{submitting ? '提交中...' : queueItemId ? '已加入队列' : '开始转换'}
		{#if !queueItemId && estimatedCost > 0}
			<Badge variant="secondary" class="ml-1.5 text-[10px] px-1">{costLabel}</Badge>
		{/if}
	</Button>

	<!-- 错误 -->
	{#if error}
		<Alert variant="destructive">
			<Icon icon="mdi:alert-circle" class="size-4" />
			<AlertDescription class="text-xs">{error}</AlertDescription>
		</Alert>
	{/if}

	<!-- 队列状态 -->
	{#if queueItemId && !done && !queueError}
		<div class="flex items-center gap-2 text-xs border rounded-lg px-3 py-2">
			<Icon icon="mdi:loading" class="size-4 animate-spin text-primary" />
			<span class="flex-1">
				{statusLabel(queueStatus)}
				{#if queueStatus === 'pending' && queuePosition != null}
					，前面还有 {queuePosition - 1} 位
				{/if}
			</span>
		</div>
	{/if}

	<!-- 失败 -->
	{#if queueError}
		<Alert variant="destructive">
			<Icon icon="mdi:alert-circle" class="size-4" />
			<AlertDescription class="text-xs">{queueError}</AlertDescription>
		</Alert>
		<Button variant="outline" size="sm" onclick={handleReset} class="mt-2">重新开始</Button>
	{/if}

	<!-- 结果 -->
	{#if done && resultUrl}
		<div class="space-y-2 border rounded-lg p-3">
			<div class="text-xs font-medium flex items-center gap-1.5">
				<Icon icon="mdi:check-circle" class="size-4 text-green-500" />
				转换完成
			</div>
			<audio src={resultUrl} controls class="w-full h-10" />
			<div class="flex gap-2">
				<a href={resultUrl} download class="flex-1">
					<Button variant="default" size="sm" class="w-full">
						<Icon icon="mdi:download" class="size-4 mr-1" />
						下载 WAV
					</Button>
				</a>
				<Button variant="outline" size="sm" onclick={handleReset}>重新开始</Button>
			</div>
		</div>
	{/if}
</div>
