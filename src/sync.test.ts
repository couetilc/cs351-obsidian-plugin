import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	createDocument,
	listDocuments,
	pullDocument,
	pushDocument,
	releaseDocument,
	listVersions,
	SyncError,
} from "./sync";

const SERVER = "https://www.cs351.test";
const TOKEN = "test-token";

function mockFetch(status: number, body: object) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	});
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("listDocuments", () => {
	it("returns documents on success", async () => {
		const docs = [
			{ slug: "a1", name: "Assignment 1", latest_version: 3, created_at: "2026-01-01" },
		];
		globalThis.fetch = mockFetch(200, { documents: docs });

		const result = await listDocuments(SERVER, TOKEN);
		expect(result).toEqual(docs);
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/api/documents/`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: `Bearer ${TOKEN}`,
				}),
			})
		);
	});

	it("throws SyncError on failure", async () => {
		globalThis.fetch = mockFetch(500, { error: "server error" });
		await expect(listDocuments(SERVER, TOKEN)).rejects.toThrow(SyncError);
		await expect(listDocuments(SERVER, TOKEN)).rejects.toThrow(
			"Failed to list documents"
		);
	});
});

describe("pullDocument", () => {
	it("returns document detail on success", async () => {
		const detail = {
			slug: "a1",
			name: "Assignment 1",
			version: 3,
			mdx_source: "# Hello",
			created_by: "connor",
			created_at: "2026-01-01",
		};
		globalThis.fetch = mockFetch(200, detail);

		const result = await pullDocument(SERVER, TOKEN, "a1");
		expect(result).toEqual(detail);
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/api/documents/a1/`,
			expect.objectContaining({ method: "GET" })
		);
	});

	it("throws on 404", async () => {
		globalThis.fetch = mockFetch(404, { error: "not found" });
		await expect(pullDocument(SERVER, TOKEN, "a1")).rejects.toThrow(SyncError);
	});
});

describe("createDocument", () => {
	it("creates a document", async () => {
		globalThis.fetch = mockFetch(201, { slug: "a1", name: "A1" });
		await createDocument(SERVER, TOKEN, "a1", "A1");
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/api/documents/`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ slug: "a1", name: "A1" }),
			})
		);
	});

	it("silently ignores 409 (already exists)", async () => {
		globalThis.fetch = mockFetch(409, { error: "slug already exists" });
		await expect(createDocument(SERVER, TOKEN, "a1", "A1")).resolves.toBeUndefined();
	});

	it("throws on other errors", async () => {
		globalThis.fetch = mockFetch(500, { error: "server error" });
		await expect(createDocument(SERVER, TOKEN, "a1", "A1")).rejects.toThrow(SyncError);
	});
});

describe("pushDocument", () => {
	it("returns version on success", async () => {
		globalThis.fetch = mockFetch(201, { version: 4 });

		const result = await pushDocument(SERVER, TOKEN, "a1", "# Hello", 3);
		expect(result).toEqual({ version: 4 });
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/api/documents/a1/`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ mdx_source: "# Hello", base_version: 3 }),
				headers: expect.objectContaining({
					"Content-Type": "application/json",
				}),
			})
		);
	});

	it("auto-creates document on 404 then retries push", async () => {
		let callCount = 0;
		globalThis.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
			callCount++;
			// First call: push returns 404
			if (callCount === 1) {
				return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) });
			}
			// Second call: create returns 201
			if (callCount === 2) {
				return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ slug: "new-doc", name: "New Doc" }) });
			}
			// Third call: retry push returns 201
			return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ version: 1 }) });
		});

		const result = await pushDocument(SERVER, TOKEN, "new-doc", "# Hello", 0);
		expect(result).toEqual({ version: 1 });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("resets base_version to 0 on retry after auto-create", async () => {
		let callCount = 0;
		globalThis.fetch = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) });
			}
			if (callCount === 2) {
				return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ slug: "new-doc", name: "New Doc" }) });
			}
			return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ version: 1 }) });
		});

		await pushDocument(SERVER, TOKEN, "new-doc", "# Hello", 5);
		// Third call (retry push) must use base_version: 0, not 5
		const retryCall = vi.mocked(fetch).mock.calls[2];
		const retryBody = JSON.parse(retryCall[1]?.body as string);
		expect(retryBody.base_version).toBe(0);
	});

	it("handles create returning 409 (race condition) then retries push", async () => {
		let callCount = 0;
		globalThis.fetch = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) });
			}
			if (callCount === 2) {
				// create returns 409 — already exists, that's fine
				return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: "slug already exists" }) });
			}
			return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ version: 1 }) });
		});

		const result = await pushDocument(SERVER, TOKEN, "new-doc", "# Hello", 0);
		expect(result).toEqual({ version: 1 });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("propagates SyncError when create fails with 500", async () => {
		let callCount = 0;
		globalThis.fetch = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "not found" }) });
			}
			// create returns 500
			return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "server error" }) });
		});

		await expect(pushDocument(SERVER, TOKEN, "new-doc", "# Hello", 0)).rejects.toThrow(SyncError);
	});

	it("returns conflict on 409", async () => {
		const conflict = {
			error: "conflict" as const,
			server_version: 5,
			created_by: "alice",
			created_at: "2026-01-01",
		};
		globalThis.fetch = mockFetch(409, conflict);

		const result = await pushDocument(SERVER, TOKEN, "a1", "# Hello", 3);
		expect(result).toEqual(conflict);
	});

	it("throws on other errors", async () => {
		globalThis.fetch = mockFetch(500, { error: "server error" });
		await expect(
			pushDocument(SERVER, TOKEN, "a1", "# Hello", 3)
		).rejects.toThrow(SyncError);
	});
});

describe("releaseDocument", () => {
	it("returns release result on success", async () => {
		globalThis.fetch = mockFetch(200, { version: 3, assignment_id: 1 });

		const result = await releaseDocument(
			SERVER, TOKEN, "a1", 3, "<h1>Hi</h1>"
		);
		expect(result).toEqual({ version: 3, assignment_id: 1 });
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/api/documents/a1/release/`,
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					version: 3,
					rendered_html: "<h1>Hi</h1>",
				}),
			})
		);
	});

	it("throws on failure", async () => {
		globalThis.fetch = mockFetch(400, { error: "bad request" });
		await expect(
			releaseDocument(SERVER, TOKEN, "a1", 999, "")
		).rejects.toThrow(SyncError);
	});
});

describe("listVersions", () => {
	it("returns versions on success", async () => {
		const versions = [
			{ version: 2, created_by: "connor", created_at: "2026-01-02" },
			{ version: 1, created_by: "alice", created_at: "2026-01-01" },
		];
		globalThis.fetch = mockFetch(200, { versions });

		const result = await listVersions(SERVER, TOKEN, "a1");
		expect(result).toEqual(versions);
	});

	it("throws on failure", async () => {
		globalThis.fetch = mockFetch(404, { error: "not found" });
		await expect(listVersions(SERVER, TOKEN, "a1")).rejects.toThrow(
			SyncError
		);
	});
});

describe("SyncError", () => {
	it("has status property", () => {
		const err = new SyncError("test", 404);
		expect(err.message).toBe("test");
		expect(err.status).toBe(404);
		expect(err).toBeInstanceOf(Error);
	});
});
