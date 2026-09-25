export interface TransportLogger {
	debug(source: "network", message: string, data?: unknown): void;
	warn(source: "network", message: string, data?: unknown): void;
}

const noopLogger: TransportLogger = {
	debug() {},
	warn() {},
};

let logger: TransportLogger = noopLogger;
let remoteBaseUrlLookup: (connectionId: string) => string | undefined = () => undefined;
let remoteAuthUsernameLookup: (connectionId: string) => string | undefined = () => undefined;

/**
 * The `invoke` seam, injected by the remote-connections store.
 *
 * `remoteAuth.ts` needs the Tauri/HTTP `invoke` to read the keyring-backed
 * connection password, but importing `../invoke` statically closes a production
 * cycle (`invoke → appLogger → transport → remoteAuth → invoke`). Routing it
 * through this leaf seam keeps `transport.ts` acyclic, matching the base-URL and
 * auth-username lookups above. The default throws so a mis-wired call fails
 * loudly rather than silently returning no credentials.
 */
export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invokePort: InvokeFn = () =>
	Promise.reject(new Error("remoteAuth invoke port not wired (import the remote-connections store first)"));

export function setRemoteInvoke(fn: InvokeFn): void {
	invokePort = fn;
}

export function remoteInvoke(): InvokeFn {
	return invokePort;
}

export function setTransportLogger(nextLogger: TransportLogger): void {
	logger = nextLogger;
}

export function setRemoteBaseUrlLookup(lookup: (connectionId: string) => string | undefined): void {
	remoteBaseUrlLookup = lookup;
}

/**
 * Register the lookup that resolves a connection's Basic-Auth username.
 * Injected by the remote-connections store (same seam as the base-URL lookup)
 * so the transport can sign remote requests without importing the store.
 */
export function setRemoteAuthUsernameLookup(lookup: (connectionId: string) => string | undefined): void {
	remoteAuthUsernameLookup = lookup;
}

export function transportLogger(): TransportLogger {
	return logger;
}

export function getRemoteBaseUrl(connectionId: string): string | undefined {
	return remoteBaseUrlLookup(connectionId);
}

export function getRemoteAuthUsername(connectionId: string): string | undefined {
	return remoteAuthUsernameLookup(connectionId);
}

const LOG_PAYLOAD_PREVIEW = 500;

export function previewLogPayload(value: string): string {
	return value.length > LOG_PAYLOAD_PREVIEW ? `${value.slice(0, LOG_PAYLOAD_PREVIEW)}...` : value;
}
