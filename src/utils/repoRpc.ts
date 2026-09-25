/**
 * Repo-scoped command routing: local repos use Tauri IPC (`invoke`), remote
 * repos must go over HTTP to their daemon (`rpc` with the connectionId), because
 * Tauri IPC is inherently local and cannot reach a `tuic-remote` host.
 *
 * Every repo-data fetch (diff, file browser, git history/branches/log, file
 * reads, worktree ops) resolves the owning repo's connectionId through this one
 * seam, so a repo bound to a remote connection has its whole data surface
 * routed + signed for that daemon — not just its terminal.
 *
 * A repo with no connectionId (the common local case) keeps using `invoke`, so
 * local behavior and the IPC fast path are unchanged.
 */

import { invoke } from "../invoke";
import { repositoriesStore } from "../stores/repositories";
import { rpc } from "../transport";

/** The connectionId owning `repoPath`, or undefined for a local repo. */
export function repoConnectionId(repoPath: string | null | undefined): string | undefined {
	if (!repoPath) return undefined;
	return repositoriesStore.getConnectionId(repoPath);
}

/**
 * Run a repo command against the backend that owns `repoPath`:
 * - local repo -> Tauri IPC (`invoke`)
 * - remote repo -> HTTP to its daemon, signed (`rpc` with connectionId)
 */
export function repoRpc<T>(repoPath: string, cmd: string, args: Record<string, unknown>): Promise<T> {
	const connectionId = repoConnectionId(repoPath);
	if (connectionId) return rpc<T>(cmd, args, connectionId);
	return invoke<T>(cmd, args);
}
