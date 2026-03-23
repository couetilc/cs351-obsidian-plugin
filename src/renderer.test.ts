import { describe, it, expect, vi, afterEach } from "vitest";
import { stripFrontmatter, preprocessMdx, render, renderDocument, renderShikiCode, getHighlighter, resolveLang, getFrontmatterLineCount, decodeHtmlEntities, _resetMermaidLoader } from "./renderer";

describe("resolveLang", () => {
	it("maps env to dotenv", () => {
		expect(resolveLang("env")).toBe("dotenv");
	});

	it("maps py to python", () => {
		expect(resolveLang("py")).toBe("python");
	});

	it("passes through known languages", () => {
		expect(resolveLang("json")).toBe("json");
		expect(resolveLang("bash")).toBe("bash");
	});

	it("returns plaintext for empty string", () => {
		expect(resolveLang("")).toBe("plaintext");
	});
});

describe("stripFrontmatter", () => {
	it("removes YAML frontmatter", () => {
		const input = '---\ntitle: "Test"\ndate: 2026-01-01\n---\n# Hello';
		expect(stripFrontmatter(input)).toBe("# Hello");
	});

	it("returns source unchanged when no frontmatter", () => {
		const input = "# Hello\nWorld";
		expect(stripFrontmatter(input)).toBe(input);
	});

	it("handles Windows line endings", () => {
		const input = '---\r\ntitle: "Test"\r\n---\r\n# Hello';
		expect(stripFrontmatter(input)).toBe("# Hello");
	});
});

describe("getFrontmatterLineCount", () => {
	it("returns 0 when no frontmatter", () => {
		expect(getFrontmatterLineCount("# Hello\nWorld")).toBe(0);
	});

	it("counts lines for simple frontmatter", () => {
		const source = '---\ntitle: "Test"\n---\n# Hello';
		expect(getFrontmatterLineCount(source)).toBe(3);
	});

	it("counts lines for multi-field frontmatter", () => {
		const source = '---\ntitle: "Test"\ndate: 2026-01-01\nauthor: me\n---\n# Hello';
		expect(getFrontmatterLineCount(source)).toBe(5);
	});

	it("handles Windows line endings", () => {
		const source = '---\r\ntitle: "Test"\r\n---\r\n# Hello';
		expect(getFrontmatterLineCount(source)).toBe(3);
	});

	it("handles frontmatter without trailing newline", () => {
		const source = '---\ntitle: "Test"\n---';
		expect(getFrontmatterLineCount(source)).toBe(3);
	});
});

describe("preprocessMdx", () => {
	it("extracts image imports with @images/cloud_assignments/ prefix", () => {
		const input = `import foo from '@images/cloud_assignments/ca1/test.png'\n# Hello`;
		const result = preprocessMdx(input);
		expect(result.imageImports.get("foo")).toBe("images/ca1/test.png");
		expect(result.cleanedSource).toContain('export const foo = "images/ca1/test.png"');
		expect(result.cleanedSource).not.toContain("import foo");
	});

	it("extracts image imports with relative path prefix", () => {
		const input = `import bar from '../../images/cloud_assignments/ca2/img.png'\n# Hello`;
		const result = preprocessMdx(input);
		expect(result.imageImports.get("bar")).toBe("images/ca2/img.png");
	});

	it("extracts image imports with short @images/ prefix", () => {
		const input = `import img from '@images/ca1/test.png'\n# Hello`;
		const result = preprocessMdx(input);
		expect(result.imageImports.get("img")).toBe("images/ca1/test.png");
	});

	it("strips component imports with @components/ prefix", () => {
		const input = `import Editor from '@components/Editor.astro'\n# Hello`;
		const result = preprocessMdx(input);
		expect(result.cleanedSource).not.toContain("import Editor");
		expect(result.cleanedSource).toContain("# Hello");
	});

	it("strips component imports with relative paths", () => {
		const input = `import Editor from '../../components/Editor.astro'\n# Hello`;
		const result = preprocessMdx(input);
		expect(result.cleanedSource).not.toContain("import Editor");
	});

	it("preserves non-import lines", () => {
		const input = "# Hello\n\nSome paragraph text";
		const result = preprocessMdx(input);
		expect(result.cleanedSource).toBe(input);
	});

	it("preserves line count when stripping component imports", () => {
		const input = "import Editor from '@components/Editor.astro'\nimport Terminal from '@components/Terminal.astro'\n# Hello\n\nParagraph";
		const result = preprocessMdx(input);
		const inputLineCount = input.split("\n").length;
		const outputLineCount = result.cleanedSource.split("\n").length;
		expect(outputLineCount).toBe(inputLineCount);
	});
});

describe("renderShikiCode", () => {
	it("highlights code with a given language and theme", async () => {
		const html = await renderShikiCode("print('hello')", "python", "github-light");
		expect(html).toContain("shiki");
		expect(html).toContain("print");
	}, 30_000);

	it("falls back to plaintext for unknown lang", async () => {
		const html = await renderShikiCode("some code", "", "github-light");
		expect(html).toContain("some code");
	}, 30_000);
});

describe("getHighlighter", () => {
	it("returns the same highlighter instance", async () => {
		const h1 = await getHighlighter();
		const h2 = await getHighlighter();
		expect(h1).toBe(h2);
	}, 30_000);
});

describe("render", () => {
	it("renders simple MDX content", async () => {
		const html = await render("# Hello World\n\nSome text here.");
		expect(html).toContain("Hello World</h1>");
		expect(html).toContain("Some text here.");
	}, 30_000);

	it("renders MDX with frontmatter", async () => {
		const source = '---\ntitle: "Test"\n---\n# Test Page\n\nContent';
		const html = await render(source);
		expect(html).toContain("Test Page</h1>");
		expect(html).not.toContain("---");
	}, 30_000);

	it("renders callout components", async () => {
		const source = "<Important>\nThis is important!\n</Important>";
		const html = await render(source);
		expect(html).toContain("ca-important");
		expect(html).toContain("🚨");
		expect(html).toContain("This is important!");
	}, 30_000);

	it("renders Editor with Shiki highlighting", async () => {
		const source = '<Editor filename="test.py" lang="python" content="print(1)" />';
		const html = await render(source);
		expect(html).toContain("ca-editor");
		expect(html).toContain("test.py");
		expect(html).toContain("shiki");
		expect(html).toContain("print");
	}, 30_000);

	it("renders Editor with no lang (falls back to plaintext)", async () => {
		const source = '<Editor filename="notes.txt" content="hello world" />';
		const html = await render(source);
		expect(html).toContain("ca-editor");
		expect(html).toContain("hello world");
	}, 30_000);

	it("renders Editor with custom Code component (no Shiki wrapping)", async () => {
		// When Code prop is provided, the Editor wrapper should pass through
		const source = `<Editor filename="creds" Code={({ children }) => <><pre><div>hello</div></pre></>} />`;
		const html = await render(source);
		expect(html).toContain("ca-editor");
		expect(html).toContain("creds");
		expect(html).toContain("hello");
	}, 30_000);

	it("renders Terminal with Shiki highlighting", async () => {
		const source = '<Terminal content="$ echo hi" />';
		const html = await render(source);
		expect(html).toContain("ca-terminal");
		expect(html).toContain("shiki");
	}, 30_000);

	it("renders Terminal with venv prefix on mixed lines", async () => {
		const source = `<Terminal content={"$ echo hi\\n(.venv) $ pip install django\\nsome output"} />`;
		const html = await render(source);
		expect(html).toContain("ca-terminal");
		expect(html).toContain("(.venv)");
		expect(html).toContain("pip install django");
	}, 30_000);

	it("renders Terminal without content prop", async () => {
		const source = "<Terminal />";
		const html = await render(source);
		expect(html).toContain("ca-terminal");
	}, 30_000);

	it("renders Screenshot component", async () => {
		const source = `
export const testImg = "images/ca1/test.png";

<Screenshot image={testImg} alt="Test" url="https://example.com" />`;
		const html = await render(source);
		expect(html).toContain("ca-screenshot");
		expect(html).toContain("images/ca1/test.png");
		expect(html).toContain("https://example.com");
	}, 30_000);

	it("renders Detail component", async () => {
		const source = '<Detail summary="Show more">\nHidden content\n</Detail>';
		const html = await render(source);
		expect(html).toContain("ca-detail");
		expect(html).toContain("Show more");
		expect(html).toContain("Hidden content");
	}, 30_000);

	it("renders ExternalLink with target=_blank for https", async () => {
		const source = '<ExternalLink href="https://example.com">Click</ExternalLink>';
		const html = await render(source);
		expect(html).toContain('target="_blank"');
		expect(html).toContain("Click");
	}, 30_000);

	it("renders Hide as empty", async () => {
		const source = "<Hide>This should not appear</Hide>";
		const html = await render(source);
		expect(html).toContain("<span></span>");
	}, 30_000);

	it("renders Points without content", async () => {
		const source = "<Points />";
		const html = await render(source);
		expect(html).toContain("ca-points");
		expect(html).toContain("no-content");
	}, 30_000);

	it("renders Mermaid component", async () => {
		const source = '<Mermaid chart="graph TD; A-->B;" />';
		const html = await render(source);
		expect(html).toContain("ca-mermaid");
		// In test env (no DOM), mermaid pre-rendering is skipped; chart stays in <pre>
		expect(html).toContain('<pre class="mermaid">');
	}, 30_000);

	it("renders Endpoint component", async () => {
		const source = '<Endpoint method="GET" path="/api/users">\nReturns a list of users.\n</Endpoint>';
		const html = await render(source);
		expect(html).toContain("ca-endpoint");
		expect(html).toContain("🔌");
		expect(html).toContain("GET");
		expect(html).toContain("/api/users");
		expect(html).toContain("Returns a list of users.");
	}, 30_000);

	it("renders markdown links as ExternalLink via component map", async () => {
		const source = "[Google](https://google.com)";
		const html = await render(source);
		expect(html).toContain('target="_blank"');
		expect(html).toContain("Google");
	}, 30_000);

	it("renders internal markdown links without target=_blank", async () => {
		const source = "[Section](#section)";
		const html = await render(source);
		expect(html).not.toContain('target="_blank"');
		expect(html).toContain('href="#section"');
	}, 30_000);

	it("strips image imports and resolves paths", async () => {
		const source = `---
title: "Test"
---
import testImg from '@images/cloud_assignments/ca1/test.png'

<Screenshot image={testImg} alt="Test" />`;
		const html = await render(source);
		expect(html).toContain("images/ca1/test.png");
	}, 30_000);
});

describe("renderDocument", () => {
	it("returns a complete HTML document", async () => {
		const html = await renderDocument("# Hello");
		expect(html).toMatch(/^<!DOCTYPE html>/);
		expect(html).toContain("<html lang=\"en\">");
		expect(html).toContain("<body>");
		expect(html).toContain("</body>");
		expect(html).toContain("Hello</h1>");
	}, 30_000);

	it("includes a style tag for CSS", async () => {
		const html = await renderDocument("# Hello");
		expect(html).toContain("<style>");
		expect(html).toContain("</style>");
	}, 30_000);

	it("includes title when provided", async () => {
		const html = await renderDocument("# Hello", "assignment-2");
		expect(html).toContain("<title>assignment-2</title>");
	}, 30_000);

	it("omits title when not provided", async () => {
		const html = await renderDocument("# Hello");
		expect(html).not.toContain("<title>");
	}, 30_000);

	it("sets charset and viewport", async () => {
		const html = await renderDocument("# Hello");
		expect(html).toContain('charset="UTF-8"');
		expect(html).toContain('name="viewport"');
	}, 30_000);

	it("includes mermaid CDN scripts when content has mermaid", async () => {
		const html = await renderDocument('<Mermaid chart="graph TD; A-->B;" />');
		expect(html).toContain("cdn.jsdelivr.net/npm/mermaid");
		expect(html).toContain("mermaid.initialize");
	}, 30_000);
});

describe("decodeHtmlEntities", () => {
	it("decodes all common HTML entities", () => {
		expect(decodeHtmlEntities("A --&gt; B")).toBe("A --> B");
		expect(decodeHtmlEntities("&lt;div&gt;")).toBe("<div>");
		expect(decodeHtmlEntities("&amp;")).toBe("&");
		expect(decodeHtmlEntities("&quot;hi&quot;")).toBe('"hi"');
		expect(decodeHtmlEntities("&#x27;")).toBe("'");
	});

	it("passes through text without entities", () => {
		expect(decodeHtmlEntities("hello world")).toBe("hello world");
	});
});

describe("mermaid pre-rendering", () => {
	afterEach(() => {
		_resetMermaidLoader();
		vi.unstubAllGlobals();
	});

	it("renders mermaid charts to SVG when window.mermaid is available", async () => {
		_resetMermaidLoader();
		const mockMermaid = {
			initialize: vi.fn(),
			render: vi.fn().mockResolvedValue({ svg: "<svg>rendered-chart</svg>" }),
		};
		vi.stubGlobal("document", {});
		vi.stubGlobal("window", { mermaid: mockMermaid });

		const source = '<Mermaid chart="graph TD; A-->B;" />';
		const html = await render(source);
		expect(html).toContain("<svg>rendered-chart</svg>");
		expect(html).not.toContain('<pre class="mermaid">');
	}, 30_000);

	it("loads mermaid from CDN when window.mermaid is not available", async () => {
		_resetMermaidLoader();
		const mockScript: Record<string, unknown> = {};
		const mockMermaid = {
			initialize: vi.fn(),
			render: vi.fn().mockResolvedValue({ svg: "<svg>cdn-chart</svg>" }),
		};
		vi.stubGlobal("document", {
			createElement: vi.fn().mockReturnValue(mockScript),
			head: {
				appendChild: vi.fn().mockImplementation(() => {
					(globalThis as Record<string, unknown>).window = { mermaid: mockMermaid };
					(mockScript.onload as () => void)();
				}),
			},
		});
		vi.stubGlobal("window", {});

		const source = '<Mermaid chart="graph TD; A-->B;" />';
		const html = await render(source);
		expect(html).toContain("<svg>cdn-chart</svg>");
		expect(mockScript.src).toBe("https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js");
	}, 30_000);

	it("falls back to pre when CDN script fails to load", async () => {
		_resetMermaidLoader();
		const mockScript: Record<string, unknown> = {};
		vi.stubGlobal("document", {
			createElement: vi.fn().mockReturnValue(mockScript),
			head: {
				appendChild: vi.fn().mockImplementation(() => {
					(mockScript.onerror as () => void)();
				}),
			},
		});
		vi.stubGlobal("window", {});

		const source = '<Mermaid chart="graph TD; A-->B;" />';
		const html = await render(source);
		expect(html).toContain('<pre class="mermaid">');
	}, 30_000);

	it("falls back to pre when mermaid.render throws", async () => {
		_resetMermaidLoader();
		const mockMermaid = {
			initialize: vi.fn(),
			render: vi.fn().mockRejectedValue(new Error("parse error")),
		};
		vi.stubGlobal("document", {});
		vi.stubGlobal("window", { mermaid: mockMermaid });

		const source = '<Mermaid chart="invalid chart syntax" />';
		const html = await render(source);
		expect(html).toContain('<pre class="mermaid">');
		expect(html).toContain("ca-mermaid");
	}, 30_000);
});
