export interface DocumentSummary {
	slug: string;
	name: string;
	latest_version: number | null;
	created_at: string;
}

export interface DocumentDetail {
	slug: string;
	name: string;
	version: number;
	mdx_source: string;
	created_by: string;
	created_at: string;
}

export interface PushResult {
	version: number;
}

export interface ConflictError {
	error: "conflict";
	server_version: number;
	created_by?: string;
	created_at?: string;
}

export interface VersionInfo {
	version: number;
	created_by: string;
	created_at: string;
}

export interface ReleaseResult {
	version: number;
	assignment_id: number;
}

export interface ImageManifestEntry {
	path: string;
	content_hash: string;
}

export class SyncError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

async function request(
	serverUrl: string,
	token: string,
	path: string,
	options: { method?: string; body?: string } = {}
): Promise<Response> {
	const url = `${serverUrl}${path}`;
	return fetch(url, {
		method: options.method ?? "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			...(options.body !== undefined
				? { "Content-Type": "application/json" }
				: {}),
		},
		body: options.body,
	});
}

export async function listDocuments(
	serverUrl: string,
	token: string
): Promise<DocumentSummary[]> {
	const resp = await request(serverUrl, token, "/api/documents/");
	if (!resp.ok) throw new SyncError("Failed to list documents", resp.status);
	const data = await resp.json();
	return data.documents;
}

export async function pullDocument(
	serverUrl: string,
	token: string,
	slug: string
): Promise<DocumentDetail> {
	const resp = await request(serverUrl, token, `/api/documents/${slug}/`);
	if (!resp.ok) throw new SyncError("Failed to pull document", resp.status);
	return resp.json();
}

export async function createDocument(
	serverUrl: string,
	token: string,
	slug: string,
	name: string
): Promise<void> {
	const resp = await request(serverUrl, token, "/api/documents/", {
		method: "POST",
		body: JSON.stringify({ slug, name }),
	});
	if (resp.status === 409) return; // already exists, that's fine
	if (!resp.ok) throw new SyncError("Failed to create document", resp.status);
}

export async function pushDocument(
	serverUrl: string,
	token: string,
	slug: string,
	mdxSource: string,
	baseVersion: number
): Promise<PushResult | ConflictError> {
	let resp = await request(serverUrl, token, `/api/documents/${slug}/`, {
		method: "POST",
		body: JSON.stringify({ mdx_source: mdxSource, base_version: baseVersion }),
	});
	if (resp.status === 404) {
		// Auto-create the document, then retry the push
		const name = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		await createDocument(serverUrl, token, slug, name);
		resp = await request(serverUrl, token, `/api/documents/${slug}/`, {
			method: "POST",
			body: JSON.stringify({ mdx_source: mdxSource, base_version: 0 }),
		});
	}
	if (resp.status === 409) return resp.json();
	if (!resp.ok) throw new SyncError("Failed to push document", resp.status);
	return resp.json();
}

export async function releaseDocument(
	serverUrl: string,
	token: string,
	slug: string,
	version: number,
	renderedHtml: string
): Promise<ReleaseResult> {
	const resp = await request(
		serverUrl,
		token,
		`/api/documents/${slug}/release/`,
		{
			method: "POST",
			body: JSON.stringify({
				version,
				rendered_html: renderedHtml,
			}),
		}
	);
	if (!resp.ok) throw new SyncError("Failed to release document", resp.status);
	return resp.json();
}

export async function listVersions(
	serverUrl: string,
	token: string,
	slug: string
): Promise<VersionInfo[]> {
	const resp = await request(
		serverUrl,
		token,
		`/api/documents/${slug}/versions/`
	);
	if (!resp.ok)
		throw new SyncError("Failed to list versions", resp.status);
	const data = await resp.json();
	return data.versions;
}

export async function fetchImageManifest(
	serverUrl: string,
	token: string
): Promise<ImageManifestEntry[]> {
	const resp = await request(serverUrl, token, "/api/images/");
	if (!resp.ok)
		throw new SyncError("Failed to fetch image manifest", resp.status);
	const data = await resp.json();
	return data.images;
}

export async function uploadImage(
	serverUrl: string,
	token: string,
	path: string,
	data: ArrayBuffer
): Promise<void> {
	const form = new FormData();
	form.append("path", path);
	form.append("file", new Blob([data]), path.split("/").pop()!);
	const resp = await fetch(`${serverUrl}/api/images/`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	if (!resp.ok) throw new SyncError("Failed to upload image", resp.status);
}

export async function downloadImage(
	serverUrl: string,
	token: string,
	path: string
): Promise<ArrayBuffer> {
	const resp = await fetch(`${serverUrl}/api/images/${path}/`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!resp.ok) throw new SyncError("Failed to download image", resp.status);
	return resp.arrayBuffer();
}

const IMAGE_IMPORT_RE =
	/^import\s+\w+\s+from\s+['"](?:@images\/cloud_assignments\/|\.\.\/\.\.\/images\/cloud_assignments\/|@images\/)([^'"]+)['"]\s*;?\s*$/;

export function extractImagePaths(mdxSource: string): string[] {
	const paths: string[] = [];
	for (const line of mdxSource.split("\n")) {
		const m = line.match(IMAGE_IMPORT_RE);
		if (m) paths.push(`images/${m[1]}`);
	}
	return paths;
}

export async function hashArrayBuffer(data: ArrayBuffer): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
