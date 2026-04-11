import { create } from "zustand";
import { commands } from "../bindings";

interface GatewayStatus {
  port: number;
  running: boolean;
  active_sessions: number;
  configured_routes: string[];
  configured_services: string[];
}

interface CredentialState {
  services: string[];
  gatewayStatus: GatewayStatus | null;
  loading: boolean;

  fetchCredentials: () => Promise<void>;
  addCredential: (service: string, key: string) => Promise<boolean>;
  removeCredential: (service: string) => Promise<void>;
  fetchGatewayStatus: () => Promise<void>;
}

export const useCredentialStore = create<CredentialState>((set) => ({
  services: [],
  gatewayStatus: null,
  loading: false,

  fetchCredentials: async () => {
    set({ loading: true });
    const result = await commands.listCredentials();
    if (result.status === "ok") {
      set({ services: result.data, loading: false });
    } else {
      set({ loading: false });
    }
  },

  addCredential: async (service, key) => {
    const result = await commands.addCredential(service, key);
    if (result.status === "ok") {
      // Re-fetch to update the list
      const listResult = await commands.listCredentials();
      if (listResult.status === "ok") {
        set({ services: listResult.data });
      }
      return true;
    }
    return false;
  },

  removeCredential: async (service) => {
    const result = await commands.removeCredential(service);
    if (result.status === "ok") {
      set((state) => ({
        services: state.services.filter((s) => s !== service),
      }));
    }
  },

  fetchGatewayStatus: async () => {
    const result = await commands.getGatewayStatus();
    if (result.status === "ok") {
      set({ gatewayStatus: result.data });
    }
  },
}));
