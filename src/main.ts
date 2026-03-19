import { MarkdownView, Notice, Plugin } from "obsidian";
import { MdxPreviewView, MDX_PREVIEW_VIEW_TYPE } from "./preview-view";
import { getSourceModeState } from "./source-mode";
import { renderDocument } from "./renderer";
import { embedFonts, inlineImages } from "./standalone";
import { SyncSettingTab, DEFAULT_SETTINGS, type SyncSettings } from "./settings";
import {
	listDocuments,
	pullDocument,
	pushDocument,
	releaseDocument,
	type ConflictError,
} from "./sync";

export default class MdxPlugin extends Plugin {
	private renderTimer: ReturnType<typeof setTimeout> | null = null;
	private settingTab: SyncSettingTab | null = null;
	settings: SyncSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerExtensions(["mdx"], "markdown");

		this.registerView(
			MDX_PREVIEW_VIEW_TYPE,
			(leaf) => new MdxPreviewView(leaf)
		);

		this.addCommand({
			id: "toggle-cloud-assignment-preview",
			name: "Toggle Cloud Assignment Preview",
			callback: () => this.togglePreview(),
		});

		this.addRibbonIcon("eye", "Cloud Assignment Preview", () =>
			this.togglePreview()
		);

		this.settingTab = new SyncSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerObsidianProtocolHandler(
			"cloud-assignments",
			async (params) => {
				if (params.token && params.name) {
					this.settings.token = params.token;
					this.settings.userName = params.name;
					await this.saveSettings();
					new Notice(`Logged in as ${params.name}`);
					const view = this.getPreviewView();
					if (view) view.updateAuthState(true);
					this.settingTab?.display();
					await this.syncDocuments();
				}
			}
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const previewLeaves = this.app.workspace.getLeavesOfType(MDX_PREVIEW_VIEW_TYPE);
				if (previewLeaves.length > 0 && leaf === previewLeaves[0]) return;
				this.forceMdxSourceMode();
				this.renderActiveFile();
			})
		);

		this.registerEvent(
			this.app.workspace.on("editor-change", () => {
				this.debouncedRender();
			})
		);
	}

	onunload(): void {
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.app.workspace.detachLeavesOfType(MDX_PREVIEW_VIEW_TYPE);
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async togglePreview(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(MDX_PREVIEW_VIEW_TYPE);
		if (existing.length > 0) {
			existing.forEach((leaf) => leaf.detach());
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: MDX_PREVIEW_VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
		this.renderActiveFile();
	}

	private getPreviewView(): MdxPreviewView | null {
		const leaves =
			this.app.workspace.getLeavesOfType(MDX_PREVIEW_VIEW_TYPE);
		if (leaves.length === 0) return null;
		const view = leaves[0].view as MdxPreviewView;
		view.onExport = () => this.exportStandalone();
		view.onLogin = () => this.loginToServer();
		view.onSync = () => this.syncDocuments();
		view.onPull = () => this.pullFromServer();
		view.onPush = () => this.pushToServer();
		view.onRelease = () => this.releaseToServer();
		view.updateAuthState(!!this.settings.token);
		this.updateSyncStatus(view);
		return view;
	}

	private getActiveMdxSource(): { source: string; slug: string } | null {
		return this.getMdxSource(this.app.workspace.getActiveViewOfType(MarkdownView));
	}

	private findMdxSource(): { source: string; slug: string } | null {
		// Try active view first, then search all leaves
		const active = this.getActiveMdxSource();
		if (active) return active;
		let result: { source: string; slug: string } | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (result) return;
			if (leaf.view instanceof MarkdownView) {
				result = this.getMdxSource(leaf.view);
			}
		});
		return result;
	}

	private getMdxSource(editor: MarkdownView | null): { source: string; slug: string } | null {
		if (!editor?.file) return null;
		const path = editor.file.path;
		if (
			!path.includes("cloud-assignments/") ||
			!path.endsWith(".mdx")
		)
			return null;
		const source = editor.editor?.getValue() ?? null;
		if (!source) return null;
		return { source, slug: editor.file.basename };
	}

	private async renderActiveFile(): Promise<void> {
		const view = this.getPreviewView();
		if (!view) return;

		const active = this.getActiveMdxSource();
		if (!active) {
			view.showMessage(
				"Open an MDX file under cloud-assignments/ to preview."
			);
			return;
		}

		try {
			view.showMessage("Rendering…");
			let html = await renderDocument(active.source);
			html = html.replace(
				/(<img[^>]*src=["'])(images\/[^"']+)(["'])/gi,
				(_match, pre, path, post) => {
					const resourceUrl = this.app.vault.adapter.getResourcePath(path);
					return `${pre}${resourceUrl}${post}`;
				}
			);
			view.setHtml(html);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : String(err);
			view.showError(`Render error: ${message}`);
		}
	}

	private async exportStandalone(): Promise<void> {
		const view = this.getPreviewView();
		const active = this.findMdxSource();
		if (!view || !active) return;

		view.setExporting(true);
		try {
			let html = await renderDocument(active.source, active.slug);

			const fontStyles = await embedFonts();
			html = html.replace(
				"</head>",
				`<style>${fontStyles}</style>\n<style>.no-standalone{display:none!important}</style>\n</head>`
			);

			const adapter = this.app.vault.adapter;
			html = await inlineImages(html, "", async (imgPath) => {
				const vaultPath = imgPath.startsWith("/") ? imgPath.slice(1) : imgPath;
				const arrayBuffer = await adapter.readBinary(vaultPath);
				return Buffer.from(arrayBuffer);
			});

			const outputPath = `standalone/${active.slug}.html`;
			if (!await adapter.exists("standalone")) {
				await adapter.mkdir("standalone");
			}
			await adapter.write(outputPath, html);

			new Notice(`Exported ${outputPath}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Export failed: ${message}`);
		} finally {
			view.setExporting(false);
		}
	}

	private loginToServer(): void {
		if (!this.settings.serverUrl) {
			new Notice("Set Server URL in plugin settings first.");
			return;
		}
		window.open(`${this.settings.serverUrl}/accounts/plugin-auth/`);
	}

	private async syncDocuments(): Promise<void> {
		if (!this.settings.serverUrl || !this.settings.token) {
			new Notice("Log in first to sync documents.");
			return;
		}
		try {
			const docs = await listDocuments(
				this.settings.serverUrl,
				this.settings.token
			);
			const adapter = this.app.vault.adapter;
			if (!await adapter.exists("cloud-assignments")) {
				await adapter.mkdir("cloud-assignments");
			}
			let created = 0;
			for (const doc of docs) {
				if (doc.latest_version === null) continue;
				const filePath = `cloud-assignments/${doc.slug}.mdx`;
				if (await adapter.exists(filePath)) {
					if (!this.settings.versions[doc.slug]) {
						this.settings.versions[doc.slug] = doc.latest_version;
					}
					continue;
				}
				const detail = await pullDocument(
					this.settings.serverUrl,
					this.settings.token,
					doc.slug
				);
				await adapter.write(filePath, detail.mdx_source);
				this.settings.versions[doc.slug] = detail.version;
				created++;
			}
			await this.saveSettings();
			if (created > 0) {
				new Notice(`Synced ${created} new document${created > 1 ? "s" : ""}`);
			} else {
				new Notice("All documents already synced.");
			}
			this.updateSyncStatus(this.getPreviewView());
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Sync failed: ${message}`);
		}
	}

	private async pullFromServer(): Promise<void> {
		const active = this.findMdxSource();
		if (!active) {
			new Notice("Open an MDX file to pull.");
			return;
		}
		try {
			const result = await pullDocument(
				this.settings.serverUrl,
				this.settings.token,
				active.slug
			);
			const filePath = `cloud-assignments/${active.slug}.mdx`;
			await this.app.vault.adapter.write(filePath, result.mdx_source);
			this.settings.versions[active.slug] = result.version;
			await this.saveSettings();
			if (result.version === 0) {
				new Notice("No versions on server yet.");
			} else {
				new Notice(`Pulled v${result.version} by ${result.created_by}`);
			}
			this.updateSyncStatus(this.getPreviewView());
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Pull failed: ${message}`);
		}
	}

	private async pushToServer(): Promise<void> {
		const active = this.findMdxSource();
		if (!active) {
			new Notice("Open an MDX file to push.");
			return;
		}
		const baseVersion = this.settings.versions[active.slug] ?? 0;
		try {
			let result = await pushDocument(
				this.settings.serverUrl,
				this.settings.token,
				active.slug,
				active.source,
				baseVersion
			);
			if ("error" in result) {
				const conflict = result as ConflictError;
				if (conflict.server_version === 0 && baseVersion !== 0) {
					// Stale local version — server has no versions, retry with 0
					result = await pushDocument(
						this.settings.serverUrl,
						this.settings.token,
						active.slug,
						active.source,
						0
					);
				}
			}
			if ("error" in result) {
				const conflict = result as ConflictError;
				new Notice(
					`Conflict: server has v${conflict.server_version}` +
						(conflict.created_by
							? ` by ${conflict.created_by}`
							: "") +
						". Pull to get latest."
				);
			} else {
				this.settings.versions[active.slug] = result.version;
				await this.saveSettings();
				new Notice(`Pushed v${result.version}`);
				this.updateSyncStatus(this.getPreviewView());
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Push failed: ${message}`);
		}
	}

	private async releaseToServer(): Promise<void> {
		const view = this.getPreviewView();
		const active = this.findMdxSource();
		if (!view || !active) return;

		const version = this.settings.versions[active.slug];
		if (!version) {
			new Notice("Push first before releasing.");
			return;
		}

		try {
			let html = await renderDocument(active.source, active.slug);
			const fontStyles = await embedFonts();
			html = html.replace(
				"</head>",
				`<style>${fontStyles}</style>\n<style>.no-standalone{display:none!important}</style>\n</head>`
			);
			const adapter = this.app.vault.adapter;
			html = await inlineImages(html, "", async (imgPath) => {
				const vaultPath = imgPath.startsWith("/") ? imgPath.slice(1) : imgPath;
				const arrayBuffer = await adapter.readBinary(vaultPath);
				return Buffer.from(arrayBuffer);
			});

			const result = await releaseDocument(
				this.settings.serverUrl,
				this.settings.token,
				active.slug,
				version,
				html
			);
			new Notice(`Released v${result.version} to assignment ${result.assignment_id}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (message === "Failed to release document") {
				new Notice("No release exists for this document. Release it from the web UI first.");
			} else {
				new Notice(`Release failed: ${message}`);
			}
		}
	}

	private updateSyncStatus(view: MdxPreviewView | null): void {
		if (!view) return;
		const active = this.getActiveMdxSource();
		if (!active) {
			view.setSyncStatus("");
			return;
		}
		const version = this.settings.versions[active.slug];
		if (version) {
			view.setSyncStatus(`v${version}`);
		} else {
			view.setSyncStatus("not synced");
		}
	}

	private debouncedRender(): void {
		if (this.renderTimer) clearTimeout(this.renderTimer);
		this.renderTimer = setTimeout(() => {
			this.renderActiveFile();
		}, 300);
	}

	private forceMdxSourceMode(): void {
		setTimeout(() => {
			const view =
				this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;
			const newState = getSourceModeState(
				view.file?.extension,
				view.getState()
			);
			if (newState) {
				view.setState(newState);
			}
		}, 50);
	}
}
