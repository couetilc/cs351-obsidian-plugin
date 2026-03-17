import { h, VNode } from "preact";

interface TerminalProps {
	content?: string;
	children?: VNode | VNode[] | string | null;
	/** Pre-rendered Shiki HTML, injected by the renderer */
	__shikiHtml?: string;
}

export function Terminal(props: TerminalProps): VNode {
	const { __shikiHtml } = props;

	let codeContent: VNode;
	if (__shikiHtml) {
		codeContent = h("div", { dangerouslySetInnerHTML: { __html: __shikiHtml } });
	} else {
		const content = typeof props.content === "string" ? props.content.trim() : "";
		codeContent = h("pre", { class: "shiki" }, h("code", null, content));
	}

	return h("div", { class: "ca-terminal" },
		h("div", { class: "terminal-window" },
			h("div", { class: "terminal-bar" },
				h("div", { class: "macdot-red" }),
				h("div", { class: "macdot-yellow" }),
				h("div", { class: "macdot-green" }),
				h("div", null, "Terminal"),
			),
			h("div", { class: "terminal-content" }, codeContent),
		),
	);
}
