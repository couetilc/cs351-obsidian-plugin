import { describe, it, expect, vi } from "vitest";
import { getMimeType, embedFonts, inlineImages, FONTS, type FontSpec } from "./standalone";

// Tiny 1x1 transparent PNG (68 bytes)
const TINY_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
	"base64"
);

describe("getMimeType", () => {
	it("returns image/png for .png", () => {
		expect(getMimeType("photo.png")).toBe("image/png");
	});

	it("returns image/jpeg for .jpg", () => {
		expect(getMimeType("photo.jpg")).toBe("image/jpeg");
	});

	it("returns image/jpeg for .jpeg", () => {
		expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
	});

	it("returns image/gif for .gif", () => {
		expect(getMimeType("anim.gif")).toBe("image/gif");
	});

	it("returns image/svg+xml for .svg", () => {
		expect(getMimeType("icon.svg")).toBe("image/svg+xml");
	});

	it("returns image/webp for .webp", () => {
		expect(getMimeType("photo.webp")).toBe("image/webp");
	});

	it("returns application/octet-stream for unknown extension", () => {
		expect(getMimeType("file.xyz")).toBe("application/octet-stream");
	});

	it("handles paths with directories", () => {
		expect(getMimeType("images/ca1/screenshot.png")).toBe("image/png");
	});

	it("returns application/octet-stream for file with no extension", () => {
		expect(getMimeType("Makefile")).toBe("application/octet-stream");
	});
});

describe("embedFonts", () => {
	it("returns @font-face blocks for each font", async () => {
		const fakeFontData = new ArrayBuffer(4);
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: () => Promise.resolve(fakeFontData),
		});

		const result = await embedFonts(mockFetch as unknown as typeof fetch);

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockFetch).toHaveBeenCalledWith(FONTS[0].url);
		expect(mockFetch).toHaveBeenCalledWith(FONTS[1].url);
		expect(result).toContain("font-weight: 400");
		expect(result).toContain("font-weight: 700");
		expect(result).toContain("font/ttf");
		expect(result).toContain("format('truetype')");
		expect(result).toContain("@font-face");
	});

	it("skips fonts that fail to fetch", async () => {
		let callCount = 0;
		const mockFetch = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				return Promise.resolve({ ok: false, statusText: "Not Found" });
			}
			return Promise.resolve({
				ok: true,
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
			});
		});

		const result = await embedFonts(mockFetch as unknown as typeof fetch);

		// Only the second font should be embedded
		expect(result).not.toContain("font-weight: 400");
		expect(result).toContain("font-weight: 700");
	});

	it("uses font/woff2 MIME type for woff2 format", async () => {
		const woff2Font: FontSpec[] = [{
			name: "Test Font",
			url: "https://example.com/font.woff2",
			format: "woff2",
			weight: "400",
		}];
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
		});

		const result = await embedFonts(mockFetch as unknown as typeof fetch, woff2Font);

		expect(result).toContain("font/woff2");
		expect(result).toContain("format('woff2')");
	});

	it("returns empty string when all fonts fail", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const result = await embedFonts(mockFetch as unknown as typeof fetch);

		expect(result).toBe("");
	});
});

describe("inlineImages", () => {
	it("replaces local image src with base64 data URI", async () => {
		const html = '<img src="images/ca1/test.png" alt="Test">';
		const mockRead = vi.fn().mockResolvedValue(TINY_PNG);

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).toHaveBeenCalledWith("/root/images/ca1/test.png");
		expect(result).toContain("data:image/png;base64,");
		expect(result).not.toContain('src="images/ca1/test.png"');
	});

	it("inlines multiple images", async () => {
		const html =
			'<img src="a.png" alt="A"><img src="b.png" alt="B">';
		const mockRead = vi.fn().mockResolvedValue(TINY_PNG);

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).toHaveBeenCalledTimes(2);
		expect(result).not.toContain('src="a.png"');
		expect(result).not.toContain('src="b.png"');
		// Both should have data URIs
		const dataUriCount = (result.match(/data:image\/png;base64,/g) || []).length;
		expect(dataUriCount).toBe(2);
	});

	it("skips data: URIs", async () => {
		const html = '<img src="data:image/png;base64,abc" alt="Already inlined">';
		const mockRead = vi.fn();

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).not.toHaveBeenCalled();
		expect(result).toBe(html);
	});

	it("skips http:// URLs", async () => {
		const html = '<img src="http://example.com/img.png" alt="External">';
		const mockRead = vi.fn();

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).not.toHaveBeenCalled();
		expect(result).toBe(html);
	});

	it("skips https:// URLs", async () => {
		const html = '<img src="https://example.com/img.png" alt="External">';
		const mockRead = vi.fn();

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).not.toHaveBeenCalled();
		expect(result).toBe(html);
	});

	it("strips srcset attribute from inlined tags", async () => {
		const html = '<img src="test.png" srcset="test-2x.png 2x" alt="Test">';
		const mockRead = vi.fn().mockResolvedValue(TINY_PNG);

		const result = await inlineImages(html, "/root", mockRead);

		expect(result).not.toContain("srcset");
	});

	it("strips sizes attribute from inlined tags", async () => {
		const html = '<img src="test.png" sizes="100vw" alt="Test">';
		const mockRead = vi.fn().mockResolvedValue(TINY_PNG);

		const result = await inlineImages(html, "/root", mockRead);

		expect(result).not.toContain("sizes");
	});

	it("keeps original src when file read fails", async () => {
		const html = '<img src="missing.png" alt="Missing">';
		const mockRead = vi.fn().mockRejectedValue(new Error("ENOENT"));

		const result = await inlineImages(html, "/root", mockRead);

		expect(result).toContain('src="missing.png"');
	});

	it("handles mixed local and external images", async () => {
		const html =
			'<img src="local.png" alt="Local">' +
			'<img src="https://cdn.example.com/remote.png" alt="Remote">';
		const mockRead = vi.fn().mockResolvedValue(TINY_PNG);

		const result = await inlineImages(html, "/root", mockRead);

		expect(mockRead).toHaveBeenCalledTimes(1);
		expect(result).toContain("data:image/png;base64,");
		expect(result).toContain("https://cdn.example.com/remote.png");
	});

	it("uses correct MIME type for different extensions", async () => {
		const html = '<img src="photo.jpg" alt="Photo">';
		const mockRead = vi.fn().mockResolvedValue(Buffer.from("fake"));

		const result = await inlineImages(html, "/root", mockRead);

		expect(result).toContain("data:image/jpeg;base64,");
	});
});
