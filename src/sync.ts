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
			body: JSON.stringify({ mdx_source: mdxSource, base_version: baseVersion }),
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
	assignmentId: number,
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
				assignment_id: assignmentId,
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
