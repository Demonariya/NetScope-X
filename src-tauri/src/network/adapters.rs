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
ConvertTo-Json -InputObject ([pscustomobject]@{ adapters = @($rows) }) -Depth 5 -Compress
"#;
            let json = crate::windows_utils::run_powershell(script)?;
            parse_adapter_payload(&json)
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
