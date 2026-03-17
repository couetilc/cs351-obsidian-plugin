import { h, VNode } from "preact";
import { renderToString } from "preact-render-to-string";

interface CalloutConfig {
	emoji: string;
	label: string;
	borderColor: string;
	borderStyle: string;
	background: string;
	labelColor: string;
	className: string;
	centered?: boolean;
	conditionalContent?: boolean;
}

const CALLOUT_CONFIGS: Record<string, CalloutConfig> = {
	Important: {
		emoji: "🚨",
		label: "Important",
		borderColor: "#E6501B",
		borderStyle: "solid",
		background: "#fef6f3",
		labelColor: "#C3110C",
		className: "ca-important",
	},
	Info: {
		emoji: "🌈",
		label: "The More You Know",
		borderColor: "#8CE4FF",
		borderStyle: "solid",
		background: "#f9feff",
		labelColor: "#00C3FF",
		className: "ca-info",
	},
	Hint: {
		emoji: "💡",
		label: "Hint",
		borderColor: "#E6C31B",
		borderStyle: "solid",
		background: "#fefdf3",
		labelColor: "#B89B00",
		className: "ca-hint",
	},
	Instructions: {
		emoji: "📋",
		label: "Instructions",
		borderColor: "#34D399",
		borderStyle: "solid",
		background: "#f0fdf4",
		labelColor: "#16A34A",
		className: "ca-instructions",
	},
	VibeCheck: {
		emoji: "🔮",
		label: "Vibe Check",
		borderColor: "#B266FF",
		borderStyle: "solid",
		background: "#faf5ff",
		labelColor: "#8A2BE2",
		className: "ca-vibecheck",
	},
	Notice: {
		emoji: "📌",
		label: "Notice",
		borderColor: "#B0B0B0",
		borderStyle: "solid",
		background: "#f7f7f7",
		labelColor: "#808080",
		className: "ca-notice",
	},
	Reflect: {
		emoji: "🍭",
		label: "Food for thought",
		borderColor: "#F0A0B0",
		borderStyle: "solid",
		background: "#fef5f7",
		labelColor: "#D45D79",
		className: "ca-reflect",
	},
	Celebrate: {
		emoji: "🎉",
		label: "Nice work!",
		borderColor: "#c4a8e0",
		borderStyle: "solid",
		background: "linear-gradient(135deg, #fdf2f2, #fdf0fa, #f0f0fd, #edf8fd, #f0fdf4, #fefdf2)",
		labelColor: "#9b6fbf",
		className: "ca-celebrate",
	},
	Points: {
		emoji: "🤖",
		label: "Autograder",
		borderColor: "#14B8A6",
		borderStyle: "double",
		background: "#F0FDFA",
		labelColor: "#0F766E",
		className: "ca-points",
		centered: true,
		conditionalContent: true,
	},
};

function createCalloutComponent(name: string) {
	const config = CALLOUT_CONFIGS[name];

	return function CalloutComponent(props: { children?: VNode | VNode[] | string | null }): VNode {
		const hasChildren = props.children != null &&
			!(Array.isArray(props.children) && props.children.length === 0);

		let divClass = config.className;
		if (config.conditionalContent) {
			divClass += hasChildren ? " has-content" : " no-content";
		}

		return h("div", { class: divClass },
			h("strong", null, ` ${config.emoji} ${config.label} `),
			config.conditionalContent ? (hasChildren ? props.children : null) : props.children
		);
	};
}

export const calloutComponents: Record<string, (props: { children?: VNode | VNode[] | string | null }) => VNode> = {};

for (const name of Object.keys(CALLOUT_CONFIGS)) {
	calloutComponents[name] = createCalloutComponent(name);
}

export { CALLOUT_CONFIGS };
