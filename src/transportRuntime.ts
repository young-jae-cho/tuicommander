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
export function setRemoteAuthUsernameLookup(
	lookup: (connectionId: string) => string | undefined,
): void {
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
