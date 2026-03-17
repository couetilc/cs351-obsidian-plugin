import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { renderDocument } from "./renderer";
import { inlineImages, embedFonts } from "./standalone";

export async function buildStandalone(rootDir: string, slug: string): Promise<void> {
	const contentDir = join(rootDir, "content", "cloud-assignments");
	const standaloneDir = join(rootDir, "standalone");

	const inputPath = join(contentDir, `${slug}.mdx`);
	const outputPath = join(standaloneDir, `${slug}.html`);

	if (!existsSync(inputPath)) {
		throw new Error(`MDX file not found: ${inputPath}`);
	}

	if (!existsSync(standaloneDir)) {
		await mkdir(standaloneDir, { recursive: true });
	}

	const mdxSource = await readFile(inputPath, "utf-8");
	let html = await renderDocument(mdxSource, slug);

	const fontStyles = await embedFonts();
	html = html.replace(
		"</head>",
		`<style>${fontStyles}</style>\n<style>.no-standalone{display:none!important}</style>\n</head>`
	);

	html = await inlineImages(html, rootDir, (path) => readFile(path));

	await writeFile(outputPath, html, "utf-8");

	const stats = await readFile(outputPath);
	const sizeKB = (stats.length / 1024).toFixed(1);
	console.log(`standalone/${slug}.html (${sizeKB} KB)`);
}
