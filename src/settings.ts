import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MdxPlugin from "./main";

export interface SyncSettings {
	serverUrl: string;
	token: string;
	userName: string;
	versions: Record<string, number>;
}

export const DEFAULT_SETTINGS: SyncSettings = {
	serverUrl: "",
	token: "",
	userName: "",
	versions: {},
};

export class SyncSettingTab extends PluginSettingTab {
	plugin: MdxPlugin;

	constructor(app: App, plugin: MdxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("e.g. https://www.cs351.test or https://www.cs351.cloud")
			.addText((text) =>
				text
					.setPlaceholder("https://www.cs351.cloud")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						const newUrl = value.replace(/\/+$/, "");
						if (newUrl !== this.plugin.settings.serverUrl) {
							this.plugin.settings.serverUrl = newUrl;
							this.plugin.settings.versions = {};
							this.plugin.settings.token = "";
							this.plugin.settings.userName = "";
						}
						await this.plugin.saveSettings();
					})
			);

		const loginSetting = new Setting(containerEl).setName("Account");

		if (this.plugin.settings.token) {
			loginSetting.setDesc(
				`Logged in as ${this.plugin.settings.userName}`
			);
			loginSetting.addButton((btn) =>
				btn.setButtonText("Log out").onClick(async () => {
					this.plugin.settings.token = "";
					this.plugin.settings.userName = "";
					await this.plugin.saveSettings();
					this.display();
				})
			);
		} else {
			loginSetting.setDesc("Not logged in");
			loginSetting.addButton((btn) =>
				btn
					.setButtonText("Login")
					.setCta()
					.onClick(() => {
						if (!this.plugin.settings.serverUrl) {
							new Notice(
								"Set Server URL first."
							);
							return;
						}
						window.open(
							`${this.plugin.settings.serverUrl}/accounts/plugin-auth/`
						);
					})
			);
		}
	}
}
