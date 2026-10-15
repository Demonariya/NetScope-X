use crate::settings::config::AppConfig;

pub struct SettingsValidator;

impl SettingsValidator {
    pub fn validate(config: &mut AppConfig) {
        // Enforce safe update intervals (minimum 500ms, maximum 10000ms)
        if config.monitoring.update_interval_ms < 500 {
            config.monitoring.update_interval_ms = 500;
        } else if config.monitoring.update_interval_ms > 10000 {
            config.monitoring.update_interval_ms = 10000;
        }

        // Enforce safe ping intervals (minimum 1000ms)
        if config.diagnostics.ping_interval_ms < 1000 {
            config.diagnostics.ping_interval_ms = 1000;
        }
    }
}
