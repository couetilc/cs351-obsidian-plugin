export const requestUrl = async () => ({});
export class Plugin {}
export class ItemView {
	containerEl = { children: [null, { empty() {}, createDiv() { return { innerHTML: "" }; }, addClass() {} }] };
	constructor(public leaf: any) {}
	getViewType() { return ""; }
	getDisplayText() { return ""; }
}
export class MarkdownView {}
export class Notice {}
export class WorkspaceLeaf {}
