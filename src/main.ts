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
	listAssignments,
	fetchImageManifest,
	uploadImage,
	downloadImage,
	extractImagePaths,
	hashArrayBuffer,
	SyncError,
	type ConflictError,
} from "./sync";
import { AssignmentPickerModal } from "./assignment-picker-modal";

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
			const mdxSources: string[] = [];
			let created = 0;
			for (const doc of docs) {
				if (doc.latest_version === null) continue;
				const filePath = `cloud-assignments/${doc.slug}.mdx`;
				if (await adapter.exists(filePath)) {
					if (!this.settings.versions[doc.slug]) {
						this.settings.versions[doc.slug] = doc.latest_version;
					}
					const source = await adapter.read(filePath);
					mdxSources.push(source);
					continue;
				}
				const detail = await pullDocument(
					this.settings.serverUrl,
					this.settings.token,
					doc.slug
				);
				await adapter.write(filePath, detail.mdx_source);
				this.settings.versions[doc.slug] = detail.version;
				mdxSources.push(detail.mdx_source);
				created++;
			}
			await this.saveSettings();
			if (created > 0) {
				new Notice(`Synced ${created} new document${created > 1 ? "s" : ""}`);
			} else {
				new Notice("All documents already synced.");
			}
			this.updateSyncStatus(this.getPreviewView());
			await this.pullImages(mdxSources.join("\n"));
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
			await this.pullImages(result.mdx_source);
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
				await this.pushImages(active.source);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Push failed: ${message}`);
		}
	}

	private async pushImages(mdxSource: string): Promise<void> {
		const imagePaths = extractImagePaths(mdxSource);
		if (imagePaths.length === 0) return;
		const adapter = this.app.vault.adapter;
		const manifest = await fetchImageManifest(
			this.settings.serverUrl, this.settings.token,
		);
		const serverHashes = new Map(manifest.map((e) => [e.path, e.content_hash]));
		let uploaded = 0;
		for (const path of imagePaths) {
			if (!await adapter.exists(path)) continue;
			const data = await adapter.readBinary(path);
			const localHash = await hashArrayBuffer(data);
			if (serverHashes.get(path) === localHash) continue;
			await uploadImage(
				this.settings.serverUrl, this.settings.token, path, data,
			);
			uploaded++;
		}
		if (uploaded > 0) {
			new Notice(`Pushed ${uploaded} image${uploaded > 1 ? "s" : ""}`);
		}
	}

	private async pullImages(mdxSource: string): Promise<void> {
		const imagePaths = extractImagePaths(mdxSource);
		if (imagePaths.length === 0) return;
		const adapter = this.app.vault.adapter;
		const manifest = await fetchImageManifest(
			this.settings.serverUrl, this.settings.token,
		);
		const serverHashes = new Map(manifest.map((e) => [e.path, e.content_hash]));
		let downloaded = 0;
		for (const path of imagePaths) {
			const serverHash = serverHashes.get(path);
			if (!serverHash) continue;
			if (await adapter.exists(path)) {
				const localData = await adapter.readBinary(path);
				const localHash = await hashArrayBuffer(localData);
				if (localHash === serverHash) continue;
			}
			const dir = path.substring(0, path.lastIndexOf("/"));
			if (dir && !await adapter.exists(dir)) {
				await adapter.mkdir(dir);
			}
			const data = await downloadImage(
				this.settings.serverUrl, this.settings.token, path,
			);
			await adapter.writeBinary(path, data);
			downloaded++;
		}
		if (downloaded > 0) {
			new Notice(`Downloaded ${downloaded} image${downloaded > 1 ? "s" : ""}`);
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
			const html = await this.renderReleaseHtml(active.source, active.slug);

			try {
				const result = await releaseDocument(
					this.settings.serverUrl,
					this.settings.token,
					active.slug,
					version,
					html
				);
				new Notice(`Released v${result.version} to ${result.assignment_name}`);
			} catch (err) {
				if (err instanceof SyncError && err.status === 400) {
					await this.pickAssignmentAndRelease(active.slug, version, html);
				} else {
					throw err;
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Release failed: ${message}`);
		}
	}

	private async pickAssignmentAndRelease(slug: string, version: number, html: string): Promise<void> {
		const assignments = await listAssignments(
			this.settings.serverUrl,
			this.settings.token
		);
		if (assignments.length === 0) {
			new Notice("No assignments found.");
			return;
		}
		new AssignmentPickerModal(this.app, assignments, async (assignment) => {
			try {
				const result = await releaseDocument(
					this.settings.serverUrl,
					this.settings.token,
					slug,
					version,
					html,
					assignment.id
				);
				new Notice(`Released v${result.version} to ${result.assignment_name}`);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				new Notice(`Release failed: ${message}`);
			}
		}).open();
	}

	private async renderReleaseHtml(source: string, slug: string): Promise<string> {
		let html = await renderDocument(source, slug);
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
		return html;
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
