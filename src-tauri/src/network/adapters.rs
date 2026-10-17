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
    pub local_ipv4: String,
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

impl NetworkAdapter {
    /// Return interfaces reported by Windows, never fabricated adapter data.
    pub fn discover_all() -> Vec<Self> {
        #[cfg(windows)]
        {
            let script = r#"
$rows = @(
  Get-NetAdapter -IncludeHidden -ErrorAction Stop |
    Where-Object { $_.Status -ne 'Not Present' } |
    ForEach-Object {
      $adapter = $_
      $ip = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction SilentlyContinue
      $kind = 'ethernet'
      if ($adapter.InterfaceDescription -match 'Wi-?Fi|Wireless|802\.11') { $kind = 'wifi' }
      elseif ($adapter.Name -match 'loopback') { $kind = 'loopback' }
      elseif (-not $adapter.HardwareInterface -or $adapter.Name -match 'VPN|TAP|Tunnel|Virtual|WireGuard|Wintun') { $kind = 'virtual' }
      $status = if ($adapter.Status -eq 'Up') { 'connected' } else { 'disconnected' }
      $ipv4 = @($ip.IPv4Address | ForEach-Object { $_.IPAddress } | Where-Object { $_ }) | Select-Object -First 1
      $ipv6 = @($ip.IPv6Address | ForEach-Object { $_.IPAddress } | Where-Object { $_ }) | Select-Object -First 1
      $gateway = @($ip.IPv4DefaultGateway | ForEach-Object { $_.NextHop } | Where-Object { $_ }) | Select-Object -First 1
      $dns = @($ip.DnsServer.ServerAddresses | Where-Object { $_ })
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
        name = [string]$adapter.Name
        description = [string]$adapter.InterfaceDescription
        type = $kind
        status = $status
        localIPv4 = [string]$ipv4
        localIPv6 = [string]$ipv6
        macAddress = [string]$adapter.MacAddress
        gateway = [string]$gateway
        dnsServers = @($dns)
        signalPercent = $null
        signalDbm = $null
        ssid = $null
        speedMbps = $speed
        isDefault = [bool]$gateway
      }
    }
)
ConvertTo-Json -InputObject @($rows) -Depth 5 -Compress
"#;
            match crate::windows_utils::run_powershell(script).and_then(|json| {
                serde_json::from_str::<Vec<Self>>(&json)
                    .map_err(|error| format!("Invalid adapter JSON: {error}"))
            }) {
                Ok(adapters) => adapters,
                Err(error) => {
                    eprintln!("NetScope X adapter discovery failed: {error}");
                    Vec::new()
                }
            }
        }
        #[cfg(not(windows))]
        {
            Vec::new()
        }
    }
}
