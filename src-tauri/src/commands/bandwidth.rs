use crate::bandwidth::policy::{
    ApplicationPriority, BandwidthCapabilities, BandwidthConfig, BandwidthLimitRule,
    BandwidthProfile,
};
use crate::bandwidth::qos_manager::WindowsQosManager;
use tauri::command;

#[command]
pub async fn get_bandwidth_capabilities() -> Result<BandwidthCapabilities, String> {
    Ok(BandwidthCapabilities::default())
}

#[command]
pub async fn get_bandwidth_config() -> Result<BandwidthConfig, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let global_rule = BandwidthLimitRule {
        id: "global_rule".to_string(),
        name: "Global Limit".to_string(),
        target_type: "global".to_string(),
        target_identifier: "global".to_string(),
        app_path: None,
        pid: None,
        download_limit_bps: None,
        upload_limit_bps: None,
        download_enabled: false,
        upload_enabled: false,
        priority: ApplicationPriority::Normal,
        adapter_alias: Some("auto".to_string()),
        upload_enforcement: "disabled".to_string(),
        download_enforcement: "advisory".to_string(),
        enforcement_message: None,
        is_group_rule: false,
    };

    let default_profile = BandwidthProfile {
        id: "preset_balanced".to_string(),
        name: "Balanced Mode".to_string(),
        description: "Standard Windows default networking without artificial rate throttling."
            .to_string(),
        is_preset: true,
        preset_type: Some("balanced".to_string()),
        global_download_limit_bps: None,
        global_upload_limit_bps: None,
        global_download_enabled: false,
        global_upload_enabled: false,
        adapter_alias: "auto".to_string(),
        app_rules: Vec::new(),
        default_priority: ApplicationPriority::Normal,
        created_at: now,
    };

    Ok(BandwidthConfig {
        active_profile_id: "preset_balanced".to_string(),
        profiles: vec![default_profile],
        global_rule,
        app_rules: Vec::new(),
        capabilities: BandwidthCapabilities::default(),
        is_paused: false,
    })
}

#[command]
pub async fn apply_global_bandwidth_limit(
    download_limit_bps: Option<u64>,
    upload_limit_bps: Option<u64>,
    download_enabled: bool,
    upload_enabled: bool,
    adapter_alias: Option<String>,
) -> Result<BandwidthLimitRule, String> {
    let mut rule = BandwidthLimitRule {
        id: "global_rule".to_string(),
        name: "Global Limit".to_string(),
        target_type: "global".to_string(),
        target_identifier: "global".to_string(),
        app_path: None,
        pid: None,
        download_limit_bps,
        upload_limit_bps,
        download_enabled,
        upload_enabled,
        priority: ApplicationPriority::Normal,
        adapter_alias: adapter_alias.or_else(|| Some("auto".to_string())),
        upload_enforcement: if upload_enabled && upload_limit_bps.unwrap_or(0) > 0 {
            "enforced".to_string()
        } else {
            "disabled".to_string()
        },
        download_enforcement: if download_enabled && download_limit_bps.unwrap_or(0) > 0 {
            "advisory".to_string()
        } else {
            "disabled".to_string()
        },
        enforcement_message: None,
        is_group_rule: false,
    };

    let result = tauri::async_runtime::spawn_blocking({
        let rule_clone = rule.clone();
        move || WindowsQosManager::apply_rule(&rule_clone)
    })
    .await
    .map_err(|error| format!("QoS worker failed: {error}"))?;

    match result {
        Ok(msg) => {
            rule.enforcement_message = Some(msg);
            Ok(rule)
        }
        Err(err) => {
            rule.upload_enforcement = "failed".to_string();
            rule.enforcement_message = Some(err.clone());
            Err(err)
        }
    }
}

#[command]
#[allow(clippy::too_many_arguments)]
pub async fn apply_app_bandwidth_limit(
    name: String,
    target_type: String, // "application" | "process"
    target_identifier: String,
    app_path: Option<String>,
    pid: Option<u32>,
    download_limit_bps: Option<u64>,
    upload_limit_bps: Option<u64>,
    download_enabled: bool,
    upload_enabled: bool,
    priority: Option<String>,
    is_group_rule: Option<bool>,
) -> Result<BandwidthLimitRule, String> {
    let prio = match priority.as_deref() {
        Some("Critical") => ApplicationPriority::Critical,
        Some("High") => ApplicationPriority::High,
        Some("Low") => ApplicationPriority::Low,
        Some("Background") => ApplicationPriority::Background,
        _ => ApplicationPriority::Normal,
    };

    let mut rule = BandwidthLimitRule {
        id: format!("{}_{}", target_type, target_identifier),
        name,
        target_type,
        target_identifier,
        app_path,
        pid,
        download_limit_bps,
        upload_limit_bps,
        download_enabled,
        upload_enabled,
        priority: prio,
        adapter_alias: None,
        upload_enforcement: if upload_enabled && upload_limit_bps.unwrap_or(0) > 0 {
            "enforced".to_string()
        } else {
            "disabled".to_string()
        },
        download_enforcement: if download_enabled && download_limit_bps.unwrap_or(0) > 0 {
            "advisory".to_string()
        } else {
            "disabled".to_string()
        },
        enforcement_message: None,
        is_group_rule: is_group_rule.unwrap_or(false),
    };

    let result = tauri::async_runtime::spawn_blocking({
        let rule_clone = rule.clone();
        move || WindowsQosManager::apply_rule(&rule_clone)
    })
    .await
    .map_err(|error| format!("QoS app worker failed: {error}"))?;

    match result {
        Ok(msg) => {
            rule.enforcement_message = Some(msg);
            Ok(rule)
        }
        Err(err) => {
            rule.upload_enforcement = "failed".to_string();
            rule.enforcement_message = Some(err.clone());
            Err(err)
        }
    }
}

#[command]
pub async fn remove_bandwidth_limit(
    target_type: String,
    target_identifier: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        WindowsQosManager::remove_rule(&target_type, &target_identifier)
    })
    .await
    .map_err(|error| format!("QoS remove worker failed: {error}"))?
    .map(|_| true)
}

#[command]
pub async fn reset_all_bandwidth_limits() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(WindowsQosManager::cleanup_all_netscope_rules)
        .await
        .map_err(|error| format!("QoS cleanup worker failed: {error}"))?
        .map(|_| true)
}
