<script lang="ts">
	import '../app.css';
	import '../app.css';
	import { page } from '$app/stores';
	import { beforeNavigate, afterNavigate } from '$app/navigation';
	import { siteConfig } from '$lib/config/site';
	import BackToTop from '$lib/components/BackToTop.svelte';
	import NavBar from '$lib/components/NavBar.svelte';
	import Analytics from '$lib/components/Analytics.svelte';
	import CookieConsent from '$lib/components/CookieConsent.svelte';
	import ShortLinkRedirect from '$lib/components/ShortLinkRedirect.svelte';
	import DashLoader from '$lib/components/DashLoader.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();

	// 文章详情页自己输出 og:image / twitter:image / og:title 等，避免重复
	let isPostDetail = $derived(/^\/posts\/[^/]+\/?$/.test($page.url.pathname));
	let isHomePage = $derived($page.route.id === '/');

	let navigating = $state(false);

	beforeNavigate(() => { navigating = true; });
	afterNavigate(() => { setTimeout(() => { navigating = false; }, 500); });
</script>

<svelte:head>
	<title>{siteConfig.title}</title>
	<link rel="icon" href={siteConfig.icon} />
	<meta name="description" content={siteConfig.description} />
	<meta name="keywords" content={siteConfig.keywords.join(', ')} />
	<meta property="og:site_name" content={siteConfig.title} />
	<meta property="og:locale" content={siteConfig.lang} />
	{#if !isPostDetail}
		<meta property="og:type" content="website" />
		<meta property="og:url" content={siteConfig.url} />
		<meta property="og:title" content={siteConfig.title} />
		<meta property="og:description" content={siteConfig.description} />
		<meta property="og:image" content="{siteConfig.url}{siteConfig.ogImage}" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={siteConfig.title} />
		<meta name="twitter:description" content={siteConfig.description} />
		<meta name="twitter:image" content="{siteConfig.url}{siteConfig.ogImage}" />
	{/if}
	<link rel="canonical" href="{siteConfig.url}{$page.url.pathname}" />

	<!-- RSS Feed -->
	<link rel="alternate" type="application/rss+xml" title="{siteConfig.title} RSS Feed" href="/rss.xml" />
</svelte:head>

<NavBar />

<div
	class="fixed top-0 left-0 z-50 h-0.5 bg-primary transition-all duration-300 ease-out"
	class:opacity-0={!navigating}
	class:opacity-100={navigating}
	style="width: {navigating ? '95%' : '0%'};"
/>

<style>
</style>

<div class={isHomePage ? '' : 'pt-14'}>
	{@render children()}
</div>

<Footer />

<BackToTop />

<Analytics />

<CookieConsent />

<ShortLinkRedirect />

<DashLoader />

<Toast />
