use chrono::Utc;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
}

impl Project {
    pub fn new(name: String, path: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            path,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}
