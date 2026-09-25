/**
 * Credential plumbing for remote daemon connections.
 *
 * A remote `tuic-remote` daemon guards every non-`/health` route with Basic
 * Auth (or the session-token cookie it issues). The desktop app reaches a
 * remote over plain HTTP, so each request must carry the connection's secret.
 * Two transports, two mechanisms:
 *
 * - **HTTP + SSE** can set headers / are `fetch`-like, so they use
 *   `Authorization: Basic`.
 * - **WebSocket** cannot set request headers from a browser/WebView, so the
 *   terminal stream authenticates with the `?token=` query param the daemon's
 *   auth middleware accepts (`auth::has_valid_url_token`). The token is fetched
 *   once over a Basic-authed call and cached per connection.
 *
 * The password is stored in the OS keyring via the Rust
 * `save_remote_connection_password` command — never in `connections.json`.
 * This module keeps an in-memory cache so the secret is read from the keyring
 * at most once per connection per session.
 */

import { remoteInvoke } from "../transportRuntime";

/** connectionId -> "user:password" */
const basicAuthCache = new Map<string, string>();
/** connectionId -> session token (for WebSocket `?token=`) */
const tokenCache = new Map<string, string>();

/**
 * Store a connection's Basic-Auth password in the OS keyring and prime the
 * in-memory cache. Called by the Connections UI on save.
 */
export async function setConnectionPassword(connectionId: string, password: string): Promise<void> {
	await remoteInvoke()("save_remote_connection_password", { id: connectionId, password });
	basicAuthCache.delete(connectionId);
	tokenCache.delete(connectionId);
}

/** Whether a password is stored for the connection (keyring-backed). */
export async function hasConnectionPassword(connectionId: string): Promise<boolean> {
	return remoteInvoke()<boolean>("has_remote_connection_password", { id: connectionId });
}

/** Drop cached credentials for a connection (on disconnect/delete). */
export function clearConnectionAuth(connectionId: string): void {
	basicAuthCache.delete(connectionId);
	tokenCache.delete(connectionId);
}

/**
 * Resolve the `Authorization: Basic` header value for a connection, reading the
 * password from the keyring on first use. Returns undefined when no password is
 * stored (e.g. a daemon with auth disabled), so callers omit the header.
 */
export async function getBasicAuthHeader(connectionId: string, username: string): Promise<string | undefined> {
	const cached = basicAuthCache.get(connectionId);
	if (cached !== undefined) return `Basic ${cached}`;

	let password: string | null;
	try {
		password = await remoteInvoke()<string | null>("read_remote_connection_password", { id: connectionId });
	} catch {
		// Command unavailable (older backend) — treat as "no stored password".
		return undefined;
	}
	if (password === null || password === undefined) return undefined;

	const encoded = btoa(`${username}:${password}`);
	basicAuthCache.set(connectionId, encoded);
	return `Basic ${encoded}`;
}

/**
 * Resolve the session token for a connection (for WebSocket `?token=`),
 * fetching it once over a Basic-authed request and caching it. Returns
 * undefined when the daemon exposes no token (auth disabled or older backend).
 */
export async function getSessionToken(
	baseUrl: string,
	connectionId: string,
	username: string,
): Promise<string | undefined> {
	const cached = tokenCache.get(connectionId);
	if (cached !== undefined) return cached;

	const auth = await getBasicAuthHeader(connectionId, username);
	const headers: Record<string, string> = {};
	if (auth) headers["Authorization"] = auth;

	try {
		const resp = await fetch(`${baseUrl}/api/session-token`, { headers });
		if (!resp.ok) return undefined;
		const data = (await resp.json()) as { token?: string };
		if (typeof data.token === "string" && data.token.length > 0) {
			tokenCache.set(connectionId, data.token);
			return data.token;
		}
	} catch {
		// Network/parse failure — leave unauthenticated; the WS will surface it.
	}
	return undefined;
}
