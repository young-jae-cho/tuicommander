import { beforeEach, describe, expect, it, vi } from "vitest";

// The transport reads the password from the keyring through the Tauri `invoke`
// seam; mock it so the cache logic is observable without a backend.
const invokeMock = vi.fn();
vi.mock("../../invoke", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import {
	clearConnectionAuth,
	getBasicAuthHeader,
	getSessionToken,
	setConnectionPassword,
} from "../../utils/remoteAuth";

describe("remoteAuth credential plumbing", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		clearConnectionAuth("c1");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "tok-xyz" }) }),
		);
	});

	it("reads the password from the keyring and encodes it as Basic", async () => {
		invokeMock.mockResolvedValue("s3cret");
		const header = await getBasicAuthHeader("c1", "admin");
		expect(invokeMock).toHaveBeenCalledWith("read_remote_connection_password", { id: "c1" });
		expect(header).toBe(`Basic ${btoa("admin:s3cret")}`);
	});

	it("omits the header when no password is stored (auth-disabled daemon)", async () => {
		invokeMock.mockResolvedValue(null);
		expect(await getBasicAuthHeader("c1", "admin")).toBeUndefined();
	});

	it("caches the credential — the keyring is read once per connection", async () => {
		invokeMock.mockResolvedValue("s3cret");
		await getBasicAuthHeader("c1", "admin");
		await getBasicAuthHeader("c1", "admin");
		expect(invokeMock).toHaveBeenCalledTimes(1);
	});

	it("clearConnectionAuth forces a re-read on next use", async () => {
		invokeMock.mockResolvedValue("s3cret");
		await getBasicAuthHeader("c1", "admin");
		clearConnectionAuth("c1");
		await getBasicAuthHeader("c1", "admin");
		expect(invokeMock).toHaveBeenCalledTimes(2);
	});

	it("setConnectionPassword persists to the keyring and invalidates caches", async () => {
		invokeMock.mockResolvedValue(undefined);
		await getBasicAuthHeader("c1", "admin"); // prime (invoke returns undefined → no cache)
		invokeMock.mockClear();
		await setConnectionPassword("c1", "new-pass");
		expect(invokeMock).toHaveBeenCalledWith("save_remote_connection_password", {
			id: "c1",
			password: "new-pass",
		});
	});

	it("fetches the session token once over a Basic-authed call and caches it", async () => {
		invokeMock.mockResolvedValue("s3cret");
		const token = await getSessionToken("http://remote:9877", "c1", "admin");
		expect(token).toBe("tok-xyz");
		expect(fetch).toHaveBeenCalledWith(
			"http://remote:9877/api/session-token",
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: `Basic ${btoa("admin:s3cret")}` }),
			}),
		);
		// Second call is served from cache — no extra fetch.
		await getSessionToken("http://remote:9877", "c1", "admin");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("returns undefined token when the endpoint is unreachable", async () => {
		invokeMock.mockResolvedValue("s3cret");
		(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
		expect(await getSessionToken("http://remote:9877", "c1", "admin")).toBeUndefined();
	});
});
