import { h, VNode } from "preact";

interface MermaidProps {
	chart: string;
	children?: VNode | VNode[] | string | null;
}

export function Mermaid(props: MermaidProps): VNode {
	return h("div", { class: "ca-mermaid" },
		h("pre", { class: "mermaid" }, props.chart),
	);
}
