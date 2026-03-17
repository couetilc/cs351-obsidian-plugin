import { h, VNode } from "preact";

interface ExternalLinkProps {
	href?: string;
	children?: VNode | VNode[] | string | null;
	[key: string]: unknown;
}

export function ExternalLink(props: ExternalLinkProps): VNode {
	const { href, children, ...rest } = props;
	const isExternal = href?.startsWith("http://") || href?.startsWith("https://");

	if (isExternal) {
		return h("a", { href, target: "_blank", rel: "noopener noreferrer", ...rest }, children);
	}
	return h("a", { href, ...rest }, children);
}
