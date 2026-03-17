import { h, VNode } from "preact";

interface MermaidProps {
	chart: string;
	children?: VNode | VNode[] | string | null;
}

export function Mermaid(props: MermaidProps): VNode {
	return h("div", { class: "ca-mermaid" },
		h("pre", { class: "mermaid" }, props.chart),
		h("script", { src: "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js" }),
		h("script", { dangerouslySetInnerHTML: { __html: "mermaid.initialize({ startOnLoad: true });" } }),
	);
}
