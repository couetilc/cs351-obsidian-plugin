import { h, VNode } from "preact";

interface EndpointProps {
	method?: string;
	path?: string;
	children?: VNode | VNode[] | string | null;
}

export function Endpoint(props: EndpointProps): VNode {
	return h("div", { class: "ca-endpoint" },
		h("strong", null,
			" 🔌 ",
			props.method,
			" ",
			h("span", { style: "font-weight:normal" }, props.path),
			" ",
		),
		props.children,
	);
}
