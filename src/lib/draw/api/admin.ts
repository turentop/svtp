import { drawRequest } from './client';
import type {
	AdminRecentImage,
	AdminReport,
	AdminLimits,
	AdminAnnouncement,
	AdminGcResult,
	AdminLlmConfig,
	DrawRecommendation,
	Nomination
} from '../types';

// --- Featured ---

export async function getFeatured() {
	return drawRequest<{ items: string[] }>('/api/draw/admin/featured');
}

export async function addFeatured(path: string) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/add', {
		method: 'POST',
		json: { path }
	});
}

export async function removeFeatured(path: string) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/remove', {
		method: 'POST',
		json: { path }
	});
}

export async function reorderFeatured(items: string[]) {
	return drawRequest<{ ok: boolean; items: string[] }>('/api/draw/admin/featured/reorder', {
		method: 'POST',
		json: { items }
	});
}

// --- Limits ---

export async function getLimits() {
	return drawRequest<{ limits: AdminLimits; defaults: AdminLimits }>('/api/draw/admin/limits');
}

export async function updateLimits(partial: Partial<AdminLimits>) {
	return drawRequest<{ ok: boolean; limits: AdminLimits }>('/api/draw/admin/limits', {
		method: 'POST',
		json: partial
	});
}

// --- Recent Images ---

export async function getRecentImages(limit = 200, offset = 0) {
	return drawRequest<{
		items: AdminRecentImage[];
		total: number;
		limit: number;
		offset: number;
	}>('/api/draw/admin/recent', { query: { limit, offset } });
}

export async function getImagesByUser(userId: number) {
	return drawRequest<{ items: AdminRecentImage[]; total: number }>(
		'/api/draw/admin/images_by_user',
		{ query: { user_id: userId } }
	);
}

// --- Delete ---

export async function deleteImage(path: string) {
	return drawRequest<{ ok: boolean }>('/api/draw/admin/delete', {
		method: 'DELETE',
		json: { path }
	});
}

export async function deleteImages(paths: string[]) {
	return drawRequest<{ ok: boolean; deleted: number; failed: number }>(
		'/api/draw/admin/delete_batch',
		{ method: 'POST', json: { paths } }
	);
}

// --- Reports ---

export async function getReports() {
	return drawRequest<{ reports: AdminReport[]; total: number }>('/api/draw/admin/reports');
}

export async function resolveReport(
	reportId: string,
	action: 'delete' | 'ban_creator' | 'ban_reporter' | 'dismiss'
) {
	return drawRequest<{ ok: boolean; action: string }>('/api/draw/admin/report/resolve', {
		method: 'POST',
		json: { report_id: reportId, action }
	});
}

// --- Announcement ---

export async function getAnnouncement() {
	return drawRequest<{ announcement: AdminAnnouncement }>('/api/draw/admin/announcement');
}

export async function updateAnnouncement(partial: Partial<AdminAnnouncement>) {
	return drawRequest<{ ok: boolean; announcement: AdminAnnouncement }>(
		'/api/draw/admin/announcement',
		{ method: 'POST', json: partial }
	);
}

// --- Banned Users ---

export async function getBannedUsers() {
	return drawRequest<{ banned: BanEntry[] }>('/api/draw/admin/draw-banned');
}

export interface BanEntry {
	user_id: number;
	reason: string;
	banned_at: number;
	banned_until: number;
	remaining_days: number;
}

export async function banUser(userId: number, days: number, reason: string) {
	return drawRequest<{ ok: boolean; banned: BanEntry[] }>('/api/draw/admin/draw-ban', {
		method: 'POST',
		json: { user_id: userId, days, reason }
	});
}

export async function unbanUser(userId: number) {
	return drawRequest<{ ok: boolean; banned: BanEntry[] }>('/api/draw/admin/draw-unban', {
		method: 'POST',
		json: { user_id: userId }
	});
}

export async function fetchBanned() {
	return drawRequest<{ banned: BanEntry[] }>('/api/draw/admin/draw-banned');
}

// --- GC ---

export async function runGc() {
	return drawRequest<AdminGcResult>('/api/draw/admin/gc', { method: 'POST' });
}

// --- Styles ---

// --- Workflows ---

export async function getWorkflowFiles() {
	return drawRequest<{ files: string[] }>('/api/draw/admin/workflow_files');
}

export async function renameWorkflow(oldName: string, newName: string) {
	return drawRequest<{ ok: boolean }>('/api/draw/admin/workflow_rename', {
		method: 'POST',
		json: { old: oldName, new: newName }
	});
}

export async function getWorkflowMeta() {
	return drawRequest<{ workflow_meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[] }>('/api/draw/admin/workflow_meta');
}

	export async function updateWorkflowMeta(meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[]) {
		return drawRequest<{ ok: boolean; workflow_meta: { workflow: string; thumbnail?: string; lora_link?: string; category?: string }[] }>('/api/draw/admin/workflow_meta', {
			method: 'POST',
			json: { workflow_meta: meta }
		});
	}

	export async function saveWorkflowMetaSingle(path: string, fields: { thumbnail?: string; category?: string; lora_link?: string }) {
		const fullPath = path.startsWith('WAI/') ? path : 'WAI/' + path;
		const cur = await getWorkflowMeta();
		const meta = cur.workflow_meta.filter(m => m.workflow !== fullPath);
		const existing = cur.workflow_meta.find(m => m.workflow === fullPath);
		meta.push({ workflow: fullPath, ...existing, ...fields });
		return updateWorkflowMeta(meta);
	}

export async function uploadWfThumbnail(file: File) {
	const form = new FormData();
	form.append('file', file);
	return drawRequest<{ ok: boolean; filename: string }>('/api/draw/admin/wf_thumbnail', {
		method: 'POST',
		body: form
	});
}

// --- LLM Config ---

export async function getLlmConfig() {
	return drawRequest<{
		config: AdminLlmConfig;
		providers: string[];
		google_thinking_options?: string[];
	}>('/api/draw/admin/llm_config');
}

export async function updateLlmConfig(data: { profiles: AdminLlmProfile[]; active: number }) {
	return drawRequest<{ ok: boolean; config: AdminLlmConfig }>('/api/draw/admin/llm_config', {
		method: 'POST',
		json: data
	});
}

export async function testLlmConfig(profileIndex?: number) {
	return drawRequest<{ ok: boolean; provider: string; profile_index?: number; reply?: string; error?: string }>('/api/draw/admin/llm_config/test', {
		method: 'POST',
		json: { profile_index: profileIndex }
	});
}

export async function getLlmModels(profileIndex?: number) {
	return drawRequest<{ ok: boolean; models?: string[]; provider?: string; error?: string }>('/api/draw/admin/llm_config/models', {
		method: 'POST',
		json: { profile_index: profileIndex }
	});
}

export async function fetchRecommendations() {
	return drawRequest<{ items: DrawRecommendation[]; total: number }>('/api/draw/admin/recommendations');
}

export async function resolveRecommendation(recId: string, action: 'approve' | 'reject', reason?: string, imagePath?: string) {
	return drawRequest<{ ok: boolean; recommendation: DrawRecommendation }>('/api/draw/admin/recommendations/resolve', {
		method: 'POST',
		json: { rec_id: recId, action, reason: reason || '', image_path: imagePath || '' }
	});
}

	// --- Collaborators ---

	export async function getCollaborators() {
		return drawRequest<{ collaborators: { user_id: number; added_by: number; added_at: number }[] }>('/api/draw/admin/collaborators');
	}

	export async function addCollaborator(userId: number) {
		return drawRequest<{ ok: boolean; collaborators: any[] }>('/api/draw/admin/collaborators/add', {
			method: 'POST',
			json: { user_id: userId }
		});
	}

	export async function removeCollaborator(userId: number) {
		return drawRequest<{ ok: boolean; collaborators: any[] }>('/api/draw/admin/collaborators/remove', {
			method: 'POST',
			json: { user_id: userId }
		});
	}

	// --- Nominations (admin review) ---

	export async function getPendingNominations() {
		return drawRequest<{ items: Nomination[]; total: number }>('/api/draw/admin/nominations');
	}

	export async function resolveNomination(id: string, action: 'approve' | 'reject', reason?: string) {
		return drawRequest<{ ok: boolean }>('/api/draw/admin/nominations/resolve', {
			method: 'POST',
			json: { id, action, reason: reason || '' }
		});
	}

	// --- Wallet / Credits ---

	export async function getWallets() {
		return drawRequest<{ items: Array<{ user_id: number; balance: number; total_purchased: number }> }>('/api/draw/admin/wallets');
	}

	export async function setWalletBalance(userId: number, balance: number, totalPurchased?: number) {
		return drawRequest<{ ok: boolean; wallet: { balance: number; total_purchased: number } }>('/api/draw/admin/wallets/set', {
			method: 'POST',
			json: { user_id: userId, balance, total_purchased: totalPurchased }
		});
	}

	export async function getPlans() {
		return drawRequest<{ items: Array<{ id: string; name: string; points: number; url: string }> }>('/api/draw/admin/plans');
	}

	export async function savePlan(plan: { id: string; name: string; points: number; url: string }) {
		return drawRequest<{ ok: boolean; plans: any[] }>('/api/draw/admin/plans', {
			method: 'POST',
			json: plan
		});
	}

	export async function deletePlan(id: string) {
		return drawRequest<{ ok: boolean; plans: any[] }>(`/api/draw/admin/plans/${id}`, { method: 'DELETE' });
	}

	export async function givePoints(userId: number | null, points: number) {
		return drawRequest<{ ok: boolean; count: number }>('/api/draw/admin/wallets/give', {
			method: 'POST',
			json: { user_id: userId, points }
		});
	}

	export async function savePointsConfig(cfg: { text_to_image: number; image_to_image: number; llm_translate: number; signup_bonus?: number; text_to_image_anima?: number }) {
		return drawRequest<{ ok: boolean; config: any }>('/api/draw/admin/points-config', {
			method: 'POST',
			json: cfg
		});
	}
