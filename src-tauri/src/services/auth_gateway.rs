use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, Response, StatusCode, Uri};
use axum::routing::any;
use axum::Router;
use serde::{Deserialize, Serialize};
use specta::Type;
use tracing::{error, info, warn};

use super::credential_store::CredentialStore;

// ── Public types ───────────────────────────────────────────────────

/// A route that maps an upstream API host to a credential service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRoute {
    /// Upstream hostname to match (e.g. "api.anthropic.com")
    pub host_pattern: String,
    /// Credential service name (key in CredentialStore)
    pub service_name: String,
    /// HTTP header that carries the credential (e.g. "x-api-key")
    pub header_name: String,
    /// Prefix prepended to the credential value (e.g. "Bearer ")
    pub header_prefix: String,
}

/// An active session token that authorises an agent to use the gateway.
#[derive(Debug, Clone)]
pub struct SessionToken {
    pub token: String,
    pub agent_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub revoked: bool,
}

/// Status snapshot exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GatewayStatus {
    pub port: u16,
    pub running: bool,
    pub active_sessions: u32,
    pub configured_routes: Vec<String>,
    pub configured_services: Vec<String>,
}

// ── Shared state ───────────────────────────────────────────────────

#[derive(Clone)]
struct GatewayState {
    routes: Arc<Vec<AuthRoute>>,
    store: Arc<CredentialStore>,
    sessions: Arc<Mutex<HashMap<String, SessionToken>>>,
    http_client: reqwest::Client,
}

// ── AuthGateway ────────────────────────────────────────────────────

pub struct AuthGateway {
    pub port: u16,
    routes: Arc<Vec<AuthRoute>>,
    store: Arc<CredentialStore>,
    sessions: Arc<Mutex<HashMap<String, SessionToken>>>,
}

impl AuthGateway {
    /// Spawn the gateway HTTP proxy on a random free port.
    pub async fn start(
        store: Arc<CredentialStore>,
        routes: Vec<AuthRoute>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let routes = Arc::new(routes);
        let sessions: Arc<Mutex<HashMap<String, SessionToken>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let http_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;

        let state = GatewayState {
            routes: Arc::clone(&routes),
            store: Arc::clone(&store),
            sessions: Arc::clone(&sessions),
            http_client,
        };

        let app = Router::new()
            .route("/{*path}", any(proxy_handler))
            .route("/", any(proxy_handler))
            .with_state(state);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        info!(port, "auth gateway started");

        tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                error!(error = %e, "auth gateway error");
            }
        });

        Ok(Self {
            port,
            routes,
            store,
            sessions,
        })
    }

    /// Create a session token for an agent. Returns the token string.
    pub fn create_session(&self, agent_id: &str) -> String {
        let token = uuid::Uuid::new_v4().to_string();
        let session = SessionToken {
            token: token.clone(),
            agent_id: agent_id.to_string(),
            created_at: chrono::Utc::now(),
            revoked: false,
        };
        self.sessions
            .lock()
            .unwrap()
            .insert(agent_id.to_string(), session);
        info!(agent_id, "gateway session created");
        token
    }

    /// Revoke the session for a given agent.
    pub fn revoke_session(&self, agent_id: &str) {
        let mut map = self.sessions.lock().unwrap();
        if let Some(session) = map.get_mut(agent_id) {
            session.revoked = true;
            info!(agent_id, "gateway session revoked");
        }
        // Also clean up fully
        map.remove(agent_id);
    }

    /// Return a snapshot of gateway status.
    pub fn status(&self) -> GatewayStatus {
        let sessions = self.sessions.lock().unwrap();
        let active = sessions.values().filter(|s| !s.revoked).count() as u32;
        GatewayStatus {
            port: self.port,
            running: true,
            active_sessions: active,
            configured_routes: self
                .routes
                .iter()
                .map(|r| format!("{} -> {}", r.host_pattern, r.service_name))
                .collect(),
            configured_services: self.store.list_services(),
        }
    }

    /// The proxy address for env vars (HTTP_PROXY / HTTPS_PROXY).
    pub fn proxy_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

// ── Default routes ─────────────────────────────────────────────────

pub fn default_auth_routes() -> Vec<AuthRoute> {
    vec![
        AuthRoute {
            host_pattern: "api.anthropic.com".to_string(),
            service_name: "anthropic".to_string(),
            header_name: "x-api-key".to_string(),
            header_prefix: String::new(),
        },
        AuthRoute {
            host_pattern: "api.openai.com".to_string(),
            service_name: "openai".to_string(),
            header_name: "Authorization".to_string(),
            header_prefix: "Bearer ".to_string(),
        },
        AuthRoute {
            host_pattern: "api.github.com".to_string(),
            service_name: "github".to_string(),
            header_name: "Authorization".to_string(),
            header_prefix: "token ".to_string(),
        },
        AuthRoute {
            host_pattern: "generativelanguage.googleapis.com".to_string(),
            service_name: "google".to_string(),
            header_name: "x-goog-api-key".to_string(),
            header_prefix: String::new(),
        },
    ]
}

// ── Proxy handler ──────────────────────────────────────────────────

async fn proxy_handler(
    State(state): State<GatewayState>,
    req: Request<Body>,
) -> Response<Body> {
    // 1. Determine the target host from the request.
    //    When used as an HTTP proxy, the client sends the full URL.
    //    We also check the Host header as a fallback.
    let target_host = req
        .uri()
        .host()
        .map(|h| h.to_string())
        .or_else(|| {
            req.headers()
                .get("host")
                .and_then(|v| v.to_str().ok())
                .map(|h| h.split(':').next().unwrap_or(h).to_string())
        })
        .unwrap_or_default();

    // 2. Find a matching auth route.
    let matched_route = state
        .routes
        .iter()
        .find(|r| r.host_pattern == target_host);

    // 3. Build the upstream URL.
    let upstream_uri = if req.uri().scheme().is_some() {
        // Full absolute URL (proxy-style request)
        req.uri().to_string()
    } else {
        // Relative path — reconstruct from Host header
        let scheme = "https";
        let path_and_query = req
            .uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");
        format!("{}://{}{}", scheme, target_host, path_and_query)
    };

    let upstream_uri = match upstream_uri.parse::<Uri>() {
        Ok(u) => u,
        Err(e) => {
            warn!(error = %e, uri = %upstream_uri, "invalid upstream URI");
            return error_response(StatusCode::BAD_REQUEST, "invalid upstream URI");
        }
    };

    // 4. Build the forwarded request.
    let method = req.method().clone();
    let mut builder = reqwest::Client::new().request(method.clone(), upstream_uri.to_string());

    // Copy original headers (except Host and hop-by-hop headers).
    for (name, value) in req.headers() {
        let n = name.as_str().to_lowercase();
        if matches!(
            n.as_str(),
            "host" | "connection" | "proxy-authorization" | "proxy-connection"
                | "transfer-encoding"
        ) {
            continue;
        }
        if let Ok(v) = value.to_str() {
            builder = builder.header(name.as_str(), v);
        }
    }

    // 5. Inject the real credential if we have a matching route + stored key.
    if let Some(route) = matched_route {
        if let Some(credential) = state.store.get(&route.service_name) {
            let header_value = format!("{}{}", route.header_prefix, credential);
            builder = builder.header(&route.header_name, &header_value);
            info!(
                host = %target_host,
                service = %route.service_name,
                "injected credential"
            );
        } else {
            warn!(
                host = %target_host,
                service = %route.service_name,
                "no credential stored for service"
            );
        }
    }

    // 6. Stream the request body.
    let body_bytes = match axum::body::to_bytes(req.into_body(), 50 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => {
            warn!(error = %e, "failed to read request body");
            return error_response(StatusCode::BAD_REQUEST, "failed to read body");
        }
    };
    if !body_bytes.is_empty() {
        builder = builder.body(body_bytes.to_vec());
    }

    // 7. Send upstream.
    let upstream_resp = match state.http_client.execute(builder.build().unwrap()).await {
        Ok(r) => r,
        Err(e) => {
            error!(error = %e, "upstream request failed");
            return error_response(StatusCode::BAD_GATEWAY, &format!("upstream error: {}", e));
        }
    };

    // 8. Map the upstream response back.
    let status = upstream_resp.status();
    let mut response_builder = Response::builder().status(status.as_u16());

    for (name, value) in upstream_resp.headers() {
        let n = name.as_str().to_lowercase();
        if matches!(n.as_str(), "transfer-encoding" | "connection") {
            continue;
        }
        response_builder = response_builder.header(name, value);
    }

    let resp_bytes = match upstream_resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            error!(error = %e, "failed to read upstream response");
            return error_response(
                StatusCode::BAD_GATEWAY,
                "failed to read upstream response",
            );
        }
    };

    response_builder
        .body(Body::from(resp_bytes))
        .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "response build error"))
}

fn error_response(status: StatusCode, message: &str) -> Response<Body> {
    let body = serde_json::json!({ "error": message }).to_string();
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_routes_cover_major_apis() {
        let routes = default_auth_routes();
        assert_eq!(routes.len(), 4);

        let hosts: Vec<&str> = routes.iter().map(|r| r.host_pattern.as_str()).collect();
        assert!(hosts.contains(&"api.anthropic.com"));
        assert!(hosts.contains(&"api.openai.com"));
        assert!(hosts.contains(&"api.github.com"));
        assert!(hosts.contains(&"generativelanguage.googleapis.com"));
    }

    #[test]
    fn anthropic_route_uses_x_api_key() {
        let routes = default_auth_routes();
        let anthropic = routes
            .iter()
            .find(|r| r.service_name == "anthropic")
            .unwrap();
        assert_eq!(anthropic.header_name, "x-api-key");
        assert_eq!(anthropic.header_prefix, "");
    }

    #[test]
    fn openai_route_uses_bearer() {
        let routes = default_auth_routes();
        let openai = routes
            .iter()
            .find(|r| r.service_name == "openai")
            .unwrap();
        assert_eq!(openai.header_name, "Authorization");
        assert_eq!(openai.header_prefix, "Bearer ");
    }

    #[tokio::test]
    async fn gateway_starts_and_creates_sessions() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(CredentialStore::new(dir.path().join("creds.bin")));
        let gw = AuthGateway::start(store, default_auth_routes())
            .await
            .unwrap();

        assert!(gw.port > 0);
        assert!(gw.proxy_url().starts_with("http://127.0.0.1:"));

        let token = gw.create_session("agent-1");
        assert!(!token.is_empty());

        let status = gw.status();
        assert_eq!(status.active_sessions, 1);
        assert!(status.running);

        gw.revoke_session("agent-1");
        let status2 = gw.status();
        assert_eq!(status2.active_sessions, 0);
    }

    #[tokio::test]
    async fn status_reflects_configured_services() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(CredentialStore::new(dir.path().join("creds.bin")));
        store.add("anthropic", "sk-test");
        store.add("openai", "sk-oai-test");

        let gw = AuthGateway::start(store, default_auth_routes())
            .await
            .unwrap();

        let status = gw.status();
        assert_eq!(status.configured_services.len(), 2);
        assert!(status.configured_services.contains(&"anthropic".to_string()));
        assert_eq!(status.configured_routes.len(), 4);
    }
}
