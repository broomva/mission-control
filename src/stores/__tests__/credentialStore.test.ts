import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    listCredentials: vi.fn(),
    addCredential: vi.fn(),
    removeCredential: vi.fn(),
    getGatewayStatus: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useCredentialStore } from "../credentialStore";

const mockedCommands = vi.mocked(commands);

describe("credentialStore", () => {
  beforeEach(() => {
    useCredentialStore.setState({
      services: [],
      gatewayStatus: null,
      loading: false,
    });
    vi.clearAllMocks();
  });

  describe("fetchCredentials", () => {
    it("loads service names from backend", async () => {
      mockedCommands.listCredentials.mockResolvedValue({
        status: "ok",
        data: ["anthropic", "openai"],
      });

      await useCredentialStore.getState().fetchCredentials();

      expect(useCredentialStore.getState().services).toEqual([
        "anthropic",
        "openai",
      ]);
      expect(useCredentialStore.getState().loading).toBe(false);
    });

    it("sets loading false on error", async () => {
      mockedCommands.listCredentials.mockResolvedValue({
        status: "error",
        error: { IoError: "disk failed" },
      });

      await useCredentialStore.getState().fetchCredentials();

      expect(useCredentialStore.getState().services).toEqual([]);
      expect(useCredentialStore.getState().loading).toBe(false);
    });
  });

  describe("addCredential", () => {
    it("adds a credential and refreshes list", async () => {
      mockedCommands.addCredential.mockResolvedValue({
        status: "ok",
        data: null,
      });
      mockedCommands.listCredentials.mockResolvedValue({
        status: "ok",
        data: ["anthropic"],
      });

      const ok = await useCredentialStore
        .getState()
        .addCredential("anthropic", "sk-test");

      expect(ok).toBe(true);
      expect(mockedCommands.addCredential).toHaveBeenCalledWith(
        "anthropic",
        "sk-test",
      );
      expect(useCredentialStore.getState().services).toEqual(["anthropic"]);
    });

    it("returns false on error", async () => {
      mockedCommands.addCredential.mockResolvedValue({
        status: "error",
        error: { AgentError: "empty key" },
      });

      const ok = await useCredentialStore
        .getState()
        .addCredential("anthropic", "");

      expect(ok).toBe(false);
    });
  });

  describe("removeCredential", () => {
    it("removes a credential from state", async () => {
      useCredentialStore.setState({
        services: ["anthropic", "openai"],
      });
      mockedCommands.removeCredential.mockResolvedValue({
        status: "ok",
        data: null,
      });

      await useCredentialStore.getState().removeCredential("anthropic");

      expect(useCredentialStore.getState().services).toEqual(["openai"]);
    });
  });

  describe("fetchGatewayStatus", () => {
    it("loads gateway status", async () => {
      const status = {
        port: 12345,
        running: true,
        active_sessions: 2,
        configured_routes: ["api.anthropic.com -> anthropic"],
        configured_services: ["anthropic"],
      };
      mockedCommands.getGatewayStatus.mockResolvedValue({
        status: "ok",
        data: status,
      });

      await useCredentialStore.getState().fetchGatewayStatus();

      expect(useCredentialStore.getState().gatewayStatus).toEqual(status);
    });
  });
});
