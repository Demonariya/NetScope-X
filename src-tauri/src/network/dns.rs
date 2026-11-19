use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, UdpSocket};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DnsConfig {
    pub adapter_alias: String,
    #[serde(default)]
    pub adapter_description: Option<String>,
    #[serde(default)]
    pub interface_index: Option<u32>,
    pub is_dhcp: bool,
    #[serde(default)]
    pub ipv4_is_dhcp: bool,
    #[serde(default)]
    pub ipv6_is_dhcp: bool,
    pub ipv4_servers: Vec<String>,
    pub ipv6_servers: Vec<String>,
    #[serde(default)]
    pub dns_suffix: Option<String>,
    pub status: String,
    pub response_time_ms: Option<f64>,
    #[serde(default)]
    pub ipv4_reachable: Option<bool>,
    #[serde(default)]
    pub ipv4_latency_ms: Option<f64>,
    #[serde(default)]
    pub ipv6_reachable: Option<bool>,
    #[serde(default)]
    pub ipv6_latency_ms: Option<f64>,
    #[serde(default)]
    pub tested_at: Option<i64>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsResourceRecord {
    pub value: String,
    pub ttl: Option<u32>,
    pub record_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsQueryResult {
    pub query: String,
    pub record_type: String,
    pub records: Vec<String>,
    #[serde(default)]
    pub detailed_records: Vec<DnsResourceRecord>,
    pub response_time_ms: f64,
    #[serde(default)]
    pub resolver_used: String,
    #[serde(default)]
    pub queried_at: i64,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsTestResult {
    pub server_ip: String,
    pub reachable: bool,
    pub latency_ms: f64,
    #[serde(default)]
    pub tested_at: i64,
    #[serde(default)]
    pub query_host: Option<String>,
    #[serde(default)]
    pub record_type: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn validate_hostname(host: &str) -> Result<String, String> {
    let trimmed = host.trim().trim_end_matches('.');
    if trimmed.is_empty() {
        return Err("Target hostname cannot be empty.".to_string());
    }
    if trimmed.len() > 253 {
        return Err("Hostname exceeds maximum length of 253 characters.".to_string());
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Hostname contains invalid whitespace or control characters.".to_string());
    }
    for label in trimmed.split('.') {
        if label.is_empty() || label.len() > 63 {
            return Err(format!("Invalid DNS label in hostname: {trimmed}"));
        }
        if !label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(format!("Invalid characters in hostname: {trimmed}"));
        }
    }
    Ok(trimmed.to_string())
}

fn qtype_code(record_type: &str) -> Option<u16> {
    match record_type.trim().to_uppercase().as_str() {
        "A" => Some(1),
        "NS" => Some(2),
        "CNAME" => Some(5),
        "MX" => Some(15),
        "TXT" => Some(16),
        "AAAA" => Some(28),
        _ => None,
    }
}

pub(crate) fn build_dns_query_packet(
    tx_id: u16,
    host: &str,
    qtype: u16,
) -> Result<Vec<u8>, String> {
    let clean_host = validate_hostname(host)?;
    let mut packet = Vec::with_capacity(64);
    packet.extend_from_slice(&tx_id.to_be_bytes());
    packet.extend_from_slice(&[0x01, 0x00]); // Standard recursive query
    packet.extend_from_slice(&1u16.to_be_bytes()); // QDCOUNT = 1
    packet.extend_from_slice(&0u16.to_be_bytes()); // ANCOUNT = 0
    packet.extend_from_slice(&0u16.to_be_bytes()); // NSCOUNT = 0
    packet.extend_from_slice(&0u16.to_be_bytes()); // ARCOUNT = 0

    for label in clean_host.split('.') {
        packet.push(label.len() as u8);
        packet.extend_from_slice(label.as_bytes());
    }
    packet.push(0x00);
    packet.extend_from_slice(&qtype.to_be_bytes());
    packet.extend_from_slice(&1u16.to_be_bytes()); // Class IN
    Ok(packet)
}

fn normalize_ip_slice<T: std::str::FromStr>(servers: &[String]) -> Result<Vec<String>, String> {
    let mut cleaned = Vec::new();
    for raw in servers {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.parse::<T>().is_err() {
            return Err(format!("Invalid IP address format: {trimmed}"));
        }
        if !cleaned
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(trimmed))
        {
            cleaned.push(trimmed.to_string());
        }
    }
    Ok(cleaned)
}

pub(crate) fn verify_applied_dns(
    observed: &DnsConfig,
    expected_v4: Option<&[String]>,
    expected_v6: Option<&[String]>,
) -> Result<(), String> {
    if let Some(v4) = expected_v4.filter(|list| !list.is_empty()) {
        let all_v4_present = v4.iter().all(|target| {
            observed
                .ipv4_servers
                .iter()
                .any(|actual| actual.eq_ignore_ascii_case(target))
        });
        if observed.ipv4_is_dhcp || !all_v4_present {
            return Err(format!(
                "Windows did not verify the applied IPv4 DNS servers ({}).",
                v4.join(", ")
            ));
        }
    }

    if let Some(v6) = expected_v6.filter(|list| !list.is_empty()) {
        let all_v6_present = v6.iter().all(|target| {
            observed
                .ipv6_servers
                .iter()
                .any(|actual| actual.eq_ignore_ascii_case(target))
        });
        if observed.ipv6_is_dhcp || !all_v6_present {
            return Err(format!(
                "Windows did not verify the applied IPv6 DNS servers ({}).",
                v6.join(", ")
            ));
        }
    }

    Ok(())
}

pub(crate) fn derive_dns_status(config: &mut DnsConfig) {
    let has_v4 = !config.ipv4_servers.is_empty();
    let has_v6 = !config.ipv6_servers.is_empty();

    if config.adapter_alias.is_empty() || config.adapter_alias.eq_ignore_ascii_case("unknown") {
        config.status = "unavailable".to_string();
        return;
    }

    if !has_v4 && !has_v6 {
        config.status = "unconfigured".to_string();
        return;
    }

    if let Some(primary_v4) = config.ipv4_servers.first() {
        let test = DnsManager::test_dns_server(primary_v4, None, None);
        config.ipv4_reachable = Some(test.reachable);
        config.tested_at = Some(test.tested_at);
        if test.reachable {
            config.ipv4_latency_ms = Some(test.latency_ms);
            config.response_time_ms = Some(test.latency_ms);
        } else {
            config.ipv4_latency_ms = None;
            config.response_time_ms = None;
            if config.last_error.is_none() {
                config.last_error = test.error_message;
            }
        }
    }

    if let Some(primary_v6) = config.ipv6_servers.first() {
        let test_v6 = DnsManager::test_dns_server(primary_v6, None, None);
        config.ipv6_reachable = Some(test_v6.reachable);
        if config.tested_at.is_none() {
            config.tested_at = Some(test_v6.tested_at);
        }
        if test_v6.reachable {
            config.ipv6_latency_ms = Some(test_v6.latency_ms);
            if config.response_time_ms.is_none() {
                config.response_time_ms = Some(test_v6.latency_ms);
            }
        } else {
            config.ipv6_latency_ms = None;
        }
    }

    let any_reachable =
        config.ipv4_reachable.unwrap_or(false) || config.ipv6_reachable.unwrap_or(false);
    config.status = if any_reachable {
        "configured".to_string()
    } else {
        "unreachable".to_string()
    };
}

pub struct DnsManager;

impl DnsManager {
    /// Retrieve current DNS configuration for a given adapter alias or active default adapter.
    pub fn get_adapter_dns_config(adapter_alias: Option<&str>) -> Result<DnsConfig, String> {
        #[cfg(windows)]
        {
            let target_alias = escape_ps_single_quoted(adapter_alias.unwrap_or(""));
            let script = r#"
$ErrorActionPreference = 'Stop'
$alias = '__TARGET_ALIAS__'
$adapter = $null

if (-not [string]::IsNullOrWhiteSpace($alias) -and $alias -ne 'auto') {
    $adapter = Get-NetAdapter -Name $alias -ErrorAction SilentlyContinue
}
if ($null -eq $adapter) {
    $defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
        Sort-Object -Property RouteMetric |
        Select-Object -First 1
    if ($defaultRoute) {
        $adapter = Get-NetAdapter -InterfaceIndex $defaultRoute.InterfaceIndex -ErrorAction SilentlyContinue
    }
}
if ($null -eq $adapter) {
    $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -eq 'Up' } |
        Select-Object -First 1
}

if ($null -eq $adapter) {
    return '{"adapterAlias":"Unknown","adapterDescription":null,"interfaceIndex":null,"isDhcp":true,"ipv4IsDhcp":true,"ipv6IsDhcp":true,"ipv4Servers":[],"ipv6Servers":[],"dnsSuffix":null,"status":"unavailable","responseTimeMs":null}'
}

$intAlias = [string]$adapter.Name
$ifIndex = [int]$adapter.ifIndex
$guid = [string]$adapter.InterfaceGuid
$desc = [string]$adapter.InterfaceDescription
$dnsAddresses = @(Get-DnsClientServerAddress -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue)
$ipv4List = @()
$ipv6List = @()

foreach ($item in $dnsAddresses) {
    if ($item.AddressFamily -eq 2) {
        $ipv4List += $item.ServerAddresses
    } elseif ($item.AddressFamily -eq 23) {
        $ipv6List += $item.ServerAddresses
    }
}

$ipv4IsDhcp = $true
$ipv6IsDhcp = $true

try {
    if ($guid) {
        $v4Reg = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid" -ErrorAction SilentlyContinue
        if ($null -ne $v4Reg -and -not [string]::IsNullOrWhiteSpace([string]$v4Reg.NameServer)) {
            $ipv4IsDhcp = $false
        }
        $v6Reg = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters\Interfaces\$guid" -ErrorAction SilentlyContinue
        if ($null -ne $v6Reg -and -not [string]::IsNullOrWhiteSpace([string]$v6Reg.NameServer)) {
            $ipv6IsDhcp = $false
        }
    }
} catch {
    # Fallback to netsh below
}

try {
    $netshV4 = netsh interface ipv4 show dns name="$intAlias" 2>$null
    if ($netshV4 -match 'statically configured') {
        $ipv4IsDhcp = $false
    }
    $netshV6 = netsh interface ipv6 show dns name="$intAlias" 2>$null
    if ($netshV6 -match 'statically configured') {
        $ipv6IsDhcp = $false
    }
} catch {
    # Registry evaluation stands
}

$dnsSuffix = $null
try {
    $dnsClient = Get-DnsClient -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($dnsClient -and -not [string]::IsNullOrWhiteSpace([string]$dnsClient.ConnectionSpecificSuffix)) {
        $dnsSuffix = [string]$dnsClient.ConnectionSpecificSuffix
    }
} catch {}

$cleanV4 = @($ipv4List | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
$cleanV6 = @($ipv6List | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
$combinedDhcp = ($ipv4IsDhcp -and $ipv6IsDhcp)

[pscustomobject]@{
    adapterAlias = $intAlias
    adapterDescription = $desc
    interfaceIndex = $ifIndex
    isDhcp = [bool]$combinedDhcp
    ipv4IsDhcp = [bool]$ipv4IsDhcp
    ipv6IsDhcp = [bool]$ipv6IsDhcp
    ipv4Servers = $cleanV4
    ipv6Servers = $cleanV6
    dnsSuffix = $dnsSuffix
    status = if ($cleanV4.Count -gt 0 -or $cleanV6.Count -gt 0) { 'configured' } else { 'unconfigured' }
    responseTimeMs = $null
} | ConvertTo-Json -Depth 4 -Compress
"#
            .replace("__TARGET_ALIAS__", &target_alias);

            let json = crate::windows_utils::run_powershell(&script)?;
            let mut config: DnsConfig = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse DNS config JSON: {e}"))?;
            derive_dns_status(&mut config);
            Ok(config)
        }

        #[cfg(not(windows))]
        {
            let alias = adapter_alias.unwrap_or("eth0").to_string();
            let now = now_epoch_ms();
            Ok(DnsConfig {
                adapter_alias: alias,
                adapter_description: Some("Network Adapter".to_string()),
                interface_index: Some(1),
                is_dhcp: true,
                ipv4_is_dhcp: true,
                ipv6_is_dhcp: true,
                ipv4_servers: vec!["1.1.1.1".to_string(), "1.0.0.1".to_string()],
                ipv6_servers: vec!["2606:4700:4700::1111".to_string()],
                dns_suffix: None,
                status: "configured".to_string(),
                response_time_ms: Some(14.2),
                ipv4_reachable: Some(true),
                ipv4_latency_ms: Some(14.2),
                ipv6_reachable: Some(true),
                ipv6_latency_ms: Some(16.0),
                tested_at: Some(now),
                last_error: None,
            })
        }
    }

    /// Set DNS servers for a Windows network adapter (supports IPv4 and IPv6 independently) and verify.
    pub fn set_adapter_dns(
        adapter_alias: &str,
        ipv4_servers: &[String],
        ipv6_servers: Option<&[String]>,
    ) -> Result<(), String> {
        let clean_alias = adapter_alias.trim();
        if clean_alias.is_empty() {
            return Err("Network adapter alias cannot be empty.".to_string());
        }

        let valid_v4 = normalize_ip_slice::<Ipv4Addr>(ipv4_servers)?;
        let valid_v6 = match ipv6_servers {
            Some(list) => normalize_ip_slice::<Ipv6Addr>(list)?,
            None => Vec::new(),
        };

        if valid_v4.is_empty() && valid_v6.is_empty() {
            return Err("At least one valid IPv4 or IPv6 DNS server must be provided.".to_string());
        }

        #[cfg(windows)]
        {
            let previous = Self::get_adapter_dns_config(Some(clean_alias)).ok();
            let escaped_alias = escape_ps_single_quoted(clean_alias);

            let apply_family_script = |servers: &[String]| -> String {
                let server_literals = servers
                    .iter()
                    .map(|s| format!("'{}'", escape_ps_single_quoted(s)))
                    .collect::<Vec<_>>()
                    .join(",");
                format!("@({server_literals})")
            };

            let mut statements = vec![
                "$ErrorActionPreference = 'Stop'".to_string(),
                format!("$alias = '{escaped_alias}'"),
                "$adapter = Get-NetAdapter -Name $alias -ErrorAction SilentlyContinue".to_string(),
                "if ($null -eq $adapter) { throw \"Adapter '$alias' was not found.\" }".to_string(),
            ];

            if !valid_v4.is_empty() {
                let v4_arr = apply_family_script(&valid_v4);
                statements.push(format!("$v4 = {v4_arr}"));
                statements.push(
                    "netsh interface ipv4 set dnsservers name=\"$alias\" source=static address=\"$($v4[0])\" register=primary validate=no | Out-Null".to_string(),
                );
                statements.push(
                    "for ($i = 1; $i -lt $v4.Count; $i++) { netsh interface ipv4 add dnsservers name=\"$alias\" address=\"$($v4[$i])\" index=($i + 1) validate=no | Out-Null }".to_string(),
                );
            }

            if !valid_v6.is_empty() {
                let v6_arr = apply_family_script(&valid_v6);
                statements.push(format!("$v6 = {v6_arr}"));
                statements.push(
                    "netsh interface ipv6 set dnsservers name=\"$alias\" source=static address=\"$($v6[0])\" register=primary validate=no | Out-Null".to_string(),
                );
                statements.push(
                    "for ($i = 1; $i -lt $v6.Count; $i++) { netsh interface ipv6 add dnsservers name=\"$alias\" address=\"$($v6[$i])\" index=($i + 1) validate=no | Out-Null }".to_string(),
                );
            }

            statements.push("Clear-DnsClientCache -ErrorAction SilentlyContinue".to_string());
            let script = statements.join("\n");
            crate::windows_utils::run_powershell(&script)?;

            let verified = Self::get_adapter_dns_config(Some(clean_alias))?;
            if let Err(err) = verify_applied_dns(
                &verified,
                if valid_v4.is_empty() {
                    None
                } else {
                    Some(&valid_v4)
                },
                if valid_v6.is_empty() {
                    None
                } else {
                    Some(&valid_v6)
                },
            ) {
                if let Some(prev) = previous {
                    if prev.is_dhcp {
                        let _ = Self::reset_adapter_dns_dhcp(clean_alias, None);
                    } else {
                        let mut rollback = vec![
                            "$ErrorActionPreference = 'SilentlyContinue'".to_string(),
                            format!("$alias = '{escaped_alias}'"),
                        ];
                        if !prev.ipv4_servers.is_empty() {
                            let arr = apply_family_script(&prev.ipv4_servers);
                            rollback.push(format!("$pv4 = {arr}"));
                            rollback.push("netsh interface ipv4 set dnsservers name=\"$alias\" source=static address=\"$($pv4[0])\" validate=no | Out-Null".to_string());
                        } else if prev.ipv4_is_dhcp {
                            rollback.push("netsh interface ipv4 set dnsservers name=\"$alias\" source=dhcp | Out-Null".to_string());
                        }
                        if !prev.ipv6_servers.is_empty() {
                            let arr = apply_family_script(&prev.ipv6_servers);
                            rollback.push(format!("$pv6 = {arr}"));
                            rollback.push("netsh interface ipv6 set dnsservers name=\"$alias\" source=static address=\"$($pv6[0])\" validate=no | Out-Null".to_string());
                        } else if prev.ipv6_is_dhcp {
                            rollback.push("netsh interface ipv6 set dnsservers name=\"$alias\" source=dhcp | Out-Null".to_string());
                        }
                        let _ = crate::windows_utils::run_powershell(&rollback.join("\n"));
                    }
                }
                return Err(err);
            }
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let _ = (clean_alias, valid_v4, valid_v6);
            Ok(())
        }
    }

    /// Restore DNS configuration to automatic DHCP (supports all, ipv4, or ipv6 independently) and verify.
    pub fn reset_adapter_dns_dhcp(adapter_alias: &str, family: Option<&str>) -> Result<(), String> {
        let clean_alias = adapter_alias.trim();
        if clean_alias.is_empty() {
            return Err("Network adapter alias cannot be empty.".to_string());
        }
        let target_family = family.unwrap_or("all").trim().to_lowercase();
        if !matches!(target_family.as_str(), "all" | "ipv4" | "ipv6") {
            return Err(format!(
                "Unsupported DNS family for DHCP reset: {target_family}"
            ));
        }

        #[cfg(windows)]
        {
            let escaped_alias = escape_ps_single_quoted(clean_alias);
            let mut statements = vec![
                "$ErrorActionPreference = 'Stop'".to_string(),
                format!("$alias = '{escaped_alias}'"),
                "$adapter = Get-NetAdapter -Name $alias -ErrorAction SilentlyContinue".to_string(),
                "if ($null -eq $adapter) { throw \"Adapter '$alias' was not found.\" }".to_string(),
            ];

            if target_family == "all" {
                statements.push(
                    "Set-DnsClientServerAddress -InterfaceAlias $alias -ResetServerAddresses -ErrorAction Stop".to_string(),
                );
            } else if target_family == "ipv4" {
                statements.push(
                    "netsh interface ipv4 set dnsservers name=\"$alias\" source=dhcp | Out-Null"
                        .to_string(),
                );
            } else {
                statements.push(
                    "netsh interface ipv6 set dnsservers name=\"$alias\" source=dhcp | Out-Null"
                        .to_string(),
                );
            }
            statements.push("Clear-DnsClientCache -ErrorAction SilentlyContinue".to_string());

            crate::windows_utils::run_powershell(&statements.join("\n"))?;
            let verified = Self::get_adapter_dns_config(Some(clean_alias))?;
            if (target_family == "all" && (!verified.ipv4_is_dhcp || !verified.ipv6_is_dhcp))
                || (target_family == "ipv4" && !verified.ipv4_is_dhcp)
                || (target_family == "ipv6" && !verified.ipv6_is_dhcp)
            {
                return Err(format!(
                    "Windows did not confirm automatic DHCP DNS restoration on adapter '{clean_alias}'."
                ));
            }
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let _ = (clean_alias, target_family);
            Ok(())
        }
    }

    /// Clear Windows DNS Client Resolver Cache.
    pub fn flush_dns_cache() -> Result<bool, String> {
        #[cfg(windows)]
        {
            let script = r#"
$ErrorActionPreference = 'Stop'
Clear-DnsClientCache -ErrorAction Stop
"#;
            crate::windows_utils::run_powershell(script)?;
            Ok(true)
        }

        #[cfg(not(windows))]
        {
            Ok(true)
        }
    }

    /// Resolve a DNS record (A, AAAA, MX, TXT, CNAME, NS) via System DNS or a specific resolver, capturing TTL & timing.
    pub fn resolve_query(
        host: &str,
        record_type: &str,
        resolver: Option<&str>,
    ) -> Result<DnsQueryResult, String> {
        let clean_host = validate_hostname(host)?;
        let clean_type = record_type.trim().to_uppercase();
        if qtype_code(&clean_type).is_none() {
            return Err(format!("Unsupported DNS record type: {clean_type}"));
        }

        let clean_resolver = resolver
            .map(str::trim)
            .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("system"));
        if let Some(ip) = clean_resolver.filter(|ip| ip.parse::<IpAddr>().is_err()) {
            return Err(format!("Invalid resolver IP address: {ip}"));
        }

        let resolver_label = clean_resolver.unwrap_or("System DNS").to_string();
        let start = Instant::now();
        let queried_at = now_epoch_ms();

        #[cfg(windows)]
        {
            let escaped_host = escape_ps_single_quoted(&clean_host);
            let escaped_type = escape_ps_single_quoted(&clean_type);
            let server_arg = clean_resolver
                .map(|ip| format!(" -Server '{}'", escape_ps_single_quoted(ip)))
                .unwrap_or_default();

            let script = format!(
                r#"
$ErrorActionPreference = 'Stop'
$name = '{escaped_host}'
$type = '{escaped_type}'
$detailed = @()
try {{
    $result = Resolve-DnsName -Name $name -Type $type -DnsOnly{server_arg} -ErrorAction Stop
    foreach ($r in $result) {{
        $ttl = if ($null -ne $r.TTL) {{ [int]$r.TTL }} elseif ($null -ne $r.TimeToLive) {{ [int]$r.TimeToLive }} else {{ $null }}
        $rtype = if ($r.QueryType) {{ [string]$r.QueryType }} else {{ $type }}
        if ($r.IPAddress) {{
            $detailed += [pscustomobject]@{{ value = [string]$r.IPAddress; ttl = $ttl; recordType = $rtype }}
        }} elseif ($r.NameHost) {{
            $detailed += [pscustomobject]@{{ value = [string]$r.NameHost; ttl = $ttl; recordType = $rtype }}
        }} elseif ($r.Strings) {{
            $detailed += [pscustomobject]@{{ value = [string]($r.Strings -join ' '); ttl = $ttl; recordType = $rtype }}
        }} elseif ($r.Exchange) {{
            $detailed += [pscustomobject]@{{ value = "$($r.Preference) $($r.Exchange)"; ttl = $ttl; recordType = $rtype }}
        }}
    }}
    [pscustomobject]@{{
        success = ($detailed.Count -gt 0)
        detailedRecords = @($detailed)
        error = if ($detailed.Count -eq 0) {{ "No $type records returned for $name." }} else {{ $null }}
    }} | ConvertTo-Json -Depth 4 -Compress
}} catch {{
    [pscustomobject]@{{
        success = $false
        detailedRecords = @()
        error = $_.Exception.Message
    }} | ConvertTo-Json -Depth 4 -Compress
}}
"#
            );

            match crate::windows_utils::run_powershell(&script) {
                Ok(output) => {
                    let elapsed_ms = (start.elapsed().as_secs_f64() * 1000.0 * 10.0).round() / 10.0;
                    #[derive(Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct PowershellDnsRes {
                        success: bool,
                        detailed_records: Vec<DnsResourceRecord>,
                        error: Option<String>,
                    }
                    if let Ok(res) = serde_json::from_str::<PowershellDnsRes>(&output) {
                        let records: Vec<String> = res
                            .detailed_records
                            .iter()
                            .map(|item| item.value.clone())
                            .collect();
                        return Ok(DnsQueryResult {
                            query: clean_host,
                            record_type: clean_type,
                            records,
                            detailed_records: res.detailed_records,
                            response_time_ms: elapsed_ms,
                            resolver_used: resolver_label,
                            queried_at,
                            status: if res.success {
                                "success".to_string()
                            } else {
                                "error".to_string()
                            },
                            error_message: if res.success { None } else { res.error },
                        });
                    }
                }
                Err(e) => {
                    return Ok(DnsQueryResult {
                        query: clean_host,
                        record_type: clean_type,
                        records: vec![],
                        detailed_records: vec![],
                        response_time_ms: 0.0,
                        resolver_used: resolver_label,
                        queried_at,
                        status: "error".to_string(),
                        error_message: Some(e),
                    });
                }
            }
        }

        // Cross-platform standard resolution fallback (for non-Windows tests/builds)
        use std::net::ToSocketAddrs;
        match format!("{clean_host}:0").to_socket_addrs() {
            Ok(addrs) => {
                let elapsed_ms = (start.elapsed().as_secs_f64() * 1000.0 * 10.0).round() / 10.0;
                let records: Vec<String> = addrs
                    .filter(|a| match clean_type.as_str() {
                        "AAAA" => a.is_ipv6(),
                        _ => a.is_ipv4(),
                    })
                    .map(|a| a.ip().to_string())
                    .collect();
                let detailed_records = records
                    .iter()
                    .map(|val| DnsResourceRecord {
                        value: val.clone(),
                        ttl: None,
                        record_type: clean_type.clone(),
                    })
                    .collect();
                Ok(DnsQueryResult {
                    query: clean_host,
                    record_type: clean_type,
                    records,
                    detailed_records,
                    response_time_ms: elapsed_ms,
                    resolver_used: resolver_label,
                    queried_at,
                    status: "success".to_string(),
                    error_message: None,
                })
            }
            Err(e) => {
                let elapsed_ms = (start.elapsed().as_secs_f64() * 1000.0 * 10.0).round() / 10.0;
                Ok(DnsQueryResult {
                    query: clean_host,
                    record_type: clean_type,
                    records: vec![],
                    detailed_records: vec![],
                    response_time_ms: elapsed_ms,
                    resolver_used: resolver_label,
                    queried_at,
                    status: "error".to_string(),
                    error_message: Some(e.to_string()),
                })
            }
        }
    }

    /// Measure real DNS query response time against a resolver IP using a standard DNS query packet.
    pub fn test_dns_server(
        server_ip: &str,
        test_host: Option<&str>,
        record_type: Option<&str>,
    ) -> DnsTestResult {
        let clean_ip = server_ip.trim();
        let tested_at = now_epoch_ms();
        let target_host = test_host
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("cloudflare.com");
        let rtype = record_type
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "A".to_string());

        let target_ip: IpAddr = match clean_ip.parse() {
            Ok(ip) => ip,
            Err(_) => {
                return DnsTestResult {
                    server_ip: clean_ip.to_string(),
                    reachable: false,
                    latency_ms: 0.0,
                    tested_at,
                    query_host: Some(target_host.to_string()),
                    record_type: Some(rtype),
                    error_message: Some(format!("Invalid resolver IP: {clean_ip}")),
                };
            }
        };

        let qtype = qtype_code(&rtype).unwrap_or(1);
        let tx_id = ((tested_at & 0xFFFF) as u16) ^ 0x5A3C;
        let dns_query = match build_dns_query_packet(tx_id, target_host, qtype) {
            Ok(packet) => packet,
            Err(err) => {
                return DnsTestResult {
                    server_ip: clean_ip.to_string(),
                    reachable: false,
                    latency_ms: 0.0,
                    tested_at,
                    query_host: Some(target_host.to_string()),
                    record_type: Some(rtype),
                    error_message: Some(err),
                };
            }
        };

        let socket_addr = SocketAddr::new(target_ip, 53);
        let bind_addr = if target_ip.is_ipv4() {
            "0.0.0.0:0"
        } else {
            "[::]:0"
        };

        let start = Instant::now();
        let mut last_error = String::from("Resolver did not respond within timeout (1500 ms).");

        if let Ok(socket) = UdpSocket::bind(bind_addr) {
            let _ = socket.set_read_timeout(Some(Duration::from_millis(1500)));
            let _ = socket.set_write_timeout(Some(Duration::from_millis(1500)));

            match socket.send_to(&dns_query, socket_addr) {
                Ok(_) => {
                    let mut buffer = [0u8; 512];
                    match socket.recv_from(&mut buffer) {
                        Ok((bytes_read, _src)) => {
                            let tx_bytes = tx_id.to_be_bytes();
                            let is_dns_reply = bytes_read >= 12
                                && buffer[0] == tx_bytes[0]
                                && buffer[1] == tx_bytes[1]
                                && (buffer[2] & 0x80) != 0;
                            if is_dns_reply {
                                let rcode = buffer[3] & 0x0F;
                                if rcode == 0 || rcode == 3 {
                                    let latency = (start.elapsed().as_secs_f64() * 1000.0 * 10.0)
                                        .round()
                                        / 10.0;
                                    return DnsTestResult {
                                        server_ip: clean_ip.to_string(),
                                        reachable: true,
                                        latency_ms: latency.max(0.1),
                                        tested_at,
                                        query_host: Some(target_host.to_string()),
                                        record_type: Some(rtype),
                                        error_message: None,
                                    };
                                }
                                last_error = format!("Resolver returned DNS error RCODE {rcode}.");
                            } else {
                                last_error = "Received malformed DNS response packet.".to_string();
                            }
                        }
                        Err(e) => {
                            last_error = format!("UDP DNS receive failed: {e}");
                        }
                    }
                }
                Err(e) => {
                    last_error = format!("UDP DNS send failed: {e}");
                }
            }
        } else {
            last_error = "Unable to bind local UDP socket for DNS probe.".to_string();
        }

        DnsTestResult {
            server_ip: clean_ip.to_string(),
            reachable: false,
            latency_ms: 0.0,
            tested_at,
            query_host: Some(target_host.to_string()),
            record_type: Some(rtype),
            error_message: Some(last_error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_dns_query_packet, derive_dns_status, escape_ps_single_quoted, validate_hostname,
        verify_applied_dns, DnsConfig, DnsManager,
    };

    #[test]
    fn builds_valid_dns_query_packet() {
        let packet = build_dns_query_packet(0xABCD, "cloudflare.com", 1).expect("packet builds");
        assert_eq!(packet[0], 0xAB);
        assert_eq!(packet[1], 0xCD);
        assert_eq!(packet[4], 0x00);
        assert_eq!(packet[5], 0x01); // QDCOUNT = 1
        assert!(packet.ends_with(&[0x00, 0x00, 0x01, 0x00, 0x01]));
    }

    #[test]
    fn rejects_invalid_hostnames() {
        assert!(validate_hostname("").is_err());
        assert!(validate_hostname("bad host.com").is_err());
        assert!(validate_hostname("..").is_err());
        assert_eq!(
            validate_hostname("cloudflare.com.").expect("valid"),
            "cloudflare.com"
        );
    }

    #[test]
    fn marks_empty_servers_as_unconfigured() {
        let mut cfg = DnsConfig {
            adapter_alias: "Ethernet".to_string(),
            is_dhcp: false,
            ipv4_is_dhcp: false,
            ipv6_is_dhcp: true,
            ipv4_servers: vec![],
            ipv6_servers: vec![],
            ..Default::default()
        };
        derive_dns_status(&mut cfg);
        assert_eq!(cfg.status, "unconfigured");
        assert_eq!(cfg.response_time_ms, None);
    }

    #[test]
    fn verifies_applied_dns_servers() {
        let observed = DnsConfig {
            adapter_alias: "Wi-Fi".to_string(),
            is_dhcp: false,
            ipv4_is_dhcp: false,
            ipv6_is_dhcp: false,
            ipv4_servers: vec!["1.1.1.1".to_string(), "1.0.0.1".to_string()],
            ipv6_servers: vec!["2606:4700:4700::1111".to_string()],
            status: "configured".to_string(),
            ..Default::default()
        };
        assert!(verify_applied_dns(
            &observed,
            Some(&["1.1.1.1".to_string(), "1.0.0.1".to_string()]),
            Some(&["2606:4700:4700::1111".to_string()]),
        )
        .is_ok());

        assert!(verify_applied_dns(&observed, Some(&["8.8.8.8".to_string()]), None).is_err());
    }

    #[test]
    fn escapes_single_quotes_and_rejects_bad_ips() {
        assert_eq!(escape_ps_single_quoted("Bob's Wi-Fi"), "Bob''s Wi-Fi");
        assert!(DnsManager::set_adapter_dns("Wi-Fi", &["not-an-ip".to_string()], None).is_err());
        assert!(DnsManager::set_adapter_dns("Wi-Fi", &[], Some(&["1.1.1.1".to_string()])).is_err());
        let invalid_probe = DnsManager::test_dns_server("bad-ip", None, None);
        assert!(!invalid_probe.reachable);
        assert!(invalid_probe.error_message.is_some());
    }
}
