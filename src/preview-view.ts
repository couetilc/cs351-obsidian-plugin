import { ItemView, WorkspaceLeaf } from "obsidian";

export const MDX_PREVIEW_VIEW_TYPE = "cloud-assignment-preview";

const BTN_STYLE =
	"font-family:'PT Serif',serif;font-size:13px;padding:2px 10px;" +
	"background:#ffffff;color:#333;border:1px solid #dee2e6;border-radius:4px;cursor:pointer;";

export class MdxPreviewView extends ItemView {
	private iframe: HTMLIFrameElement | null = null;
	private messageEl: HTMLDivElement | null = null;
	private toolbarEl: HTMLDivElement | null = null;
	private errorBannerEl: HTMLDivElement | null = null;
	private exportBtn: HTMLButtonElement | null = null;
	private loginBtn: HTMLButtonElement | null = null;
	private syncBtn: HTMLButtonElement | null = null;
	private pullBtn: HTMLButtonElement | null = null;
	private pushBtn: HTMLButtonElement | null = null;
	private releaseBtn: HTMLButtonElement | null = null;
	private helpBtn: HTMLButtonElement | null = null;
	private helpEl: HTMLDivElement | null = null;
	private statusEl: HTMLSpanElement | null = null;
	private lastScrollTop = 0;
	private scrollHandler = (): void => {
		const scrollTop = this.iframe?.contentDocument?.documentElement?.scrollTop;
		if (scrollTop !== undefined && scrollTop > 0) {
			this.lastScrollTop = scrollTop;
		}
	};
	onExport: (() => void) | null = null;
	onLogin: (() => void) | null = null;
	onSync: (() => void) | null = null;
	onPull: (() => void) | null = null;
	onPush: (() => void) | null = null;
	onRelease: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return MDX_PREVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Cloud Assignment Preview";
	}

	getIcon(): string {
		return "eye";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("mdx-preview-container");

		this.toolbarEl = container.createDiv({ cls: "mdx-preview-toolbar" });
		this.toolbarEl.style.cssText =
			"display:none;padding:6px 12px;background:#ffffff;border-bottom:1px solid #dee2e6;" +
			"font-family:'PT Serif',serif;font-size:13px;color:#333;" +
			"display:flex;gap:6px;align-items:center;flex-wrap:wrap;";

		this.exportBtn = this.toolbarEl.createEl("button", { text: "Export to HTML" });
		this.exportBtn.style.cssText = BTN_STYLE;
		this.exportBtn.addEventListener("click", () => this.onExport?.());

		this.loginBtn = this.toolbarEl.createEl("button", { text: "Login" });
		this.loginBtn.style.cssText = BTN_STYLE;
		this.loginBtn.addEventListener("click", () => this.onLogin?.());

		this.syncBtn = this.toolbarEl.createEl("button", { text: "Sync" });
		this.syncBtn.style.cssText = BTN_STYLE;
		this.syncBtn.addEventListener("click", () => this.onSync?.());

		this.pullBtn = this.toolbarEl.createEl("button", { text: "Pull" });
		this.pullBtn.style.cssText = BTN_STYLE;
		this.pullBtn.addEventListener("click", () => this.onPull?.());

		this.pushBtn = this.toolbarEl.createEl("button", { text: "Push" });
		this.pushBtn.style.cssText = BTN_STYLE;
		this.pushBtn.addEventListener("click", () => this.onPush?.());

		this.releaseBtn = this.toolbarEl.createEl("button", { text: "Release" });
		this.releaseBtn.style.cssText = BTN_STYLE;
		this.releaseBtn.addEventListener("click", () => this.onRelease?.());

		this.helpBtn = this.toolbarEl.createEl("button", { text: "?" });
		this.helpBtn.style.cssText = BTN_STYLE + "font-weight:bold;padding:2px 8px;";
		this.helpBtn.title = "Pull/Push/Release workflow";
		this.helpBtn.addEventListener("click", () => this.toggleHelp());

		this.statusEl = this.toolbarEl.createEl("span", { text: "" });
		this.statusEl.style.cssText =
			"margin-left:auto;font-size:12px;color:#666;white-space:nowrap;";

		this.iframe = document.createElement("iframe");
		this.iframe.addClass("mdx-preview-iframe");
		this.iframe.setAttribute("sandbox", "allow-same-origin allow-popups");
		this.iframe.style.width = "100%";
		this.iframe.style.flex = "1";
		this.iframe.style.border = "none";
		container.style.display = "flex";
		container.style.flexDirection = "column";
		container.style.height = "100%";
		container.appendChild(this.iframe);

		this.iframe.addEventListener("load", () => {
			this.iframe?.contentDocument?.addEventListener("scroll", this.scrollHandler);
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf === this.leaf) {
					this.iframe?.contentWindow?.focus();
				}
			})
		);

		this.messageEl = container.createDiv({ cls: "mdx-preview-overlay" });
		this.showMessage("Open an MDX file to preview.");
	}

	async onClose(): Promise<void> {
		this.iframe?.contentDocument?.removeEventListener("scroll", this.scrollHandler);
		this.lastScrollTop = 0;
		this.iframe = null;
		this.messageEl = null;
		this.errorBannerEl = null;
		this.toolbarEl = null;
		this.exportBtn = null;
		this.loginBtn = null;
		this.syncBtn = null;
		this.pullBtn = null;
		this.pushBtn = null;
		this.releaseBtn = null;
		this.helpBtn = null;
		this.helpEl = null;
		this.statusEl = null;
	}

	setHtml(html: string): void {
		if (!this.iframe) return;
		this.hideOverlay();
		this.clearRenderError();

		const scrollTop = this.lastScrollTop;

		this.iframe.srcdoc = html;

		if (scrollTop > 0) {
			this.iframe.addEventListener("load", () => {
				this.iframe?.contentDocument?.documentElement?.scrollTo(0, scrollTop);
			}, { once: true });
		}
	}

	setExporting(active: boolean): void {
		if (!this.exportBtn) return;
		this.exportBtn.textContent = active ? "Exporting…" : "Export to HTML";
		this.exportBtn.disabled = active;
	}

	setSyncStatus(text: string): void {
		if (this.statusEl) this.statusEl.textContent = text;
	}

	updateAuthState(isLoggedIn: boolean): void {
		if (this.loginBtn) {
			this.loginBtn.style.display = isLoggedIn ? "none" : "";
		}
		if (this.syncBtn) this.syncBtn.style.display = isLoggedIn ? "" : "none";
		if (this.pullBtn) this.pullBtn.style.display = isLoggedIn ? "" : "none";
		if (this.pushBtn) this.pushBtn.style.display = isLoggedIn ? "" : "none";
		if (this.releaseBtn) this.releaseBtn.style.display = isLoggedIn ? "" : "none";
	}

	showMessage(msg: string): void {
		if (!this.messageEl) return;
		this.messageEl.className = "mdx-preview-overlay mdx-preview-message";
		this.messageEl.textContent = msg;
		this.messageEl.style.display = "flex";
		if (this.iframe) this.iframe.style.display = "none";
		if (this.toolbarEl) this.toolbarEl.style.display = "none";
	}

	showError(error: string): void {
		if (!this.messageEl) return;
		this.messageEl.className = "mdx-preview-overlay mdx-preview-error";
		this.messageEl.textContent = error;
		this.messageEl.style.display = "flex";
		if (this.iframe) this.iframe.style.display = "none";
		if (this.toolbarEl) this.toolbarEl.style.display = "none";
	}

	showRenderError(msg: string): void {
		if (!this.errorBannerEl) {
			const container = this.containerEl.children[1] as HTMLElement;
			this.errorBannerEl = container.createDiv({ cls: "mdx-render-error-banner" });
			this.errorBannerEl.style.cssText =
				"padding:8px 12px;background:#fef2f2;color:#991b1b;border-bottom:1px solid #fca5a5;" +
				"font-family:monospace;font-size:12px;white-space:pre-wrap;overflow:auto;max-height:120px;";
			if (this.iframe) {
				container.insertBefore(this.errorBannerEl, this.iframe);
			}
		}
		this.errorBannerEl.textContent = msg;
	}

	clearRenderError(): void {
		if (this.errorBannerEl) {
			this.errorBannerEl.remove();
			this.errorBannerEl = null;
		}
	}

	private toggleHelp(): void {
		if (this.helpEl) {
			this.helpEl.remove();
			this.helpEl = null;
			return;
		}
		const container = this.containerEl.children[1] as HTMLElement;
		this.helpEl = container.createDiv();
		this.helpEl.style.cssText =
			"padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #dee2e6;" +
			"font-family:'PT Serif',serif;font-size:13px;color:#333;line-height:1.5;";
		this.helpEl.innerHTML =
			"<strong>Sync</strong> — download all documents from the server to your vault.<br>" +
			"<strong>Pull</strong> — download the latest version of the current document.<br>" +
			"<strong>Push</strong> — upload your local edits as a new version on the server. " +
			"Only the MDX source is saved; the server does not render it.<br>" +
			"<strong>Release</strong> — render the current document to HTML and publish it " +
			"to the server. If no release exists yet, you'll be prompted to pick an assignment.";
		if (this.toolbarEl?.nextSibling) {
			container.insertBefore(this.helpEl, this.toolbarEl.nextSibling);
		}
	}

	private hideOverlay(): void {
		if (this.messageEl) this.messageEl.style.display = "none";
		if (this.iframe) this.iframe.style.display = "block";
		if (this.toolbarEl) this.toolbarEl.style.display = "flex";
	}
}
