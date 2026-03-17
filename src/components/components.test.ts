import { describe, it, expect } from "vitest";
import { renderToString } from "preact-render-to-string";
import { h } from "preact";
import { Editor } from "./editor";
import { Terminal } from "./terminal";
import { Screenshot } from "./screenshot";
import { Detail } from "./detail";
import { ExternalLink } from "./external-link";
import { Hide } from "./hide";
import { Mermaid } from "./mermaid";

describe("Editor", () => {
	it("renders with filename", () => {
		const html = renderToString(h(Editor, { filename: "main.py", content: "print('hi')" }));
		expect(html).toContain("ca-editor");
		expect(html).toContain("main.py");
		expect(html).toContain("macdot-red");
		expect(html).toContain("editor-tab");
	});

	it("renders <Untitled> when no filename", () => {
		const html = renderToString(h(Editor, { content: "code" }));
		expect(html).toContain("&lt;Untitled>");
	});

	it("renders with __shikiHtml", () => {
		const html = renderToString(h(Editor, {
			filename: "test.py",
			__shikiHtml: '<pre class="shiki"><code>highlighted</code></pre>',
		}));
		expect(html).toContain("highlighted");
		expect(html).toContain("ca-editor");
	});

	it("renders with custom Code component", () => {
		const CustomCode = () => h("div", null, "custom code output");
		const html = renderToString(h(Editor, {
			filename: "test.py",
			Code: CustomCode,
		}));
		expect(html).toContain("custom code output");
	});

	it("renders fallback pre/code when no content, no Code, no shikiHtml", () => {
		const html = renderToString(h(Editor, { filename: "empty.py" }));
		expect(html).toContain("shiki github-light");
		expect(html).toContain("<code>");
	});

	it("trims content in fallback mode", () => {
		const html = renderToString(h(Editor, { content: "  code  " }));
		expect(html).toContain("code");
	});
});

describe("Terminal", () => {
	it("renders with terminal chrome", () => {
		const html = renderToString(h(Terminal, { content: "$ ls" }));
		expect(html).toContain("ca-terminal");
		expect(html).toContain("terminal-bar");
		expect(html).toContain("Terminal");
		expect(html).toContain("macdot-red");
	});

	it("renders with __shikiHtml", () => {
		const html = renderToString(h(Terminal, {
			__shikiHtml: '<pre class="shiki"><code>$ ls</code></pre>',
		}));
		expect(html).toContain("$ ls");
	});

	it("renders fallback when no shikiHtml", () => {
		const html = renderToString(h(Terminal, { content: "$ echo hi" }));
		expect(html).toContain("shiki");
		expect(html).toContain("echo hi");
	});

	it("renders empty fallback when no content", () => {
		const html = renderToString(h(Terminal, {}));
		expect(html).toContain("<code>");
	});
});

describe("Screenshot", () => {
	it("renders with image and alt", () => {
		const html = renderToString(h(Screenshot, {
			image: "images/ca1/test.png",
			alt: "Test screenshot",
		}));
		expect(html).toContain("ca-screenshot");
		expect(html).toContain("browser-bar");
		expect(html).toContain('src="images/ca1/test.png"');
		expect(html).toContain('alt="Test screenshot"');
	});

	it("renders with url in address bar", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
			url: "https://example.com",
		}));
		expect(html).toContain("address-bar");
		expect(html).toContain("https://example.com");
	});

	it("renders empty address bar when no url", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
		}));
		expect(html).toContain("address-bar");
	});

	it("renders single cursor", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
			cursor: { x: "50%", y: "60%", scale: "3" },
		}));
		expect(html).toContain("cursor");
		expect(html).toContain("--x:50%");
		expect(html).toContain("--y:60%");
		expect(html).toContain("--scale:3");
	});

	it("renders multiple cursors from array", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
			cursor: [
				{ x: "10%", y: "20%" },
				{ x: "30%", y: "40%", rotate: "45" },
			],
		}));
		expect(html).toContain("--x:10%");
		expect(html).toContain("--x:30%");
		expect(html).toContain("--rotate:45");
	});

	it("uses defaults for missing cursor properties", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
			cursor: {},
		}));
		expect(html).toContain("--x:0");
		expect(html).toContain("--y:0");
		expect(html).toContain("--scale:1");
		expect(html).toContain("--rotate:0");
	});

	it("renders no cursors when cursor prop is absent", () => {
		const html = renderToString(h(Screenshot, {
			image: "test.png",
			alt: "test",
		}));
		expect(html).not.toContain("--x:");
	});
});

describe("Detail", () => {
	it("renders details/summary with hint", () => {
		const html = renderToString(h(Detail, { summary: "Click me" },
			h("p", null, "Hidden content"),
		));
		expect(html).toContain("ca-detail");
		expect(html).toContain("<details>");
		expect(html).toContain("<summary>");
		expect(html).toContain("Click me");
		expect(html).toContain("Hidden content");
		expect(html).toContain("(click to open)");
		expect(html).toContain("hint");
	});
});

describe("ExternalLink", () => {
	it("renders external https link with target=_blank", () => {
		const html = renderToString(h(ExternalLink, { href: "https://example.com" }, "Link"));
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain("Link");
	});

	it("renders external http link with target=_blank", () => {
		const html = renderToString(h(ExternalLink, { href: "http://example.com" }, "Link"));
		expect(html).toContain('target="_blank"');
	});

	it("renders internal link without target=_blank", () => {
		const html = renderToString(h(ExternalLink, { href: "/page" }, "Link"));
		expect(html).not.toContain('target="_blank"');
		expect(html).toContain('href="/page"');
	});

	it("renders link with no href", () => {
		const html = renderToString(h(ExternalLink, {}, "Link"));
		expect(html).not.toContain('target="_blank"');
		expect(html).toContain("<a");
	});

	it("passes through extra props", () => {
		const html = renderToString(h(ExternalLink, {
			href: "https://example.com",
			class: "my-link",
			title: "My Title",
		}, "Link"));
		expect(html).toContain('class="my-link"');
		expect(html).toContain('title="My Title"');
	});
});

describe("Hide", () => {
	it("renders an empty span", () => {
		const html = renderToString(h(Hide, null));
		expect(html).toBe("<span></span>");
	});
});

describe("Mermaid", () => {
	it("renders chart in pre.mermaid", () => {
		const html = renderToString(h(Mermaid, { chart: "graph TD; A-->B;" }));
		expect(html).toContain("ca-mermaid");
		expect(html).toContain('<pre class="mermaid">');
		expect(html).toContain("graph TD; A-->B;");
	});

	it("includes mermaid CDN script", () => {
		const html = renderToString(h(Mermaid, { chart: "graph LR; A-->B;" }));
		expect(html).toContain("cdn.jsdelivr.net/npm/mermaid");
	});

	it("includes mermaid.initialize call", () => {
		const html = renderToString(h(Mermaid, { chart: "graph LR; A-->B;" }));
		expect(html).toContain("mermaid.initialize");
	});
});
