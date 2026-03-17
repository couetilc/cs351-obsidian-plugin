import { h, VNode } from "preact";
import cursorSvg from "../../icons/cursor-hand.svg";

interface CursorSpec {
	x?: string;
	y?: string;
	scale?: string | number;
	rotate?: string | number;
}

interface ScreenshotProps {
	image: string;
	alt: string;
	url?: string;
	cursor?: CursorSpec | CursorSpec[];
	children?: VNode | VNode[] | string | null;
}

export function Screenshot(props: ScreenshotProps): VNode {
	const { image, alt, url, cursor } = props;

	let cursors: CursorSpec[] | undefined;
	if (cursor && Array.isArray(cursor)) {
		cursors = cursor;
	} else if (cursor) {
		cursors = [cursor];
	}

	const cursorElements = cursors?.map((c, i) =>
		h("span", {
			key: i,
			class: "cursor",
			style: `--x:${c.x || 0};--y:${c.y || 0};--scale:${c.scale || 1};--rotate:${c.rotate || 0}`,
			dangerouslySetInnerHTML: { __html: cursorSvg },
		})
	);

	return h("div", { class: "ca-screenshot" },
		h("div", { class: "browser" },
			h("div", { class: "browser-bar" },
				h("div", { class: "macdot-red" }),
				h("div", { class: "macdot-yellow" }),
				h("div", { class: "macdot-green" }),
				h("div", { class: "address-bar" }, url || ""),
			),
			h("div", { class: "browser-content" },
				...(cursorElements || []),
				h("img", { src: image, alt, width: "600" }),
			),
		),
	);
}
