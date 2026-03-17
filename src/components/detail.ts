import { h, VNode } from "preact";

interface DetailProps {
	summary: string;
	children?: VNode | VNode[] | string | null;
}

export function Detail(props: DetailProps): VNode {
	return h("div", { class: "ca-detail" },
		h("details", null,
			h("summary", null, ` ${props.summary} `),
			props.children,
		),
		h("p", {
			class: "hint",
			onclick: "this.previousElementSibling.open = true",
		}, "(click to open)"),
	);
}
