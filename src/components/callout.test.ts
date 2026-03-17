import { describe, it, expect } from "vitest";
import { renderToString } from "preact-render-to-string";
import { h } from "preact";
import { calloutComponents, CALLOUT_CONFIGS } from "./callout";

describe("callout components", () => {
	it("creates all 9 callout components", () => {
		expect(Object.keys(calloutComponents)).toHaveLength(9);
		expect(calloutComponents).toHaveProperty("Important");
		expect(calloutComponents).toHaveProperty("Info");
		expect(calloutComponents).toHaveProperty("Hint");
		expect(calloutComponents).toHaveProperty("Instructions");
		expect(calloutComponents).toHaveProperty("VibeCheck");
		expect(calloutComponents).toHaveProperty("Notice");
		expect(calloutComponents).toHaveProperty("Reflect");
		expect(calloutComponents).toHaveProperty("Celebrate");
		expect(calloutComponents).toHaveProperty("Points");
	});

	it("renders Important with correct emoji and class", () => {
		const html = renderToString(
			h(calloutComponents.Important, null, h("p", null, "Test content"))
		);
		expect(html).toContain("ca-important");
		expect(html).toContain("🚨");
		expect(html).toContain("Important");
		expect(html).toContain("Test content");
	});

	it("renders Points with has-content class when children present", () => {
		const html = renderToString(
			h(calloutComponents.Points, null, h("p", null, "10 points"))
		);
		expect(html).toContain("has-content");
		expect(html).toContain("🤖");
		expect(html).toContain("Autograder");
	});

	it("renders Points with no-content class when no children", () => {
		const html = renderToString(h(calloutComponents.Points, null));
		expect(html).toContain("no-content");
		expect(html).not.toContain("has-content");
	});

	it("renders Points with no-content class when children is empty array", () => {
		const html = renderToString(h(calloutComponents.Points, { children: [] as any }));
		expect(html).toContain("no-content");
		expect(html).not.toContain("has-content");
	});

	it("all callout configs have required fields", () => {
		for (const [name, config] of Object.entries(CALLOUT_CONFIGS)) {
			expect(config.emoji, `${name} emoji`).toBeTruthy();
			expect(config.label, `${name} label`).toBeTruthy();
			expect(config.borderColor, `${name} borderColor`).toBeTruthy();
			expect(config.className, `${name} className`).toBeTruthy();
		}
	});
});
