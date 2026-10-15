use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub creation_time: u64,
    pub exe_path: String,
}

impl ProcessIdentity {
    pub fn new(pid: u32, exe_path: String) -> Self {
        let creation_time = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Self {
            pid,
            creation_time,
            exe_path,
        }
    }
}
