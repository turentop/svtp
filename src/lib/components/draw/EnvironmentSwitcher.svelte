<script lang="ts">
  import { get } from 'svelte/store';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Icon from '@iconify/svelte';
  import { DRAW_API_BASE_URLS, drawEnv } from '$lib/draw/stores/env';

  const initialEnv = get(drawEnv);
  let currentEnv = $state(initialEnv);
  let customBaseUrl = $state(DRAW_API_BASE_URLS[initialEnv]);
  let currentBaseUrl = $state(DRAW_API_BASE_URLS[initialEnv]);
  let open = $state(false);

  $effect(() => {
    const u1 = drawEnv.subscribe((v) => (currentEnv = v));
    const u2 = drawEnv.customBaseUrl.subscribe((v) => (customBaseUrl = v));
    const u3 = drawEnv.baseUrl.subscribe((v) => (currentBaseUrl = v));
    return () => {
      u1();
      u2();
      u3();
    };
  });

  function toggleEnv() {
    drawEnv.toggle();
  }
  function applyCustomBaseUrl() {
    drawEnv.customBaseUrl.set(customBaseUrl);
  }
  function resetBaseUrl() {
    drawEnv.customBaseUrl.reset(currentEnv);
  }
</script>

<details
  class="rounded-lg border bg-muted/30 text-sm group"
  bind:open
>
  <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
    <div class="flex items-center gap-2 font-medium">
      <Icon icon="mdi:cloud-sync-outline" class="size-5 text-primary" />
      <span>高级设置</span>
    </div>
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <span>生图环境：{currentEnv === 'prod' ? '生产' : '开发'}</span>
      <Icon
        icon="mdi:chevron-down"
        class="size-5 transition-transform {open ? 'rotate-180' : ''}"
      />
    </div>
  </summary>
  <div class="space-y-3 border-t px-4 py-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium">生图环境</span>
      <Button
        size="sm"
        variant={currentEnv === 'prod' ? 'default' : 'outline'}
        onclick={toggleEnv}
      >
        {currentEnv === 'prod' ? '生产' : '开发'}
      </Button>
      <span class="text-xs text-muted-foreground break-all">当前：{currentBaseUrl}</span>
    </div>
    <div class="flex flex-col gap-2 md:flex-row md:items-center">
      <Input
        bind:value={customBaseUrl}
        placeholder="手动输入生图 API baseURL，例如 http://localhost:8080"
        class="min-w-0 flex-1"
      />
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={applyCustomBaseUrl}>应用</Button>
        <Button variant="ghost" size="sm" onclick={resetBaseUrl}>重置</Button>
      </div>
    </div>
  </div>
</details>

<style>
  summary::-webkit-details-marker {
    display: none;
  }
</style>
