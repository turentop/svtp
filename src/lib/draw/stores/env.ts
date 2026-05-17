import type { DrawApiEnv } from '../types';
import type { Readable, Writable } from 'svelte/store';
import { readLocalStorage, writeLocalStorage } from '$lib/forum/utils/storage';
import { derived, get, writable } from 'svelte/store';

export const DRAW_API_ENV_STORAGE_KEY = 'draw-api-env';
export const DRAW_API_CUSTOM_BASE_URL_STORAGE_KEY = 'draw-api-custom-base-url';

/** 全局 API 错误状态：当 drawRequest 彻底失败时设置 */
export const apiError = writable<string | null>(null);

export type ApiStatus = 'checking' | 'online' | 'offline';
export const apiStatus = writable<ApiStatus>('checking');

// apiError 和 apiStatus 同步：错误时离线，允许下次重新检测
apiError.subscribe(v => {
	if (v) {
		apiStatus.set('offline');
		_redirectResolved = false; // 下次尝试重新检测
	}
});

export const DRAW_API_BASE_URLS: Record<DrawApiEnv, string> = {
	prod: 'https://api-ai.2x.nz',
	dev: 'http://localhost:8080'
};

function normalizeBaseUrl(value: string) {
	return value.trim().replace(/\/+$/, '');
}

function normalizeEnv(value: DrawApiEnv | string | null | undefined): DrawApiEnv {
	return value === 'dev' ? 'dev' : 'prod';
}

function sanitizeBaseUrl(value: string | null | undefined, env: DrawApiEnv) {
	const v = normalizeBaseUrl(value || '');
	if (!v) return DRAW_API_BASE_URLS[env];
	try {
		const url = new URL(v);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return DRAW_API_BASE_URLS[env];
		}
		return normalizeBaseUrl(url.toString());
	} catch {
		return DRAW_API_BASE_URLS[env];
	}
}

interface DrawCustomBaseUrlStore {
	subscribe: Writable<string>['subscribe'];
	set(value: string): void;
	reset(env: DrawApiEnv): void;
}

interface DrawEnvStore {
	subscribe: Writable<DrawApiEnv>['subscribe'];
	baseUrl: Readable<string>;
	customBaseUrl: DrawCustomBaseUrlStore;
	set(value: DrawApiEnv): void;
	toggle(): void;
	getBaseUrl(env: DrawApiEnv): string;
}

function createEnvStore(): DrawEnvStore {
	const initialEnv = normalizeEnv(
		readLocalStorage<DrawApiEnv | string>(DRAW_API_ENV_STORAGE_KEY, 'prod')
	);
	const envStore = writable<DrawApiEnv>(initialEnv);
	const customBaseUrlStore = writable<string>(DRAW_API_BASE_URLS[initialEnv]);

	const baseUrl = derived([envStore, customBaseUrlStore], ([$env, $custom]) =>
		sanitizeBaseUrl($custom, $env)
	);

	return {
		subscribe: envStore.subscribe,
		baseUrl,
		customBaseUrl: {
			subscribe: customBaseUrlStore.subscribe,
			set: (v) => customBaseUrlStore.set(sanitizeBaseUrl(v, get(envStore))),
			reset: (env) => customBaseUrlStore.set(DRAW_API_BASE_URLS[env])
		},
		set: (v) => {
			const next = normalizeEnv(v);
			writeLocalStorage(DRAW_API_ENV_STORAGE_KEY, next);
			envStore.set(next);
			customBaseUrlStore.set(DRAW_API_BASE_URLS[next]);
		},
		toggle: () => {
			let next: DrawApiEnv = 'prod';
			envStore.update((cur) => {
				next = cur === 'prod' ? 'dev' : 'prod';
				writeLocalStorage(DRAW_API_ENV_STORAGE_KEY, next);
				return next;
			});
			customBaseUrlStore.set(DRAW_API_BASE_URLS[next]);
		},
		getBaseUrl: (env) => DRAW_API_BASE_URLS[env]
	};
}

export const drawEnv: DrawEnvStore = createEnvStore();

/**
 * 探测 API 端点是否有重定向（CDN / 负载均衡），
 * 每次调用都发起请求，不缓存。
 */
let _redirectResolved = false;

export async function resolveApiRedirect(force = false): Promise<void> {
	if (_redirectResolved && !force) return;
	apiStatus.set('checking');
	const baseUrl = get(drawEnv.baseUrl);
	try {
		const resp = await fetch(baseUrl, { method: 'HEAD' });
		const finalUrl = resp.url.replace(/\/+$/, '');
		if (finalUrl !== baseUrl) {
			drawEnv.customBaseUrl.set(finalUrl);
		}
		_redirectResolved = true;
		apiStatus.set('online');
		apiError.set(null);
	} catch (e) {
		apiStatus.set('offline');
	}
}
