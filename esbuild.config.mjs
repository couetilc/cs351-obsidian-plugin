import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFile } from "fs/promises";

const production = process.argv[2] === "production";
const outdir = "dist";

const sharedOptions = {
	bundle: true,
	target: "es2020",
	logLevel: "info",
	treeShaking: true,
	minify: production,
	sourcemap: production ? false : "inline",
	loader: {
		".css": "text",
		".svg": "text",
	},
};

const obsidianExternals = [
	"obsidian",
	"electron",
	"@codemirror/autocomplete",
	"@codemirror/collab",
	"@codemirror/commands",
	"@codemirror/language",
	"@codemirror/lint",
	"@codemirror/search",
	"@codemirror/state",
	"@codemirror/view",
	"@lezer/common",
	"@lezer/highlight",
	"@lezer/lr",
	...builtins,
];

// Obsidian plugin bundle
const context = await esbuild.context({
	...sharedOptions,
	entryPoints: ["src/main.ts"],
	external: obsidianExternals,
	format: "cjs",
	outfile: `${outdir}/main.js`,
});

// Standalone builder bundle (runs in plain Node)
const standaloneContext = await esbuild.context({
	...sharedOptions,
	entryPoints: ["src/build-standalone.ts"],
	external: builtins,
	format: "esm",
	platform: "node",
	outfile: `${outdir}/build-standalone.mjs`,
});

// Copy manifest.json and styles.css to dist
async function copyAssets() {
	await copyFile("manifest.json", `${outdir}/manifest.json`);
}

if (production) {
	await context.rebuild();
	await standaloneContext.rebuild();
	await copyAssets();
	process.exit(0);
} else {
	await copyAssets();
	await context.watch();
	await standaloneContext.watch();
}
