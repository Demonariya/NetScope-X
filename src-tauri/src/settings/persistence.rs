use crate::settings::{config::AppConfig, validation::SettingsValidator};
use std::fs;
use std::path::Path;

pub struct SettingsPersistence;

impl SettingsPersistence {
    pub fn load_or_default<P: AsRef<Path>>(path: P) -> AppConfig {
        let path = path.as_ref();
        let mut config = match fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                Ok(config) => config,
                Err(error) => {
                    eprintln!(
                        "NetScope X could not parse settings file {}: {error}; using defaults.",
                        path.display()
                    );
                    AppConfig::default()
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppConfig::default(),
            Err(error) => {
                eprintln!(
                    "NetScope X could not read settings file {}: {error}; using defaults.",
                    path.display()
                );
                AppConfig::default()
            }
        };
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

#[cfg(test)]
mod tests {
    use super::SettingsPersistence;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn malformed_settings_fall_back_to_validated_defaults() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "netscope-invalid-settings-{}-{nonce}.json",
            std::process::id()
        ));
        fs::write(&path, "{ not valid json").expect("test settings file should be written");

        let config = SettingsPersistence::load_or_default(&path);

        assert_eq!(config.monitoring.adapter_id, "auto");
        assert_eq!(config.monitoring.update_interval_ms, 1000);
        fs::remove_file(&path).expect("test settings file should be removed");
    }
}
