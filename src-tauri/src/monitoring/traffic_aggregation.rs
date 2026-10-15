pub struct TrafficAggregator;

impl TrafficAggregator {
    /// Calculates rate in bytes per second from delta bytes and elapsed seconds:
    /// bps = delta_bytes / elapsed_seconds
    pub fn calculate_bps(delta_bytes: u64, elapsed_seconds: f64) -> u64 {
        if elapsed_seconds <= 0.0 {
            return 0;
        }
        ((delta_bytes as f64) / elapsed_seconds).round() as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_bps() {
        assert_eq!(TrafficAggregator::calculate_bps(1024, 1.0), 1024);
        assert_eq!(TrafficAggregator::calculate_bps(2048, 2.0), 1024);
        assert_eq!(TrafficAggregator::calculate_bps(0, 1.0), 0);
    }
}
