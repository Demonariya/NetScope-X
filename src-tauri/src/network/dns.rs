use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsConfig {
    pub adapter_alias: String,
    pub is_dhcp: bool,
    pub ipv4_servers: Vec<String>,
    pub ipv6_servers: Vec<String>,
    pub status: String,
    pub response_time_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsQueryResult {
    pub query: String,
    pub record_type: String,
    pub records: Vec<String>,
    pub response_time_ms: f64,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsTestResult {
    pub server_ip: String,
    pub reachable: bool,
    pub latency_ms: f64,
}

pub struct DnsManager;

impl DnsManager {
    /// Retrieve current DNS configuration for a given adapter alias or active default adapter.
    pub fn get_adapter_dns_config(adapter_alias: Option<&str>) -> Result<DnsConfig, String> {
        #[cfg(windows)]
        {
            let target_alias = adapter_alias.unwrap_or("");
            let script = r#"
$ErrorActionPreference = 'Stop'
$alias = '__TARGET_ALIAS__'
$adapter = $null

if (-not [string]::IsNullOrWhiteSpace($alias) -and $alias -ne 'auto') {
    $adapter = Get-NetAdapter -Name $alias -ErrorAction SilentlyContinue
}
if ($null -eq $adapter) {
    # Pick active adapter with default route or highest link speed
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
    return '{"adapterAlias":"Unknown","isDhcp":true,"ipv4Servers":[],"ipv6Servers":[],"status":"unavailable","responseTimeMs":null}'
}

$intAlias = [string]$adapter.Name
$dnsAddresses = @(Get-DnsClientServerAddress -InterfaceAlias $intAlias -ErrorAction SilentlyContinue)
$ipv4List = @()
$ipv6List = @()

foreach ($item in $dnsAddresses) {
    if ($item.AddressFamily -eq 2) { # IPv4
        $ipv4List += $item.ServerAddresses
    } elseif ($item.AddressFamily -eq 23) { # IPv6
        $ipv6List += $item.ServerAddresses
    }
}

# Determine if DNS is obtained automatically via DHCP or static
$dnsClient = Get-DnsClient -InterfaceAlias $intAlias -ErrorAction SilentlyContinue
$isDhcp = $true
try {
    # Check if static IP addresses are assigned to DNS
    $netshOutput = netsh interface ipv4 show dns name="$intAlias"
    if ($netshOutput -match 'statically configured') {
        $isDhcp = $false
    }
} catch {
    $isDhcp = $true
}

[pscustomobject]@{
    adapterAlias = $intAlias
    isDhcp = [bool]$isDhcp
    ipv4Servers = @($ipv4List | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    ipv6Servers = @($ipv6List | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    status = if ($ipv4List.Count -gt 0) { 'configured' } else { 'unconfigured' }
    responseTimeMs = $null
} | ConvertTo-Json -Depth 3 -Compress
"#
            .replace("__TARGET_ALIAS__", target_alias);

            let json = crate::windows_utils::run_powershell(&script)?;
            let mut config: DnsConfig = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse DNS config JSON: {e}"))?;

            if let Some(primary) = config.ipv4_servers.first() {
                let test = Self::test_dns_server(primary);
                if test.reachable {
                    config.response_time_ms = Some(test.latency_ms);
                }
            }

            Ok(config)
        }

        #[cfg(not(windows))]
        {
            let alias = adapter_alias.unwrap_or("eth0").to_string();
            Ok(DnsConfig {
                adapter_alias: alias,
                is_dhcp: true,
                ipv4_servers: vec!["1.1.1.1".to_string(), "1.0.0.1".to_string()],
                ipv6_servers: vec!["2606:4700:4700::1111".to_string()],
                status: "configured".to_string(),
                response_time_ms: Some(14.2),
            })
        }
    }

    /// Set DNS servers for a Windows network adapter.
    pub fn set_adapter_dns(
        adapter_alias: &str,
        ipv4_servers: &[String],
        _ipv6_servers: Option<&[String]>,
    ) -> Result<(), String> {
        if adapter_alias.is_empty() {
            return Err("Network adapter alias cannot be empty.".to_string());
        }
        if ipv4_servers.is_empty() {
            return Err("At least one IPv4 DNS server must be provided.".to_string());
        }

        // Validate IP formats
        for ip in ipv4_servers {
            if ip.parse::<IpAddr>().is_err() {
                return Err(format!("Invalid IP address format: {ip}"));
            }
        }

        #[cfg(windows)]
        {
            let servers_param = ipv4_servers
                .iter()
                .map(|s| format!("'{s}'"))
                .collect::<Vec<_>>()
                .join(",");

            let script = format!(
                r#"
$ErrorActionPreference = 'Stop'
$alias = '{adapter_alias}'
$servers = @({servers_param})
Set-DnsClientServerAddress -InterfaceAlias $alias -ServerAddresses $servers -ErrorAction Stop
Clear-DnsClientCache -ErrorAction SilentlyContinue
"#
            );

            crate::windows_utils::run_powershell(&script)?;
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let _ = adapter_alias;
            Ok(())
        }
    }

    /// Restore DNS configuration to automatic DHCP.
    pub fn reset_adapter_dns_dhcp(adapter_alias: &str) -> Result<(), String> {
        if adapter_alias.is_empty() {
            return Err("Network adapter alias cannot be empty.".to_string());
        }

        #[cfg(windows)]
        {
            let script = format!(
                r#"
$ErrorActionPreference = 'Stop'
$alias = '{adapter_alias}'
Set-DnsClientServerAddress -InterfaceAlias $alias -ResetServerAddresses -ErrorAction Stop
Clear-DnsClientCache -ErrorAction SilentlyContinue
"#
            );

            crate::windows_utils::run_powershell(&script)?;
            Ok(())
        }

        #[cfg(not(windows))]
        {
            let _ = adapter_alias;
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

    /// Resolve a DNS record (A, AAAA, MX, TXT, CNAME) and measure response time.
    pub fn resolve_query(host: &str, record_type: &str) -> Result<DnsQueryResult, String> {
        let clean_host = host.trim();
        if clean_host.is_empty() {
            return Err("Target hostname cannot be empty.".to_string());
        }
        let clean_type = record_type.trim().to_uppercase();

        let start = Instant::now();

        #[cfg(windows)]
        {
            let script = format!(
                r#"
$ErrorActionPreference = 'Stop'
$name = '{clean_host}'
$type = '{clean_type}'
$records = @()
try {{
    $result = Resolve-DnsName -Name $name -Type $type -ErrorAction Stop
    foreach ($r in $result) {{
        if ($r.IPAddress) {{
            $records += [string]$r.IPAddress
        }} elseif ($r.NameHost) {{
            $records += [string]$r.NameHost
        }} elseif ($r.Strings) {{
            $records += [string]($r.Strings -join ' ')
        }} elseif ($r.Exchange) {{
            $records += "$($r.Preference) $($r.Exchange)"
        }}
    }}
    [pscustomobject]@{{
        success = $true
        records = @($records)
        error = $null
    }} | ConvertTo-Json -Compress
}} catch {{
    [pscustomobject]@{{
        success = $false
        records = @()
        error = $_.Exception.Message
    }} | ConvertTo-Json -Compress
}}
"#
            );

            match crate::windows_utils::run_powershell(&script) {
                Ok(output) => {
                    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
                    #[derive(Deserialize)]
                    struct PowershellDnsRes {
                        success: bool,
                        records: Vec<String>,
                        error: Option<String>,
                    }
                    if let Ok(res) = serde_json::from_str::<PowershellDnsRes>(&output) {
                        if res.success {
                            return Ok(DnsQueryResult {
                                query: clean_host.to_string(),
                                record_type: clean_type,
                                records: res.records,
                                response_time_ms: (elapsed_ms * 10.0).round() / 10.0,
                                status: "success".to_string(),
                                error_message: None,
                            });
                        } else {
                            return Ok(DnsQueryResult {
                                query: clean_host.to_string(),
                                record_type: clean_type,
                                records: vec![],
                                response_time_ms: (elapsed_ms * 10.0).round() / 10.0,
                                status: "error".to_string(),
                                error_message: res.error,
                            });
                        }
                    }
                }
                Err(e) => {
                    return Ok(DnsQueryResult {
                        query: clean_host.to_string(),
                        record_type: clean_type,
                        records: vec![],
                        response_time_ms: 0.0,
                        status: "error".to_string(),
                        error_message: Some(e),
                    });
                }
            }
        }

        // Cross platform standard resolution fallback
        use std::net::ToSocketAddrs;
        match format!("{clean_host}:0").to_socket_addrs() {
            Ok(addrs) => {
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
                let records: Vec<String> = addrs.map(|a| a.ip().to_string()).collect();
                Ok(DnsQueryResult {
                    query: clean_host.to_string(),
                    record_type: clean_type,
                    records,
                    response_time_ms: (elapsed_ms * 10.0).round() / 10.0,
                    status: "success".to_string(),
                    error_message: None,
                })
            }
            Err(e) => {
                let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
                Ok(DnsQueryResult {
                    query: clean_host.to_string(),
                    record_type: clean_type,
                    records: vec![],
                    response_time_ms: (elapsed_ms * 10.0).round() / 10.0,
                    status: "error".to_string(),
                    error_message: Some(e.to_string()),
                })
            }
        }
    }

    /// Test reachability and round-trip latency of a DNS server using a lightweight DNS standard query.
    pub fn test_dns_server(server_ip: &str) -> DnsTestResult {
        let clean_ip = server_ip.trim();
        let ip_addr: Result<IpAddr, _> = clean_ip.parse();

        let target_ip = match ip_addr {
            Ok(ip) => ip,
            Err(_) => {
                return DnsTestResult {
                    server_ip: clean_ip.to_string(),
                    reachable: false,
                    latency_ms: 0.0,
                };
            }
        };

        let socket_addr = SocketAddr::new(target_ip, 53);
        let start = Instant::now();

        // Standard DNS query packet for "." root IN NS or "google.com" IN A
        // Transaction ID: 0x1234, Flags: 0x0100 (Standard query), Questions: 1, Answers: 0, Authority: 0, Additional: 0
        // Query: 0x00 (root), Type: 0x0002 (NS), Class: 0x0001 (IN)
        let dns_query = [
            0x12, 0x34, // ID
            0x01, 0x00, // Flags (recursion desired)
            0x00, 0x01, // QDCOUNT (1)
            0x00, 0x00, // ANCOUNT (0)
            0x00, 0x00, // NSCOUNT (0)
            0x00, 0x00, // ARCOUNT (0)
            0x00,       // Root domain "."
            0x00, 0x02, // Type NS
            0x00, 0x01, // Class IN
        ];

        let bind_addr = if target_ip.is_ipv4() {
            "0.0.0.0:0"
        } else {
            "[::]:0"
        };

        if let Ok(socket) = UdpSocket::bind(bind_addr) {
            let _ = socket.set_read_timeout(Some(Duration::from_millis(1500)));
            let _ = socket.set_write_timeout(Some(Duration::from_millis(1500)));

            if socket.send_to(&dns_query, socket_addr).is_ok() {
                let mut buffer = [0u8; 512];
                if let Ok((bytes_read, _src)) = socket.recv_from(&mut buffer) {
                    if bytes_read >= 12 && buffer[0] == 0x12 && buffer[1] == 0x34 {
                        let latency = start.elapsed().as_secs_f64() * 1000.0;
                        return DnsTestResult {
                            server_ip: clean_ip.to_string(),
                            reachable: true,
                            latency_ms: (latency * 10.0).round() / 10.0,
                        };
                    }
                }
            }
        }

        // Fallback: TCP connection test to port 53 with 1.5s timeout
        let tcp_start = Instant::now();
        match std::net::TcpStream::connect_timeout(&socket_addr, Duration::from_millis(1500)) {
            Ok(_) => {
                let latency = tcp_start.elapsed().as_secs_f64() * 1000.0;
                DnsTestResult {
                    server_ip: clean_ip.to_string(),
                    reachable: true,
                    latency_ms: (latency * 10.0).round() / 10.0,
                }
            }
            Err(_) => DnsTestResult {
                server_ip: clean_ip.to_string(),
                reachable: false,
                latency_ms: 0.0,
            },
        }
    }
}
