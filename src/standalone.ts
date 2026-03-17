export const FONTS = [
	{
		name: "PT Serif Regular",
		url: "https://fonts.gstatic.com/s/ptserif/v19/EJRVQgYoZZY2vCFuvDFR.ttf",
		format: "truetype",
		weight: "400",
	},
	{
		name: "PT Serif Bold",
		url: "https://fonts.gstatic.com/s/ptserif/v19/EJRSQgYoZZY2vCFuvAnt65qV.ttf",
		format: "truetype",
		weight: "700",
	},
];

export function getMimeType(filePath: string): string {
	const parts = filePath.split(".");
	const ext = parts.length > 1 ? parts.pop()!.toLowerCase() : "";
	const mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
	};
	return mimeTypes[ext] || "application/octet-stream";
}

type FetchFn = (url: string) => Promise<Response>;

export interface FontSpec {
	name: string;
	url: string;
	format: string;
	weight: string;
}

export async function embedFonts(fetchFn: FetchFn = fetch, fonts: FontSpec[] = FONTS): Promise<string> {
	const fontFaces: string[] = [];
	for (const font of fonts) {
		try {
			const response = await fetchFn(font.url);
			if (!response.ok) {
				throw new Error(`${response.statusText}`);
			}
			const buffer = await response.arrayBuffer();
			const base64 = Buffer.from(buffer).toString("base64");
			const mimeType = font.format === "truetype" ? "font/ttf" : "font/woff2";
			fontFaces.push(`
@font-face {
  font-family: 'PT Serif';
  font-style: normal;
  font-weight: ${font.weight};
  font-display: swap;
  src: url(data:${mimeType};base64,${base64}) format('${font.format}');
}`);
		} catch {
			// Font fetch failed — continue without it
		}
	}
	return fontFaces.join("\n");
}

type ReadFileFn = (path: string) => Promise<Buffer>;

export async function inlineImages(
	html: string,
	baseDir: string,
	readFileFn: ReadFileFn
): Promise<string> {
	const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
	let result = html;
	const matches = [...html.matchAll(imgRegex)];

	for (const match of matches) {
		const fullTag = match[0];
		const src = match[1];

		if (
			src.startsWith("data:") ||
			src.startsWith("http://") ||
			src.startsWith("https://")
		) {
			continue;
		}

		// Use baseDir + src to build the path, but keep it as a simple join
		// so tests can predict the path without needing real filesystem layout
		const imgPath = baseDir + "/" + src;

		try {
			const buffer = await readFileFn(imgPath);
			const base64 = buffer.toString("base64");
			const mimeType = getMimeType(imgPath);
			const dataUri = `data:${mimeType};base64,${base64}`;
			let newTag = fullTag.replace(src, dataUri);
			newTag = newTag.replace(/\s*srcset=["'][^"']*["']/gi, "");
			newTag = newTag.replace(/\s*sizes=["'][^"']*["']/gi, "");
			result = result.replace(fullTag, newTag);
		} catch {
			// File not found — keep original src
		}
	}

	return result;
}
