use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
pub struct EtwNetworkPacketEvent {
    pub pid: u32,
    pub is_download: bool,
    pub bytes: u32,
    pub protocol: EtwProtocol,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EtwProtocol { Tcp, Udp }

static PROCESS_BYTE_TOTALS: OnceLock<Mutex<HashMap<u32, (u64, u64)>>> = OnceLock::new();

fn record_packet(event: &EtwNetworkPacketEvent) {
    if event.pid == 0 || event.bytes == 0 { return; }
    if let Ok(mut counters) = PROCESS_BYTE_TOTALS.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        let entry = counters.entry(event.pid).or_insert((0, 0));
        if event.is_download {
            entry.0 = entry.0.saturating_add(event.bytes as u64);
        } else {
            entry.1 = entry.1.saturating_add(event.bytes as u64);
        }
    }
}

pub fn process_byte_totals() -> HashMap<u32, (u64, u64)> {
    PROCESS_BYTE_TOTALS.get_or_init(|| Mutex::new(HashMap::new()))
        .lock().map(|counters| counters.clone()).unwrap_or_default()
}

pub fn retain_active_processes(active_pids: &HashSet<u32>) {
    if let Ok(mut counters) = PROCESS_BYTE_TOTALS.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        counters.retain(|pid, _| active_pids.contains(pid));
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::{record_packet, EtwNetworkPacketEvent, EtwProtocol};
    use ferrisetw::parser::Parser;
    use ferrisetw::provider::Provider;
    use ferrisetw::schema_locator::SchemaLocator;
    use ferrisetw::trace::UserTrace;
    use ferrisetw::EventRecord;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TRACE_SESSION: OnceLock<Mutex<Option<UserTrace>>> = OnceLock::new();

    fn network_callback(record: &EventRecord, schemas: &SchemaLocator) {
        let (protocol, is_download) = match record.event_id() {
            10 => (EtwProtocol::Tcp, false),
            11 => (EtwProtocol::Tcp, true),
            42 => (EtwProtocol::Udp, false),
            43 => (EtwProtocol::Udp, true),
            _ => return,
        };
        let Ok(schema) = schemas.event_schema(record) else { return; };
        let parser = Parser::create(record, &schema);
        let bytes: u32 = parser.try_parse("size").unwrap_or(0);
        if bytes == 0 { return; }

        let timestamp_ms = SystemTime::now().duration_since(UNIX_EPOCH)
            .unwrap_or_default().as_millis() as u64;
        record_packet(&EtwNetworkPacketEvent {
            pid: record.process_id(), is_download, bytes, protocol, timestamp_ms,
        });
    }

    pub fn start(session_name: &str) -> Result<(), String> {
        let mut session = TRACE_SESSION.get_or_init(|| Mutex::new(None)).lock()
            .map_err(|_| "ETW session state is unavailable.".to_string())?;
        if session.is_some() { return Ok(()); }
        let provider = Provider::by_guid("7dd42a49-5329-4832-8dfd-43d979153a88")
            .add_callback(network_callback).build();
        let trace = UserTrace::new().named(session_name.to_string()).enable(provider)
            .start_and_process()
            .map_err(|error| format!("Could not start the Windows network ETW trace: {error:?}"))?;
        *session = Some(trace);
        Ok(())
    }

    pub fn stop() -> Result<(), String> {
        let trace = TRACE_SESSION.get_or_init(|| Mutex::new(None)).lock()
            .map_err(|_| "ETW session state is unavailable.".to_string())?.take();
        if let Some(trace) = trace {
            trace.stop().map_err(|error| format!("Could not stop the Windows network ETW trace: {error:?}"))?;
        }
        Ok(())
    }

    pub fn is_active() -> bool {
        TRACE_SESSION.get_or_init(|| Mutex::new(None)).lock()
            .map(|session| session.is_some()).unwrap_or(false)
    }
}

pub struct EtwSessionManager;
impl EtwSessionManager {
    pub fn start_session(session_name: &str) -> Result<(), String> {
        #[cfg(windows)] { windows_impl::start(session_name) }
        #[cfg(not(windows))] { let _ = session_name; Ok(()) }
    }
    pub fn stop_session() -> Result<(), String> {
        #[cfg(windows)] { windows_impl::stop() }
        #[cfg(not(windows))] { Ok(()) }
    }
    pub fn is_active() -> bool {
        #[cfg(windows)] { windows_impl::is_active() }
        #[cfg(not(windows))] { false }
    }
    pub fn process_byte_totals() -> HashMap<u32, (u64, u64)> { process_byte_totals() }
    pub fn retain_active_processes(active_pids: &HashSet<u32>) { retain_active_processes(active_pids); }
}
