import { type Component, onMount } from "solid-js";
import { FileBrowserPanel } from "../components/FileBrowserPanel";
import { initPanelWindow } from "../hooks/initPanelWindow";
import { invoke } from "../invoke";
import type { PanelAdapter } from "../panelRouter";
import { remoteConnectionsStore } from "../stores/remoteConnections";
import { repositoriesStore } from "../stores/repositories";
import { uiStore } from "../stores/ui";
import { openFileAction } from "../utils/filePreview";
import { createPanelSyncReceiver } from "../utils/panelSync";
import { repoConnectionInfo } from "../utils/repoRpc";

const DetachedFileBrowser: Component<{ params: URLSearchParams }> = (props) => {
	const repoPath = props.params.get("repoPath");
	const fsRoot = props.params.get("fsRoot");
	const { emitAction } = createPanelSyncReceiver<null>("file-browser");

	onMount(async () => {
		await initPanelWindow();
		// Seed the owning connection from what the main window passed, so repoRpc
		// routes to the daemon instead of throwing "not connected" (this window's
		// own remoteConnectionsStore is empty and must not re-open a tunnel).
		const connectionId = props.params.get("connectionId");
		const baseUrl = props.params.get("baseUrl");
		if (connectionId && baseUrl) {
			remoteConnectionsStore.seedConnected(connectionId, baseUrl, props.params.get("authUsername") ?? "");
		}
	});

	return (
		<FileBrowserPanel
			visible={true}
			repoPath={repoPath}
			fsRoot={fsRoot}
			mode="detached"
			onClose={() => window.close()}
			onFileOpen={(repo, filePath, line) => {
				void emitAction("openFile", { repoPath: repo, filePath, line });
				void invoke("focus_main_window");
			}}
		/>
	);
};

function getActiveFsRoot(): string | undefined {
	const activeRepo = repositoriesStore.getActive();
	if (!activeRepo?.activeWorkspaceId) return undefined;
	return activeRepo.workspaces[activeRepo.activeWorkspaceId]?.worktreePath || activeRepo.path;
}

export const fileBrowserPanelAdapter: PanelAdapter = {
	id: "file-browser",
	title: "File Browser",
	defaultSize: { width: 400, height: 700 },
	toggle: () => uiStore.toggleFileBrowserPanel(),
	onDetach: () => uiStore.setFileBrowserPanelVisible(false),
	detachParams: () => {
		const repoPath = repositoriesStore.state.activeRepoPath;
		const fsRoot = getActiveFsRoot();
		const conn = repoConnectionInfo(repoPath);
		return {
			...(repoPath ? { repoPath } : {}),
			...(fsRoot ? { fsRoot } : {}),
			...(conn ? { connectionId: conn.connectionId, baseUrl: conn.baseUrl, authUsername: conn.authUsername } : {}),
		};
	},
	handleAction(action: string, data: unknown) {
		if (action === "openFile" && data) {
			const d = data as Record<string, unknown>;
			const fsRoot = d.repoPath as string;
			const filePath = d.filePath as string;
			const line = d.line as number | undefined;
			const repoPath = repositoriesStore.state.activeRepoPath || fsRoot;
			openFileAction(filePath, repoPath, fsRoot || undefined, line);
			void invoke("focus_main_window");
		}
	},
	Component: DetachedFileBrowser,
};
