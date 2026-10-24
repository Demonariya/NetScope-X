use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    Wifi,
    Ethernet,
    UsbTether,
    Cellular,
    Virtual,
    Loopback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AdapterStatus {
    Connected,
    Disconnected,
    Connecting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAdapter {
    pub id: String,
    pub name: String,
    pub description: String,
    pub r#type: ConnectionType,
    pub status: AdapterStatus,
    #[serde(rename = "localIPv4")]
    pub local_ipv4: String,
    #[serde(rename = "localIPv6")]
    pub local_ipv6: String,
    pub mac_address: String,
    pub gateway: String,
    pub dns_servers: Vec<String>,
    pub signal_percent: Option<u8>,
    pub signal_dbm: Option<i16>,
    pub ssid: Option<String>,
    pub speed_mbps: u32,
    pub is_default: bool,
}

fn parse_adapter_payload(json: &str) -> Result<Vec<NetworkAdapter>, String> {
    let payload: serde_json::Value =
        serde_json::from_str(json).map_err(|error| format!("Invalid adapter JSON: {error}"))?;
    let rows = payload.get("adapters").cloned().unwrap_or(payload);
    match rows {
        serde_json::Value::Array(rows) => rows
            .into_iter()
            .map(|row| {
                serde_json::from_value::<NetworkAdapter>(row)
                    .map_err(|error| format!("Invalid network adapter record: {error}"))
            })
            .collect(),
        serde_json::Value::Object(row) => {
            serde_json::from_value::<NetworkAdapter>(serde_json::Value::Object(row))
                .map(|adapter| vec![adapter])
                .map_err(|error| format!("Invalid network adapter record: {error}"))
        }
        serde_json::Value::Null => Ok(Vec::new()),
        _ => Err("Windows returned an unexpected network adapter payload.".to_string()),
    }
}

impl NetworkAdapter {
    /// Return interfaces reported by Windows, never fabricated adapter data.
    pub fn discover_all() -> Result<Vec<Self>, String> {
        #[cfg(windows)]
        {
            let script = r#"
$ErrorActionPreference = 'Stop'

# Optional IP metadata is collected independently so a failing IP cmdlet
# cannot prevent Windows adapters from being enumerated.
$ipv4ByInterface = @{}
$ipv6ByInterface = @{}
$gatewayByInterface = @{}
$dnsByInterface = @{}

try {
  foreach ($address in @(Get-NetIPAddress -ErrorAction SilentlyContinue)) {
    if ($null -eq $address -or $null -eq $address.InterfaceIndex) { continue }
    $key = [string]$address.InterfaceIndex
    $ipAddress = [string]$address.IPAddress
    if ([string]::IsNullOrWhiteSpace($ipAddress)) { continue }

    if ($address.AddressFamily -eq 'IPv4' -and -not $ipv4ByInterface.ContainsKey($key)) {
      if ($ipAddress -ne '127.0.0.1' -and $ipAddress -notlike '169.254.*') {
        $ipv4ByInterface[$key] = $ipAddress
      }
    } elseif ($address.AddressFamily -eq 'IPv6' -and -not $ipv6ByInterface.ContainsKey($key)) {
      if ($ipAddress -ne '::1' -and $ipAddress -notlike 'fe80:*') {
        $ipv6ByInterface[$key] = $ipAddress
      }
    }
  }
} catch {
  # Keep adapter enumeration working when IP metadata is restricted/unavailable.
}

try {
  foreach ($route in @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric)) {
    $key = [string]$route.InterfaceIndex
    $nextHop = [string]$route.NextHop
    if (-not [string]::IsNullOrWhiteSpace($nextHop) -and -not $gatewayByInterface.ContainsKey($key)) {
      $gatewayByInterface[$key] = $nextHop
    }
  }
  foreach ($route in @(Get-NetRoute -DestinationPrefix '::/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric)) {
    $key = [string]$route.InterfaceIndex
    $nextHop = [string]$route.NextHop
    if (-not [string]::IsNullOrWhiteSpace($nextHop) -and -not $gatewayByInterface.ContainsKey($key)) {
      $gatewayByInterface[$key] = $nextHop
    }
  }
} catch {
  # Gateway is optional metadata.
}

try {
  foreach ($dnsEntry in @(Get-DnsClientServerAddress -ErrorAction SilentlyContinue)) {
    if ($null -eq $dnsEntry -or $null -eq $dnsEntry.InterfaceIndex) { continue }
    $key = [string]$dnsEntry.InterfaceIndex
    $servers = @($dnsEntry.ServerAddresses | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    if ($servers.Count -eq 0) { continue }
    if (-not $dnsByInterface.ContainsKey($key)) { $dnsByInterface[$key] = @() }
    $dnsByInterface[$key] = @($dnsByInterface[$key] + $servers | Select-Object -Unique)
  }
} catch {
  # DNS is optional metadata.
}

$rows = @(
  Get-NetAdapter -ErrorAction Stop |
    Where-Object {
      $_.Status -ne 'Not Present' -and
      $_.HardwareInterface -eq $true -and
      $_.InterfaceDescription -notmatch 'Virtual|VPN|TAP|TUN|Tunnel|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|Pseudo|WAN Miniport|Tailscale|ZeroTier|Cisco|OpenVPN|Proton|NordVPN|se7en|Direct Virtual' -and
      $_.Name -notmatch 'Virtual|VPN|TAP|TUN|Tunnel|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|Loopback|se7en|Loopback'
    } |
    ForEach-Object {
      $adapter = $_
      $key = [string]$adapter.ifIndex
      $ipv4 = if ($ipv4ByInterface.ContainsKey($key)) { [string]$ipv4ByInterface[$key] } else { '' }
      $ipv6 = if ($ipv6ByInterface.ContainsKey($key)) { [string]$ipv6ByInterface[$key] } else { '' }
      $gateway = if ($gatewayByInterface.ContainsKey($key)) { [string]$gatewayByInterface[$key] } else { '' }
      $dns = if ($dnsByInterface.ContainsKey($key)) { @($dnsByInterface[$key]) } else { @() }

      $description = [string]$adapter.InterfaceDescription
      $adapterName = [string]$adapter.Name
      $kind = 'ethernet'
      if ($description -match 'Wi-?Fi|Wireless|802\.11') { $kind = 'wifi' }
      elseif ($description -match 'RNDIS|USB Tether|Remote NDIS' -or $adapterName -match 'RNDIS|USB Tether|Remote NDIS') { $kind = 'usb_tether' }
      elseif ($description -match 'WWAN|Mobile Broadband|Cellular|LTE|5G Modem') { $kind = 'cellular' }
      elseif ($adapterName -match 'loopback' -or $description -match 'loopback') { $kind = 'loopback' }
      elseif (-not $adapter.HardwareInterface -or $adapterName -match 'VPN|TAP|TUN|Tunnel|Virtual|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|se7en' -or $description -match 'VPN|TAP|TUN|Tunnel|Virtual|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|se7en') { $kind = 'virtual' }

      if ($kind -eq 'virtual' -or $kind -eq 'loopback') { return }

      $status = if ($adapter.Status -eq 'Up') { 'connected' } else { 'disconnected' }
      $speed = 0
      $linkText = [string]$adapter.LinkSpeed
      if ($linkText -match '([0-9]+(?:\.[0-9]+)?)\s*(Kbps|Mbps|Gbps)') {
        $number = [double]$Matches[1]
        switch ($Matches[2]) {
          'Gbps' { $speed = [int][math]::Round($number * 1000) }
          'Mbps' { $speed = [int][math]::Round($number) }
          'Kbps' { $speed = [int][math]::Round($number / 1000) }
        }
      }

      [pscustomobject]@{
        id = [string]$adapter.ifIndex
        name = $adapterName
        description = $description
        type = $kind
        status = $status
        localIPv4 = $ipv4
        localIPv6 = $ipv6
        macAddress = [string]$adapter.MacAddress
        gateway = $gateway
        dnsServers = @($dns)
        signalPercent = $null
        signalDbm = $null
        ssid = $null
        speedMbps = $speed
        isDefault = -not [string]::IsNullOrWhiteSpace($gateway)
      }
    }
)
ConvertTo-Json -InputObject ([pscustomobject]@{ adapters = @($rows) }) -Depth 5 -Compress
"#;
            let json = crate::windows_utils::run_powershell(script)?;
            let mut adapters = parse_adapter_payload(&json)?;
            adapters.retain(|a| {
                !matches!(a.r#type, ConnectionType::Virtual | ConnectionType::Loopback)
            });
            Ok(adapters)
        }
        #[cfg(not(windows))]
        {
            Ok(Vec::new())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_adapter_payload;

    #[test]
    fn parses_wrapped_single_adapter() {
        let json = r#"{"adapters":[{"id":"12","name":"Ethernet","description":"Network Adapter","type":"ethernet","status":"connected","localIPv4":"192.168.1.10","localIPv6":"","macAddress":"00-11-22-33-44-55","gateway":"192.168.1.1","dnsServers":["1.1.1.1"],"signalPercent":null,"signalDbm":null,"ssid":null,"speedMbps":1000,"isDefault":true}]}"#;
        let adapters = parse_adapter_payload(json).expect("valid adapter payload");
        assert_eq!(adapters.len(), 1);
        assert_eq!(adapters[0].id, "12");
        assert_eq!(adapters[0].name, "Ethernet");
    }

    #[test]
    fn parses_empty_adapter_array() {
        let adapters = parse_adapter_payload(r#"{"adapters":[]}"#).expect("empty adapter payload");
        assert!(adapters.is_empty());
    }
}
