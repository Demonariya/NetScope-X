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
    pub radio_type: Option<String>,
    pub rx_link_speed_mbps: Option<u32>,
    pub tx_link_speed_mbps: Option<u32>,
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

$wifiByName = @{}
$wifiByDesc = @{}
$wifiByMac = @{}
$profileNameByInterface = @{}
$rssiByDescription = @{}

try {
  foreach ($profile in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
    if ($null -eq $profile -or $null -eq $profile.InterfaceIndex) { continue }
    $key = [string]$profile.InterfaceIndex
    $profileName = [string]$profile.Name
    if (-not [string]::IsNullOrWhiteSpace($profileName) -and -not $profileNameByInterface.ContainsKey($key)) {
      $profileNameByInterface[$key] = $profileName.Trim()
    }
  }
} catch {
  # Connection profile metadata is optional.
}

try {
  foreach ($rssiEntry in @(Get-CimInstance -Namespace 'root\WMI' -ClassName 'MSNdis_80211_ReceivedSignalStrength' -ErrorAction SilentlyContinue)) {
    if ($null -eq $rssiEntry -or $null -eq $rssiEntry.Ndis80211ReceivedSignalStrength) { continue }
    $instanceName = ([string]$rssiEntry.InstanceName).Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($instanceName)) { continue }
    $dbm = [int]$rssiEntry.Ndis80211ReceivedSignalStrength
    if ($dbm -lt 0 -and $dbm -ge -120) {
      $rssiByDescription[$instanceName] = $dbm
    }
  }
} catch {
  # Driver RSSI query may be unavailable on some drivers.
}

try {
  $netshOutput = @(netsh wlan show interfaces 2>$null)
  if ($netshOutput) {
    $currentBlock = $null
    $commitBlock = {
      param($block)
      if ($null -eq $block) { return }
      $isConnected = $true
      if ($block.state -and $block.state -match 'disconnect') {
        $isConnected = $false
      }
      $entry = @{
        connected = $isConnected
        ssid = if ($isConnected) {
          if ($block.ssid) { $block.ssid } elseif ($block.profile) { $block.profile } else { $null }
        } else { $null }
        signal = if ($isConnected) { $block.signal } else { $null }
        radioType = if ($isConnected) { $block.radioType } else { $null }
        rxRate = if ($isConnected) { $block.rxRate } else { $null }
        txRate = if ($isConnected) { $block.txRate } else { $null }
      }
      if ($block.name) { $wifiByName[$block.name.ToLowerInvariant()] = $entry }
      if ($block.desc) { $wifiByDesc[$block.desc.ToLowerInvariant()] = $entry }
      if ($block.mac) { $wifiByMac[$block.mac] = $entry }
    }

    foreach ($line in $netshOutput) {
      if ($line -match '^\s*Name\s*:\s*(.+)$') {
        if ($null -ne $currentBlock) { & $commitBlock $currentBlock }
        $currentBlock = @{
          name = [string]$Matches[1].Trim()
          desc = $null
          mac = $null
          state = $null
          ssid = $null
          profile = $null
          signal = $null
          radioType = $null
          rxRate = $null
          txRate = $null
        }
        continue
      }
      if ($null -eq $currentBlock) { continue }
      if ($line -match '^\s*Description\s*:\s*(.+)$') {
        $currentBlock.desc = [string]$Matches[1].Trim()
      } elseif ($line -match '^\s*Physical\s*address\s*:\s*(.+)$') {
        $currentBlock.mac = ([string]$Matches[1].Trim().ToUpperInvariant() -replace '[^0-9A-F]', '')
      } elseif ($line -match '^\s*State\s*:\s*(.+)$') {
        $currentBlock.state = [string]$Matches[1].Trim().ToLowerInvariant()
      } elseif ($line -match '^\s*SSID\s*:\s*(.+)$' -and $line -notmatch '^\s*BSSID') {
        $rawSsid = [string]$Matches[1].Trim()
        if ($rawSsid -and $rawSsid -notmatch '^<.*>$') {
          $currentBlock.ssid = $rawSsid
        }
      } elseif ($line -match '^\s*Profile\s*:\s*(.+)$') {
        $rawProfile = [string]$Matches[1].Trim()
        if ($rawProfile -and $rawProfile -notmatch '^<.*>$') {
          $currentBlock.profile = $rawProfile
        }
      } elseif ($line -match '^\s*Signal\s*:\s*([0-9]+)%') {
        $currentBlock.signal = [int]$Matches[1]
      } elseif ($line -match '^\s*Radio\s*type\s*:\s*(.+)$') {
        $currentBlock.radioType = [string]$Matches[1].Trim()
      } elseif ($line -match '^\s*Receive\s*rate\s*\(Mbps\)\s*:\s*([0-9]+(?:\.[0-9]+)?)') {
        $currentBlock.rxRate = [int][math]::Round([double]$Matches[1])
      } elseif ($line -match '^\s*Transmit\s*rate\s*\(Mbps\)\s*:\s*([0-9]+(?:\.[0-9]+)?)') {
        $currentBlock.txRate = [int][math]::Round([double]$Matches[1])
      }
    }
    if ($null -ne $currentBlock) { & $commitBlock $currentBlock }
  }
} catch {
  # Wi-Fi metadata is optional
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
      $macNormalized = ([string]$adapter.MacAddress).Trim().ToUpperInvariant() -replace '[^0-9A-F]', ''
      $wifiInfo = $null
      if ($wifiByName.ContainsKey($adapterName.ToLowerInvariant())) {
        $wifiInfo = $wifiByName[$adapterName.ToLowerInvariant()]
      } elseif ($wifiByDesc.ContainsKey($description.ToLowerInvariant())) {
        $wifiInfo = $wifiByDesc[$description.ToLowerInvariant()]
      } elseif ($macNormalized -and $wifiByMac.ContainsKey($macNormalized)) {
        $wifiInfo = $wifiByMac[$macNormalized]
      }

      $mediaType = [string]$adapter.PhysicalMediaType
      $kind = 'ethernet'
      if ($description -match 'Wi-?Fi|WLAN|Wireless|802\.11' -or $adapterName -match 'Wi-?Fi|WLAN|Wireless' -or $mediaType -match '802\.11|Wireless' -or $null -ne $wifiInfo) { $kind = 'wifi' }
      elseif ($description -match 'RNDIS|USB Tether|Remote NDIS' -or $adapterName -match 'RNDIS|USB Tether|Remote NDIS') { $kind = 'usb_tether' }
      elseif ($description -match 'WWAN|Mobile Broadband|Cellular|LTE|5G Modem') { $kind = 'cellular' }
      elseif ($adapterName -match 'loopback' -or $description -match 'loopback') { $kind = 'loopback' }
      elseif (-not $adapter.HardwareInterface -or $adapterName -match 'VPN|TAP|TUN|Tunnel|Virtual|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|se7en' -or $description -match 'VPN|TAP|TUN|Tunnel|Virtual|WireGuard|Wintun|Hyper-V|VMware|VirtualBox|se7en') { $kind = 'virtual' }

      if ($kind -eq 'virtual' -or $kind -eq 'loopback') { return }

      $status = if ($adapter.Status -eq 'Up') { 'connected' } else { 'disconnected' }
      $nativeRxMbps = $null
      if ($null -ne $adapter.ReceiveLinkSpeed -and [double]$adapter.ReceiveLinkSpeed -gt 0) {
        $nativeRxMbps = [int][math]::Round([double]$adapter.ReceiveLinkSpeed / 1000000)
      }
      $nativeTxMbps = $null
      if ($null -ne $adapter.TransmitLinkSpeed -and [double]$adapter.TransmitLinkSpeed -gt 0) {
        $nativeTxMbps = [int][math]::Round([double]$adapter.TransmitLinkSpeed / 1000000)
      }

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
      if ($speed -le 0) {
        if ($null -ne $nativeRxMbps -and $nativeRxMbps -gt 0) { $speed = $nativeRxMbps }
        elseif ($null -ne $nativeTxMbps -and $nativeTxMbps -gt 0) { $speed = $nativeTxMbps }
      }

      $adapterDbm = $null
      if ($kind -eq 'wifi' -and $status -eq 'connected') {
        $descLower = $description.ToLowerInvariant()
        if ($rssiByDescription.ContainsKey($descLower)) {
          $adapterDbm = [int]$rssiByDescription[$descLower]
        } else {
          foreach ($rssiKey in $rssiByDescription.Keys) {
            if ($rssiKey.Contains($descLower) -or $descLower.Contains($rssiKey)) {
              $adapterDbm = [int]$rssiByDescription[$rssiKey]
              break
            }
          }
        }
      }

      $adapterSsid = $null
      if ($kind -eq 'wifi' -and $status -eq 'connected') {
        if ($null -ne $wifiInfo -and $wifiInfo.ssid) {
          $adapterSsid = [string]$wifiInfo.ssid
        } elseif ($profileNameByInterface.ContainsKey($key)) {
          $adapterSsid = [string]$profileNameByInterface[$key]
        }
      }

      $adapterSignal = $null
      if ($kind -eq 'wifi' -and $status -eq 'connected') {
        if ($null -ne $wifiInfo -and $null -ne $wifiInfo.signal) {
          $adapterSignal = [int][math]::Min(100, [math]::Max(0, [int]$wifiInfo.signal))
        } elseif ($null -ne $adapterDbm) {
          $adapterSignal = [int][math]::Min(100, [math]::Max(0, 2 * ($adapterDbm + 100)))
        }
      }

      $adapterRadio = if ($kind -eq 'wifi' -and $status -eq 'connected' -and $null -ne $wifiInfo -and $wifiInfo.radioType) { [string]$wifiInfo.radioType } else { $null }
      $adapterRx = if ($kind -eq 'wifi' -and $status -eq 'connected' -and $null -ne $wifiInfo -and $null -ne $wifiInfo.rxRate) { [int]$wifiInfo.rxRate } else { $nativeRxMbps }
      $adapterTx = if ($kind -eq 'wifi' -and $status -eq 'connected' -and $null -ne $wifiInfo -and $null -ne $wifiInfo.txRate) { [int]$wifiInfo.txRate } else { $nativeTxMbps }
      if ($speed -le 0 -and $null -ne $adapterRx -and $adapterRx -gt 0) { $speed = $adapterRx }
      if ($speed -le 0 -and $null -ne $adapterTx -and $adapterTx -gt 0) { $speed = $adapterTx }

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
        signalPercent = $adapterSignal
        signalDbm = $adapterDbm
        ssid = $adapterSsid
        radioType = $adapterRadio
        rxLinkSpeedMbps = $adapterRx
        txLinkSpeedMbps = $adapterTx
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
    fn parses_wifi_adapter_signal_and_link_speeds() {
        let json = r#"{"adapters":[{"id":"14","name":"Wi-Fi","description":"Intel(R) Wi-Fi 6 AX201","type":"wifi","status":"connected","localIPv4":"192.168.1.42","localIPv6":"","macAddress":"70-66-55-44-33-22","gateway":"192.168.1.1","dnsServers":["1.1.1.1"],"signalPercent":88,"signalDbm":-56,"ssid":"Office5G","radioType":"802.11ax","rxLinkSpeedMbps":866,"txLinkSpeedMbps":780,"speedMbps":866,"isDefault":true}]}"#;
        let adapters = parse_adapter_payload(json).expect("valid wifi payload");
        assert_eq!(adapters.len(), 1);
        assert_eq!(adapters[0].signal_percent, Some(88));
        assert_eq!(adapters[0].signal_dbm, Some(-56));
        assert_eq!(adapters[0].ssid.as_deref(), Some("Office5G"));
        assert_eq!(adapters[0].radio_type.as_deref(), Some("802.11ax"));
        assert_eq!(adapters[0].rx_link_speed_mbps, Some(866));
        assert_eq!(adapters[0].tx_link_speed_mbps, Some(780));
        assert_eq!(adapters[0].speed_mbps, 866);
    }

    #[test]
    fn parses_empty_adapter_array() {
        let adapters = parse_adapter_payload(r#"{"adapters":[]}"#).expect("empty adapter payload");
        assert!(adapters.is_empty());
    }
}
