use std::fs;
use std::path::Path;
use crate::settings::config::AppConfig;

pub struct SettingsPersistence;

impl SettingsPersistence {
    pub fn load_or_default<P: AsRef<Path>>(path: P) -> AppConfig {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(cfg) = serde_json::from_str(&content) {
                return cfg;
            }
        }
        AppConfig::default()
    }

    pub fn save<P: AsRef<Path>>(path: P, config: &AppConfig) -> Result<(), std::io::Error> {
        let content = serde_json::to_string_pretty(config)?;
        fs::write(path, content)?;
        Ok(())
    }
}
