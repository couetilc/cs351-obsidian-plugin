import { VNode } from "preact";
import { calloutComponents } from "./callout";
import { Editor } from "./editor";
import { Terminal } from "./terminal";
import { Screenshot } from "./screenshot";
import { Mermaid } from "./mermaid";
import { Detail } from "./detail";
import { ExternalLink } from "./external-link";
import { Hide } from "./hide";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentFn = (props: any) => VNode;

export const components: Record<string, ComponentFn> = {
	...calloutComponents,
	Editor,
	Terminal,
	Screenshot,
	Mermaid,
	Detail,
	ExternalLink,
	Hide,
	// Map <a> to ExternalLink so MDX auto-links get target="_blank"
	a: ExternalLink,
};
