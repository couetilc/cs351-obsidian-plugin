import { h, VNode } from "preact";

interface EditorProps {
	content?: string;
	filename?: string;
	lang?: string;
	Code?: (props: { children?: VNode | VNode[] | string | null }) => VNode;
	children?: VNode | VNode[] | string | null;
	/** Pre-rendered Shiki HTML, injected by the renderer */
	__shikiHtml?: string;
}

export function Editor(props: EditorProps): VNode {
	const { filename, Code, __shikiHtml } = props;

	// If a custom Code component is provided (like in assignment-1.mdx), use it
	let codeContent: VNode;
	if (Code) {
		codeContent = h(Code, { children: props.children });
	} else if (__shikiHtml) {
		codeContent = h("div", { dangerouslySetInnerHTML: { __html: __shikiHtml } });
	} else {
		// Fallback: render as plain pre/code
		const content = typeof props.content === "string" ? props.content.trim() : "";
		codeContent = h("pre", { class: "shiki github-light" }, h("code", null, content));
	}

	return h("div", { class: "ca-editor" },
		h("div", { class: "editor-window" },
			h("div", { class: "editor-bar" },
				h("div", { class: "macdots" },
					h("div", { class: "macdot-red" }),
					h("div", { class: "macdot-yellow" }),
					h("div", { class: "macdot-green" }),
				),
				h("div", { class: "editor-tab" },
					filename || h("i", null, "<Untitled>")
				),
				h("div", { class: "editor-tab-fill" }),
			),
			h("div", { class: "editor-content" }, codeContent),
		),
	);
}
