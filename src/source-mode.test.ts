import { describe, it, expect } from "vitest";
import { getSourceModeState } from "./source-mode";

describe("getSourceModeState", () => {
	it("returns null for non-mdx files", () => {
		expect(getSourceModeState("md", { mode: "preview" })).toBeNull();
		expect(getSourceModeState(undefined, {})).toBeNull();
	});

	it("returns null if already in source mode", () => {
		expect(
			getSourceModeState("mdx", { mode: "source", source: true })
		).toBeNull();
	});

	it("returns source mode state for mdx files not in source mode", () => {
		const result = getSourceModeState("mdx", { mode: "preview" });
		expect(result).toEqual({ mode: "source", source: true });
	});

	it("preserves existing state properties", () => {
		const result = getSourceModeState("mdx", {
			mode: "preview",
			other: "value",
		});
		expect(result).toEqual({
			mode: "source",
			source: true,
			other: "value",
		});
	});
});
