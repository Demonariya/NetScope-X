pub struct LifecycleManager;

impl LifecycleManager {
    /// Stop the ETW tracing session owned by this process before it exits.
    pub fn cleanup() {
        if let Err(error) = crate::monitoring::etw::EtwSessionManager::stop_session() {
            eprintln!("NetScope X could not stop ETW during shutdown: {error}");
        }
    }
}
