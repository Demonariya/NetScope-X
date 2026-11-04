use crate::bandwidth::policy::{ApplicationPriority, BandwidthLimitRule};
use crate::windows_utils::run_powershell_elevated;

const NETSCOPE_QOS_PREFIX: &str = "NetScopeX_";

pub struct WindowsQosManager;

impl WindowsQosManager {
    /// Constructs a safe NetScope-owned policy name to avoid colliding with external QoS policies.
    pub fn format_policy_name(target_type: &str, identifier: &str) -> String {
        let clean_id = identifier
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
            .collect::<String>();
        format!("{NETSCOPE_QOS_PREFIX}{target_type}_{clean_id}")
    }

    /// Applies or updates a real Windows Policy-based QoS policy.
    pub fn apply_rule(rule: &BandwidthLimitRule) -> Result<String, String> {
        let policy_name = Self::format_policy_name(&rule.target_type, &rule.target_identifier);

        // If rule has upload limit disabled and default priority, remove any existing QoS policy
        if !rule.upload_enabled && rule.priority == ApplicationPriority::Normal {
            return Self::remove_rule(&rule.target_type, &rule.target_identifier);
        }

        let mut script_parts = Vec::new();
        // First remove existing policy with this name to prevent conflict
        script_parts.push(format!(
            "Remove-NetQosPolicy -Name '{policy_name}' -Confirm:$false -ErrorAction SilentlyContinue;"
        ));

        let mut new_cmd = format!("New-NetQosPolicy -Name '{policy_name}'");

        // Target application or executable if applicable
        if rule.target_type == "application" || rule.target_type == "process" {
            if let Some(ref path) = rule.app_path {
                let clean_path = path.replace("'", "''");
                new_cmd.push_str(&format!(" -AppPathName '{clean_path}'"));
            } else if !rule.target_identifier.is_empty() {
                let clean_id = rule.target_identifier.replace("'", "''");
                new_cmd.push_str(&format!(" -AppPathName '{clean_id}'"));
            }
        }

        // Apply real outbound (upload) rate throttling in bits per second
        if rule.upload_enabled {
            if let Some(rate_bps) = rule.upload_limit_bps {
                if rate_bps > 0 {
                    new_cmd.push_str(&format!(" -ThrottleRateActionBitsPerSecond {rate_bps}"));
                }
            }
        }

        // Apply DSCP and 802.1p priority scheduling
        let dscp = rule.priority.to_dscp_action();
        let prio = rule.priority.to_8021p_priority();
        if dscp > 0 {
            new_cmd.push_str(&format!(" -DSCPAction {dscp}"));
        }
        if prio > 0 {
            new_cmd.push_str(&format!(" -PriorityValue8021Action {prio}"));
        }

        // Optional interface alias
        if let Some(ref alias) = rule.adapter_alias {
            if alias != "auto" && !alias.is_empty() {
                let clean_alias = alias.replace("'", "''");
                new_cmd.push_str(&format!(" -InterfaceAlias '{clean_alias}'"));
            }
        }

        new_cmd.push_str(" -PolicyStore 'ActiveStore' -Confirm:$false;");
        script_parts.push(new_cmd);

        let script = script_parts.join(" ");

        #[cfg(windows)]
        {
            run_powershell_elevated(&script)
        }
        #[cfg(not(windows))]
        {
            let _ = script;
            Ok("QoS rule simulated on non-Windows environment".to_string())
        }
    }

    /// Removes an application-owned NetScope QoS policy.
    pub fn remove_rule(target_type: &str, identifier: &str) -> Result<String, String> {
        let policy_name = Self::format_policy_name(target_type, identifier);
        let script = format!(
            "Remove-NetQosPolicy -Name '{policy_name}' -Confirm:$false -ErrorAction SilentlyContinue;"
        );

        #[cfg(windows)]
        {
            run_powershell_elevated(&script)
        }
        #[cfg(not(windows))]
        {
            let _ = script;
            Ok("QoS removal simulated".to_string())
        }
    }

    /// Removes all NetScope-owned QoS policies without touching unrelated user network policies.
    pub fn cleanup_all_netscope_rules() -> Result<String, String> {
        let script = format!(
            "Get-NetQosPolicy -Name '{NETSCOPE_QOS_PREFIX}*' -ErrorAction SilentlyContinue | Remove-NetQosPolicy -Confirm:$false -ErrorAction SilentlyContinue;"
        );

        #[cfg(windows)]
        {
            run_powershell_elevated(&script)
        }
        #[cfg(not(windows))]
        {
            let _ = script;
            Ok("All NetScope QoS policies cleaned up".to_string())
        }
    }
}
