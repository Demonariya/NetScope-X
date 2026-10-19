use crate::settings::{config::AppConfig, validation::SettingsValidator};
use std::fs;
use std::path::Path;

pub struct SettingsPersistence;

impl SettingsPersistence {
    pub fn load_or_default<P: AsRef<Path>>(path: P) -> AppConfig {
        let mut config = fs::read_to_string(path)
            .ok()
            .and_then(|content| serde_json::from_str::<AppConfig>(&content).ok())
            .unwrap_or_default();
        SettingsValidator::validate(&mut config);
        config
    }

    pub fn save<P: AsRef<Path>>(path: P, config: &AppConfig) -> Result<(), std::io::Error> {
        let mut config = config.clone();
        SettingsValidator::validate(&mut config);
        let content = serde_json::to_string_pretty(&config)?;
        fs::write(path, content)?;
        Ok(())
    }
}
