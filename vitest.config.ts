import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		alias: {
			obsidian: new URL("./src/__mocks__/obsidian.ts", import.meta.url).pathname,
		},
		coverage: {
			include: [
				"src/source-mode.ts",
				"src/renderer.ts",
				"src/standalone.ts",
				"src/build-standalone.ts",
				"src/components/**/*.ts",
				"src/sync.ts",
			],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100,
			},
		},
	},
});
