import { compile, run } from "@mdx-js/mdx";
import { Fragment } from "preact";
import { jsx, jsxs } from "preact/jsx-runtime";
import { renderToString } from "preact-render-to-string";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import rehypeTocTarget from "../rehype-toc-target.mjs";
import rehypeSourceLine from "../rehype-source-line.mjs";
import { components } from "./components/index";
import { createHighlighter, type Highlighter } from "shiki";
import globalCss from "./styles/global.css";
import componentsCss from "./styles/components.css";

let highlighterPromise: Promise<Highlighter> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidLoadPromise: Promise<any> | null = null;

const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js";

const MERMAID_CONFIG = {
	startOnLoad: false,
	theme: "default" as const,
	themeVariables: {
		primaryColor: "#ECECFF",
		primaryBorderColor: "#9370DB",
		primaryTextColor: "#333",
		lineColor: "#333",
		secondaryColor: "#ffffde",
		tertiaryColor: "#fff",
	},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadMermaid(): Promise<any> {
	if (mermaidLoadPromise) return mermaidLoadPromise;
	mermaidLoadPromise = new Promise((resolve, reject) => {
		if (typeof document === "undefined" || typeof window === "undefined") {
			reject(new Error("No DOM available"));
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((window as any).mermaid) {
			const m = (window as any).mermaid;
			m.initialize(MERMAID_CONFIG);
			resolve(m);
			return;
		}
		const script = document.createElement("script");
		script.src = MERMAID_CDN_URL;
		script.onload = () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const m = (window as any).mermaid;
			m.initialize(MERMAID_CONFIG);
			resolve(m);
		};
		script.onerror = () => {
			mermaidLoadPromise = null;
			reject(new Error("Failed to load mermaid"));
		};
		document.head.appendChild(script);
	});
	return mermaidLoadPromise;
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'");
}

const MERMAID_SVG_FALLBACK_STYLES = `<style>
.node rect, .node circle, .node ellipse, .node polygon, .node path { fill: #ECECFF; stroke: #9370DB; stroke-width: 1px; }
.node .label, .node text, text { fill: #333; }
.edgePath .path { stroke: #333; fill: none; stroke-width: 1.5px; }
.edgeLabel { background-color: #fff; color: #333; }
.cluster rect { fill: #ffffde; stroke: #aaaa33; stroke-width: 1px; }
marker path { fill: #333; }
</style>`;

function ensureSvgSelfContained(svg: string): string {
	if (svg.includes("<style")) return svg;
	return svg.replace(/(<svg[^>]*>)/, `$1${MERMAID_SVG_FALLBACK_STYLES}`);
}

async function renderMermaidCharts(html: string): Promise<string> {
	const regex = /<pre class="mermaid">([\s\S]*?)<\/pre>/g;
	const matches = [...html.matchAll(regex)];
	if (matches.length === 0) return html;

	try {
		const mermaid = await loadMermaid();
		let result = html;
		for (let i = 0; i < matches.length; i++) {
			const chart = decodeHtmlEntities(matches[i][1]);
			try {
				const { svg } = await mermaid.render(
					`mermaid-${Date.now()}-${i}`,
					chart,
				);
				result = result.replace(matches[i][0], ensureSvgSelfContained(svg));
			} catch {
				// Leave as <pre> if individual chart fails to render
			}
		}
		return result;
	} catch {
		// If mermaid can't be loaded, return HTML unchanged
		return html;
	}
}

const LANG_ALIASES: Record<string, string> = {
	env: "dotenv",
	py: "python",
};

export function resolveLang(lang: string): string {
	return LANG_ALIASES[lang] || lang || "plaintext";
}

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-light", "github-dark"],
			langs: [
				"console",
				"bash",
				"python",
				"diff",
				"dotenv",
				"json",
				"yaml",
				"hcl",
				"toml",
				"ini",
				"dockerfile",
				"plaintext",
			],
		});
	}
	return highlighterPromise;
}

const venvTransformer = {
	name: "venv-prompt",
	preprocess(this: { venvPrefixes: Map<number, string> }, code: string) {
		this.venvPrefixes = new Map();
		const lines = code.split("\n");
		const result = lines
			.map((line: string, i: number) => {
				const match = line.match(/^(\([^)]+\) )(\$.*)$/);
				if (match) {
					this.venvPrefixes.set(i, match[1]);
					return match[2];
				}
				return line;
			})
			.join("\n");
		return result;
	},
	postprocess(this: { venvPrefixes: Map<number, string> }, html: string) {
		if (!this.venvPrefixes || this.venvPrefixes.size === 0) return html;
		let lineIndex = 0;
		return html.replace(/<span class="line">/g, (match: string) => {
			const prefix = this.venvPrefixes.get(lineIndex);
			lineIndex++;
			if (prefix) {
				return `${match}<span style="color:#89DDFF">${prefix}</span>`;
			}
			return match;
		});
	},
};

/** Strip YAML frontmatter (--- ... ---) from MDX source */
export function stripFrontmatter(source: string): string {
	const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (match) {
		return source.slice(match[0].length);
	}
	return source;
}

/** Count lines occupied by YAML frontmatter (including delimiters) */
export function getFrontmatterLineCount(source: string): number {
	const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (!match) return 0;
	// Count newlines in the matched frontmatter block
	return match[0].split("\n").length - (match[0].endsWith("\n") ? 1 : 0);
}

/** Replace import statements and resolve @images/ paths to vault-relative paths */
export function preprocessMdx(source: string): {
	cleanedSource: string;
	imageImports: Map<string, string>;
} {
	const imageImports = new Map<string, string>();
	const lines = source.split("\n");
	const outputLines: string[] = [];

	for (const line of lines) {
		// Match image imports: import name from '@images/...' or '../../images/...'
		const imageMatch = line.match(
			/^import\s+(\w+)\s+from\s+['"](?:@images\/cloud_assignments\/|\.\.\/\.\.\/images\/cloud_assignments\/|@images\/)([^'"]+)['"]\s*;?\s*$/
		);
		if (imageMatch) {
			const varName = imageMatch[1];
			const imagePath = imageMatch[2];
			const resolvedPath = `images/${imagePath}`;
			imageImports.set(varName, resolvedPath);
			// Remove the import line, replace with a const so MDX doesn't error
			outputLines.push(`export const ${varName} = "${resolvedPath}";`);
			continue;
		}

		// Match component imports - remove them since we provide components via the component map
		const componentMatch = line.match(
			/^import\s+\w+\s+from\s+['"](?:@components\/|\.\.\/\.\.\/components\/|\.\.\/components\/).*['"]\s*;?\s*$/
		);
		if (componentMatch) {
			// Emit empty line to preserve line numbering for source-line mapping
			outputLines.push("");
			continue;
		}

		outputLines.push(line);
	}

	return {
		cleanedSource: outputLines.join("\n"),
		imageImports,
	};
}

/** Render Shiki-highlighted code for Editor and Terminal components */
async function renderShikiCode(
	content: string,
	lang: string,
	theme: string,
	transformers: object[] = []
): Promise<string> {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(content.trim(), {
		lang: resolveLang(lang),
		theme,
		transformers,
	});
}

/** Render MDX source to an HTML string */
export async function render(source: string): Promise<string> {
	// Step 1: Strip frontmatter
	const withoutFrontmatter = stripFrontmatter(source);

	// Step 2: Preprocess imports
	const { cleanedSource } = preprocessMdx(withoutFrontmatter);

	// Step 3: Compile MDX
	const compiled = await compile(cleanedSource, {
		outputFormat: "function-body",
		remarkPlugins: [
			remarkGfm,
			[remarkToc, { heading: "contents", maxDepth: 4, ordered: true }],
		],
		rehypePlugins: [rehypeTocTarget, rehypeSourceLine],
		jsx: false,
		jsxImportSource: "preact",
	});

	// Step 4: Create wrapped components that handle Shiki rendering
	const highlighter = await getHighlighter();

	const wrappedComponents: Record<string, unknown> = { ...components };

	// Wrap Editor to pre-render Shiki
	const OriginalEditor = components.Editor;
	wrappedComponents.Editor = (props: {
		content?: string;
		lang?: string;
		Code?: unknown;
		[key: string]: unknown;
	}) => {
		if (props.content && !props.Code) {
			const html = highlighter.codeToHtml(
				props.content.trim(),
				{
					lang: resolveLang(props.lang || ""),
					theme: "github-light",
				}
			);
			return OriginalEditor({ ...props, __shikiHtml: html });
		}
		return OriginalEditor(props);
	};

	// Wrap Terminal to pre-render Shiki
	const OriginalTerminal = components.Terminal;
	wrappedComponents.Terminal = (props: {
		content?: string;
		[key: string]: unknown;
	}) => {
		if (props.content) {
			const html = highlighter.codeToHtml(
				props.content.trim(),
				{
					lang: "console",
					theme: "github-dark",
					transformers: [venvTransformer],
				}
			);
			return OriginalTerminal({ ...props, __shikiHtml: html });
		}
		return OriginalTerminal(props);
	};

	// Step 5: Evaluate compiled MDX
	const { default: Content } = await run(String(compiled), {
		jsx,
		jsxs,
		Fragment,
		baseUrl: "file:///obsidian-plugin/",
	});

	// Step 6: Render to HTML string
	const vnode = Content({ components: wrappedComponents });
	const html = renderToString(vnode);

	// Step 7: Pre-render Mermaid charts to SVG (requires DOM, graceful fallback)
	return renderMermaidCharts(html);
}

/** Render MDX source to a complete HTML document */
export async function renderDocument(source: string, title?: string): Promise<string> {
	const contentHtml = await render(source);
	const mermaidScript = contentHtml.includes('<pre class="mermaid">')
		? `<script src="${MERMAID_CDN_URL}"></script>\n<script>mermaid.initialize(${JSON.stringify({ ...MERMAID_CONFIG, startOnLoad: true })});</script>\n`
		: "";
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${title ? `<title>${title}</title>\n` : ""}<style>${globalCss}
${componentsCss}</style>
</head>
<body>
${contentHtml}
${mermaidScript}<script>
(function(){
  document.addEventListener('scroll',function(){
    parent.postMessage({type:'ca-scroll',scrollTop:document.documentElement.scrollTop},'*');
  });
  window.addEventListener('message',function(e){
    if(!e.data||!e.data.type)return;
    if(e.data.type==='ca-scroll-to'){
      document.documentElement.scrollTo(0,e.data.scrollTop);
    }else if(e.data.type==='ca-scroll-to-line'){
      var els=document.querySelectorAll('[data-source-line]');
      var best=null,bestLine=-1;
      for(var i=0;i<els.length;i++){
        var l=parseInt(els[i].getAttribute('data-source-line')||'0',10);
        if(l<=e.data.line&&l>bestLine){best=els[i];bestLine=l;}
      }
      if(!best&&els.length>0)best=els[0];
      if(best)best.scrollIntoView({behavior:e.data.smooth?'smooth':'instant',block:'center'});
    }else if(e.data.type==='ca-scroll-to-top'){
      document.documentElement.scrollTo({top:0,behavior:'smooth'});
    }
  });
})();
</script>
</body>
</html>`;
}

export { renderShikiCode, getHighlighter, decodeHtmlEntities, ensureSvgSelfContained, MERMAID_CDN_URL };

/** @internal Reset mermaid loader state for testing */
export function _resetMermaidLoader(): void {
	mermaidLoadPromise = null;
}
