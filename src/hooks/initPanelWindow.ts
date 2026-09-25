import { appLogger } from "../stores/appLogger";
import { repositoriesStore } from "../stores/repositories";
import { settingsStore } from "../stores/settings";
import { applyAppTheme, applyFontFamily, listenForThemeChanges, loadThemes } from "../themes";

export async function initPanelWindow(): Promise<void> {
	document.getElementById("splash")?.remove();
	await settingsStore.hydrate().catch((e) => {
		appLogger.warn("panel", "Failed to hydrate settings in panel window — using defaults", e);
	});
	// A detached panel is a fresh WebView with an empty in-memory repositories
	// store. Repo-scoped data fetches route through repoRpc ->
	// repositoriesStore.getConnectionId(repoPath); without this hydrate the lookup
	// returns undefined and a remote repo's file browser / git panel read from the
	// LOCAL backend (where the server path does not exist) and show nothing.
	await repositoriesStore.hydrate().catch((e) => {
		appLogger.warn("panel", "Failed to hydrate repositories in panel window", e);
	});
	await loadThemes();
	void listenForThemeChanges();
	applyAppTheme(settingsStore.state.theme);
	applyFontFamily(settingsStore.state.font);
}
