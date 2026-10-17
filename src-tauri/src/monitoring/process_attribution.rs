use crate::monitoring::etw::EtwNetworkPacketEvent;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct ProcessAttributionEngine {
    byte_counters: Mutex<HashMap<u32, (u64, u64)>>, // (down_bytes, up_bytes)
}

impl ProcessAttributionEngine {
    pub fn new() -> Self {
        Self {
            byte_counters: Mutex::new(HashMap::new()),
        }
    }

    pub fn record_packet(&self, event: &EtwNetworkPacketEvent) {
        if let Ok(mut map) = self.byte_counters.lock() {
            let entry = map.entry(event.pid).or_insert((0, 0));
            if event.is_download {
                entry.0 += event.bytes as u64;
            } else {
                entry.1 += event.bytes as u64;
            }
        }
    }

    pub fn take_deltas(&self) -> HashMap<u32, (u64, u64)> {
        if let Ok(mut map) = self.byte_counters.lock() {
            let cloned = map.clone();
            map.clear();
            cloned
        } else {
            HashMap::new()
        }
    }
}

impl Default for ProcessAttributionEngine {
    fn default() -> Self {
        Self::new()
    }
}
