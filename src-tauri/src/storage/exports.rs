use crate::storage::history::TrafficHistoryEntry;

pub struct DataExporter;

fn escape_csv(value: &str) -> String {
    value.replace('"', "\"\"")
}

impl DataExporter {
    pub fn to_csv(entries: &[TrafficHistoryEntry]) -> String {
        let mut csv =
            String::from("Timestamp,Date,Hour,DownloadBytes,UploadBytes,TotalBytes,TopApp\n");
        for e in entries {
            csv.push_str(&format!(
                "{},{},{},{},{},{},\"{}\"\n",
                e.timestamp,
                e.date_str,
                e.hour_str,
                e.download_bytes,
                e.upload_bytes,
                e.download_bytes.saturating_add(e.upload_bytes),
                escape_csv(&e.top_app)
            ));
        }
        csv
    }

    pub fn to_json(entries: &[TrafficHistoryEntry]) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::DataExporter;
    use crate::storage::history::TrafficHistoryEntry;

    #[test]
    fn csv_escapes_quotes_in_text_fields() {
        let entry = TrafficHistoryEntry {
            id: "row-1".to_string(),
            timestamp: 1_800_000_000,
            date_str: "2026-10-19".to_string(),
            hour_str: "12:00".to_string(),
            download_bytes: 100,
            upload_bytes: 50,
            top_app: "App, \"test\"\nname".to_string(),
        };

        let csv = DataExporter::to_csv(&[entry]);

        assert!(csv.contains("\"App, \"\"test\"\"\nname\""));
    }

    #[test]
    fn json_export_preserves_history_records() {
        let entry = TrafficHistoryEntry {
            id: "row-1".to_string(),
            timestamp: 1_800_000_000,
            date_str: "2026-10-19".to_string(),
            hour_str: "12:00".to_string(),
            download_bytes: 100,
            upload_bytes: 50,
            top_app: "Interface 17".to_string(),
        };

        let json = DataExporter::to_json(&[entry]).expect("history records should serialize");
        assert!(json.contains("Interface 17"));
        assert!(json.contains("\"downloadBytes\": 100"));
    }
}
