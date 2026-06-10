<script lang="ts">
  import Icon from '@iconify/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { submitLora, getMyLoraSubmissions } from '$lib/draw/api/lora';
  import { fetchWorkflows } from '$lib/draw/api/client';
  import type { LoraApplication } from '$lib/draw/types';
  import { forumToast } from '$lib/forum/stores/toast';

  let {
    open = $bindable(false)
  }: {
    open?: boolean;
  } = $props();

  let url = $state('');
  let name = $state('');
  let category = $state('');
  let trigger = $state('');
  let type = $state('Anima');
  let submitting = $state(false);
  let showMySubs = $state(false);
  let mySubs = $state<LoraApplication[]>([]);
  let mySubsLoading = $state(false);
  let categories = $state<string[]>([]);

  async function loadCategories() {
    try {
      const res = await fetchWorkflows(type);
      categories = res.category_order;
    } catch {}
  }

  $effect(() => {
    if (open) {
      loadCategories();
      showMySubs = false;
      url = '';
      name = '';
      category = '';
      trigger = '';
    }
  });

  $effect(() => {
    void type;
    if (open) {
      category = '';
      loadCategories();
    }
  });

  async function handleSubmit() {
    if (!url.trim() || !name.trim() || !category.trim() || !trigger.trim()) {
      forumToast.add({ type: 'error', message: '请填写所有必填字段', duration: 3000 });
      return;
    }
    submitting = true;
    try {
      await submitLora({ url: url.trim(), name: name.trim(), category: category.trim(), trigger: trigger.trim(), type });
      forumToast.add({ type: 'success', message: '提交成功，等待管理员审核', duration: 3000 });
      open = false;
    } catch (e) {
      forumToast.add({ type: 'error', message: e instanceof Error ? e.message : '提交失败', duration: 3000 });
    } finally {
      submitting = false;
    }
  }

  async function loadMySubmissions() {
    mySubsLoading = true;
    try {
      const res = await getMyLoraSubmissions();
      mySubs = res.items;
      showMySubs = true;
    } catch (e) {
      forumToast.add({ type: 'error', message: e instanceof Error ? e.message : '加载失败', duration: 3000 });
    } finally {
      mySubsLoading = false;
    }
  }

  function statusBadge(status: string) {
    if (status === 'approved') return { variant: 'default' as const, label: '已通过' };
    if (status === 'rejected') return { variant: 'destructive' as const, label: '已拒绝' };
    return { variant: 'outline' as const, label: '待审核' };
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg max-w-full w-full p-0 gap-0">
    {#if showMySubs}
      <Dialog.Header class="p-4 pb-2 shrink-0 flex-row items-center justify-between gap-2">
        <button onclick={() => (showMySubs = false)} class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Icon icon="mdi:arrow-left" class="size-4" />
          返回
        </button>
        <Dialog.Title class="text-sm font-medium">我的 Lora 提交</Dialog.Title>
        <Dialog.Close>
          <Button variant="ghost" size="icon-sm"><Icon icon="mdi:close" class="size-4" /></Button>
        </Dialog.Close>
      </Dialog.Header>
      <div class="overflow-y-auto max-h-[60vh] p-4 pt-2 space-y-2">
        {#if mySubsLoading}
          <div class="text-xs text-muted-foreground text-center py-8">加载中...</div>
        {:else if mySubs.length === 0}
          <div class="text-xs text-muted-foreground text-center py-8">暂无提交记录</div>
        {:else}
          {#each mySubs as sub}
            <div class="border border-border rounded-lg p-3 space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{sub.name}</span>
                <Badge variant={statusBadge(sub.status).variant}>{statusBadge(sub.status).label}</Badge>
              </div>
              <div class="text-xs text-muted-foreground">
                {sub.type} · {sub.category}
                <span class="ml-2">{formatDate(sub.created_at)}</span>
              </div>
              {#if sub.status === 'rejected' && sub.admin_reason}
                <div class="text-xs text-destructive">原因：{sub.admin_reason}</div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {:else}
      <Dialog.Header class="p-4 pb-2 shrink-0 flex-row items-center justify-between gap-2">
        <Dialog.Title class="text-sm font-medium flex items-center gap-2">
          <Icon icon="mdi:plus-circle-outline" class="size-4" />
          提交您的Lora（ByoLora）
        </Dialog.Title>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" class="text-xs h-7" onclick={loadMySubmissions}>
            <Icon icon="mdi:history" class="size-3.5 mr-1" />
            我的提交
          </Button>
          <Dialog.Close>
            <Button variant="ghost" size="icon-sm"><Icon icon="mdi:close" class="size-4" /></Button>
          </Dialog.Close>
        </div>
      </Dialog.Header>
      <div class="overflow-y-auto p-4 pt-2 space-y-3">
        <div class="space-y-1.5">
          <Label class="text-xs">Lora 链接 <span class="text-destructive">*</span></Label>
          <Input bind:value={url} placeholder="https://civitai.red/models/2677495/neverness-to-everness-lacrimosa-anima" class="h-8 text-xs" />
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">显示名称 <span class="text-destructive">*</span></Label>
          <Input bind:value={name} placeholder="安魂曲" class="h-8 text-xs" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label class="text-xs">分类 <span class="text-destructive">*</span></Label>
            <Select.Root bind:value={category}>
              <Select.Trigger class="w-full h-8 text-xs">
                {#if category}
                  {category}
                {:else}
                  <span class="text-muted-foreground">选择分类</span>
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each categories as cat}
                  <Select.Item value={cat} label={cat} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
          <div class="space-y-1.5">
            <Label class="text-xs">类型 <span class="text-destructive">*</span></Label>
            <Select.Root bind:value={type}>
              <Select.Trigger class="w-full h-8 text-xs">
                {#if type}
                  {type}
                {:else}
                  <span class="text-muted-foreground">选择类型</span>
                {/if}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="WAI" label="WAI" />
                <Select.Item value="Anima" label="Anima" />
              </Select.Content>
            </Select.Root>
          </div>
        </div>
        <div class="space-y-1.5">
          <Label class="text-xs">触发词 <span class="text-destructive">*</span></Label>
          <Input bind:value={trigger} placeholder="anhunqu" class="h-8 text-xs" />
        </div>
      </div>
      <div class="p-4 pt-0 flex flex-col gap-2">
        <Button onclick={handleSubmit} disabled={submitting} class="w-full h-8 text-xs">
          {#if submitting}
            <Icon icon="mdi:loading" class="size-3.5 animate-spin mr-1" />
          {/if}
          提交审核
        </Button>
        <p class="text-[10px] text-muted-foreground text-center">提交后需管理员审核，审核通过后自动创建 Lora 工作流</p>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
