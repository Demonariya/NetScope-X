use crate::storage::history::TrafficHistoryEntry;

pub struct DataExporter;

impl DataExporter {
    pub fn to_csv(entries: &[TrafficHistoryEntry]) -> String {
        let mut csv = String::from("Timestamp,Date,Hour,DownloadBytes,UploadBytes,TotalBytes,TopApp\n");
        for e in entries {
            csv.push_str(&format!(
                "{},{},{},{},{},{},\"{}\"\n",
                e.timestamp,
                e.date_str,
                e.hour_str,
                e.download_bytes,
                e.upload_bytes,
                e.download_bytes + e.upload_bytes,
                e.top_app
            ));
        }
        csv
    }

    pub fn to_json(entries: &[TrafficHistoryEntry]) -> String {
        serde_json::to_string_pretty(entries).unwrap_or_else(|_| "[]".to_string())
    }
}
