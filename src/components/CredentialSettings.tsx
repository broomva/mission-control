import { useCallback, useEffect, useState } from "react";
import { useCredentialStore } from "../stores/credentialStore";

const KNOWN_SERVICES = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "github", label: "GitHub" },
  { value: "google", label: "Google AI" },
];

interface CredentialSettingsProps {
  onClose: () => void;
}

export function CredentialSettings({ onClose }: CredentialSettingsProps) {
  const {
    services,
    gatewayStatus,
    loading,
    fetchCredentials,
    addCredential,
    removeCredential,
    fetchGatewayStatus,
  } = useCredentialStore();

  const [newService, setNewService] = useState("");
  const [customService, setCustomService] = useState("");
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCredentials();
    fetchGatewayStatus();
  }, [fetchCredentials, fetchGatewayStatus]);

  const handleAdd = useCallback(async () => {
    const service = newService === "__custom__" ? customService : newService;
    if (!service || !newKey) {
      setError("Service name and API key are required.");
      return;
    }
    setAdding(true);
    setError(null);
    const ok = await addCredential(service, newKey);
    setAdding(false);
    if (ok) {
      setNewService("");
      setCustomService("");
      setNewKey("");
      fetchGatewayStatus();
    } else {
      setError("Failed to add credential.");
    }
  }, [newService, customService, newKey, addCredential, fetchGatewayStatus]);

  const handleRemove = useCallback(
    async (service: string) => {
      await removeCredential(service);
      fetchGatewayStatus();
    },
    [removeCredential, fetchGatewayStatus],
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="dialog-overlay" onClick={handleOverlayClick}>
      <div className="dialog credential-settings-dialog">
        <h3>Credential Settings</h3>

        {/* Gateway status */}
        {gatewayStatus && (
          <div className="credential-gateway-status">
            <div className="credential-status-row">
              <span className="credential-status-label">Gateway</span>
              <span className="credential-status-value">
                <span
                  className={`credential-status-dot ${gatewayStatus.running ? "status-running" : "status-stopped"}`}
                />
                {gatewayStatus.running ? "Running" : "Stopped"}
                <span className="credential-status-port">
                  :{gatewayStatus.port}
                </span>
              </span>
            </div>
            <div className="credential-status-row">
              <span className="credential-status-label">Active sessions</span>
              <span className="credential-status-value">
                {gatewayStatus.active_sessions}
              </span>
            </div>
          </div>
        )}

        {/* Configured credentials */}
        <div className="credential-list-section">
          <h4 className="credential-section-title">Configured Services</h4>
          {loading && (
            <p className="credential-loading">Loading...</p>
          )}
          {!loading && services.length === 0 && (
            <p className="credential-empty">
              No credentials configured. Add one below to enable the auth
              gateway.
            </p>
          )}
          {services.map((service) => (
            <div key={service} className="credential-row">
              <span className="credential-service-name">{service}</span>
              <span className="credential-key-placeholder">********</span>
              <button
                className="btn btn-danger credential-remove-btn"
                onClick={() => handleRemove(service)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        {/* Add credential form */}
        <div className="credential-add-section">
          <h4 className="credential-section-title">Add Credential</h4>

          <div className="dialog-field">
            <label htmlFor="cred-service">Service</label>
            <select
              id="cred-service"
              className="agent-type-select"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
            >
              <option value="">Select a service...</option>
              {KNOWN_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
          </div>

          {newService === "__custom__" && (
            <div className="dialog-field">
              <label htmlFor="cred-custom-service">Custom service name</label>
              <input
                id="cred-custom-service"
                type="text"
                value={customService}
                onChange={(e) => setCustomService(e.target.value)}
                placeholder="e.g. my-api"
              />
            </div>
          )}

          <div className="dialog-field">
            <label htmlFor="cred-key">API Key</label>
            <input
              id="cred-key"
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>

          {error && <p className="credential-error">{error}</p>}

          <div className="dialog-actions">
            <button className="btn btn-secondary" onClick={onClose} type="button">
              Close
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={adding || !newService || !newKey}
              type="button"
            >
              {adding ? "Adding..." : "Add Credential"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
