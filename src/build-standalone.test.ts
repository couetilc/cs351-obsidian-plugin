import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildStandalone } from "./build-standalone";

vi.mock("fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

vi.mock("./renderer", () => ({
	renderDocument: vi.fn(),
}));

vi.mock("./standalone", () => ({
	embedFonts: vi.fn(),
	inlineImages: vi.fn(),
}));

import { existsSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { renderDocument } from "./renderer";
import { embedFonts, inlineImages } from "./standalone";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);
const mockedRenderDocument = vi.mocked(renderDocument);
const mockedEmbedFonts = vi.mocked(embedFonts);
const mockedInlineImages = vi.mocked(inlineImages);

beforeEach(() => {
	vi.resetAllMocks();
});

function setupMocks(overrides: { inputExists?: boolean; standaloneDirExists?: boolean } = {}) {
	const { inputExists = true, standaloneDirExists = true } = overrides;

	mockedExistsSync.mockImplementation((p) => {
		const path = String(p);
		if (path.endsWith(".mdx")) return inputExists;
		if (path.endsWith("standalone")) return standaloneDirExists;
		return false;
	});

	mockedReadFile.mockImplementation(((path: string, encoding?: string) => {
		if (encoding === "utf-8") return Promise.resolve("# MDX source");
		// Second call (no encoding) returns Buffer for size check
		return Promise.resolve(Buffer.from("<html>output</html>"));
	}) as typeof readFile);

	mockedRenderDocument.mockResolvedValue("<!DOCTYPE html><html><head></head><body><h1>Hello</h1></body></html>");
	mockedEmbedFonts.mockResolvedValue("@font-face{}");
	mockedInlineImages.mockImplementation(async (html) => html);
	mockedWriteFile.mockResolvedValue();
	mockedMkdir.mockResolvedValue(undefined);
}

describe("buildStandalone", () => {
	it("throws when MDX file does not exist", async () => {
		setupMocks({ inputExists: false });

		await expect(buildStandalone("/root", "assignment-1")).rejects.toThrow(
			"MDX file not found: /root/content/cloud-assignments/assignment-1.mdx"
		);
	});

	it("creates standalone directory when it does not exist", async () => {
		setupMocks({ standaloneDirExists: false });

		await buildStandalone("/root", "assignment-1");

		expect(mockedMkdir).toHaveBeenCalledWith("/root/standalone", { recursive: true });
	});

	it("does not create standalone directory when it already exists", async () => {
		setupMocks({ standaloneDirExists: true });

		await buildStandalone("/root", "assignment-1");

		expect(mockedMkdir).not.toHaveBeenCalled();
	});

	it("reads the MDX file and calls renderDocument with slug", async () => {
		setupMocks();

		await buildStandalone("/root", "assignment-2");

		expect(mockedReadFile).toHaveBeenCalledWith(
			"/root/content/cloud-assignments/assignment-2.mdx",
			"utf-8"
		);
		expect(mockedRenderDocument).toHaveBeenCalledWith("# MDX source", "assignment-2");
	});

	it("embeds fonts and injects them before </head>", async () => {
		setupMocks();
		mockedEmbedFonts.mockResolvedValue("@font-face{test}");

		await buildStandalone("/root", "a1");

		// Check the HTML passed to inlineImages has font styles injected
		const inlineCall = mockedInlineImages.mock.calls[0];
		const html = inlineCall[0] as string;
		expect(html).toContain("<style>@font-face{test}</style>");
		expect(html).toContain("<style>.no-standalone{display:none!important}</style>");
		expect(html).toContain("</head>");
	});

	it("calls inlineImages with rootDir and a readFile wrapper", async () => {
		setupMocks();

		await buildStandalone("/root", "a1");

		expect(mockedInlineImages).toHaveBeenCalledWith(
			expect.any(String),
			"/root",
			expect.any(Function)
		);

		// Exercise the readFile callback passed to inlineImages
		const readFn = mockedInlineImages.mock.calls[0][2] as (path: string) => Promise<Buffer>;
		await readFn("some/path.png");
		expect(mockedReadFile).toHaveBeenCalledWith("some/path.png");
	});

	it("writes output to standalone directory", async () => {
		setupMocks();

		await buildStandalone("/root", "assignment-2");

		expect(mockedWriteFile).toHaveBeenCalledWith(
			"/root/standalone/assignment-2.html",
			expect.any(String),
			"utf-8"
		);
	});

	it("logs the output file size", async () => {
		setupMocks();
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});

		await buildStandalone("/root", "assignment-2");

		expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^standalone\/assignment-2\.html \(\d+\.\d+ KB\)$/));
		spy.mockRestore();
	});
});
