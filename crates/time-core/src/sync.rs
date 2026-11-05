//! Clock-sync filter: turns NTP-style samples into an offset, drift and error bound.
//!
//! All times are milliseconds as `f64`. Client times (`t0`, `t3`) come from
//! `performance.timeOrigin + performance.now()`; server times (`t1`, `t2`) are
//! the server's receive and send stamps.

use serde::{Deserialize, Serialize};

/// One request/response exchange.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Sample {
    /// Client send time.
    pub t0: f64,
    /// Server receive time.
    pub t1: f64,
    /// Server send time.
    pub t2: f64,
    /// Client receive time.
    pub t3: f64,
}

impl Sample {
    /// Server clock minus client clock.
    pub fn offset(&self) -> f64 {
        ((self.t1 - self.t0) + (self.t2 - self.t3)) / 2.0
    }

    /// Network round-trip time, excluding server processing.
    pub fn delay(&self) -> f64 {
        (self.t3 - self.t0) - (self.t2 - self.t1)
    }

    fn is_valid(&self, max_delay_ms: f64) -> bool {
        let finite = [self.t0, self.t1, self.t2, self.t3]
            .iter()
            .all(|v| v.is_finite());
        let d = self.delay();
        finite && self.t3 >= self.t0 && self.t2 >= self.t1 && d >= 0.0 && d <= max_delay_ms
    }
}

/// What the UI shows next to every clock.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SyncState {
    Locked,
    Drifting,
    Offline,
}

/// Result of filtering the current samples.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Estimate {
    /// Add to the client clock to get true time.
    pub offset_ms: f64,
    /// Conservative ± bound on `offset_ms`.
    pub error_ms: f64,
    /// Client clock drift relative to the server, parts per million.
    pub drift_ppm: f64,
    pub state: SyncState,
    pub samples_used: usize,
}

impl Estimate {
    fn offline() -> Self {
        Self {
            offset_ms: 0.0,
            error_ms: f64::INFINITY,
            drift_ppm: 0.0,
            state: SyncState::Offline,
            samples_used: 0,
        }
    }
}

/// Tunables; defaults suit a browser syncing over the internet.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct SyncConfig {
    /// Ring-buffer size.
    pub max_samples: usize,
    /// How many lowest-delay samples form the estimate.
    pub best_of: usize,
    /// Samples slower than this are discarded.
    pub max_delay_ms: f64,
    /// `error_ms` at or below this is `Locked`.
    pub locked_error_ms: f64,
    /// With no sample newer than this, the state is `Offline`.
    pub stale_after_ms: f64,
    /// Minimum time span before drift is estimated.
    pub min_drift_span_ms: f64,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            max_samples: 16,
            best_of: 4,
            max_delay_ms: 2_000.0,
            locked_error_ms: 50.0,
            stale_after_ms: 15.0 * 60_000.0,
            min_drift_span_ms: 60_000.0,
        }
    }
}

/// Keeps recent samples and produces an [`Estimate`].
#[derive(Debug, Clone)]
pub struct SyncFilter {
    config: SyncConfig,
    samples: Vec<Sample>,
}

impl SyncFilter {
    pub fn new(config: SyncConfig) -> Self {
        Self {
            config,
            samples: Vec::with_capacity(config.max_samples),
        }
    }

    /// Adds a sample; returns `false` if it was rejected as invalid or too slow.
    pub fn add(&mut self, sample: Sample) -> bool {
        if !sample.is_valid(self.config.max_delay_ms) {
            return false;
        }
        if self.samples.len() >= self.config.max_samples.max(1) {
            self.samples.remove(0);
        }
        self.samples.push(sample);
        true
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn clear(&mut self) {
        self.samples.clear();
    }

    /// Current estimate. `now_ms` is the client clock, used to detect staleness.
    pub fn estimate(&self, now_ms: f64) -> Estimate {
        let newest = self.samples.iter().map(|s| s.t3).fold(f64::NAN, f64::max);
        if self.samples.is_empty() || now_ms - newest > self.config.stale_after_ms {
            return Estimate::offline();
        }

        let mut best: Vec<&Sample> = self.samples.iter().collect();
        best.sort_by(|a, b| a.delay().total_cmp(&b.delay()));
        best.truncate(self.config.best_of.max(1));

        // Classic clock filter: trust the lowest-delay sample most.
        let anchor = best[0];
        let offset_ms = anchor.offset();
        let spread = best
            .iter()
            .map(|s| (s.offset() - offset_ms).abs())
            .fold(0.0, f64::max);
        let error_ms = anchor.delay() / 2.0 + spread;

        let state = if error_ms <= self.config.locked_error_ms {
            SyncState::Locked
        } else {
            SyncState::Drifting
        };

        Estimate {
            offset_ms,
            error_ms,
            drift_ppm: self.drift_ppm(),
            state,
            samples_used: best.len(),
        }
    }

    /// Least-squares slope of offset over client time, in ppm.
    fn drift_ppm(&self) -> f64 {
        let n = self.samples.len();
        if n < 3 {
            return 0.0;
        }
        let xs: Vec<f64> = self.samples.iter().map(|s| s.t3).collect();
        let ys: Vec<f64> = self.samples.iter().map(Sample::offset).collect();
        let (min_x, max_x) = xs
            .iter()
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), &x| {
                (lo.min(x), hi.max(x))
            });
        if max_x - min_x < self.config.min_drift_span_ms {
            return 0.0;
        }
        let nf = n as f64;
        let mx = xs.iter().sum::<f64>() / nf;
        let my = ys.iter().sum::<f64>() / nf;
        let (num, den) = xs.iter().zip(&ys).fold((0.0, 0.0), |(num, den), (x, y)| {
            (num + (x - mx) * (y - my), den + (x - mx) * (x - mx))
        });
        if den == 0.0 { 0.0 } else { num / den * 1e6 }
    }
}

impl Default for SyncFilter {
    fn default() -> Self {
        Self::new(SyncConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Client is `true_offset` behind the server; symmetric path of `delay` ms.
    fn sample(at: f64, true_offset: f64, delay: f64) -> Sample {
        let t0 = at;
        let t1 = at + true_offset + delay / 2.0;
        let t2 = t1 + 1.0; // 1 ms server processing
        let t3 = at + delay + 1.0;
        Sample { t0, t1, t2, t3 }
    }

    #[test]
    fn offset_and_delay_math() {
        let s = sample(1_000.0, 250.0, 40.0);
        assert!((s.offset() - 250.0).abs() < 1e-9);
        assert!((s.delay() - 40.0).abs() < 1e-9);
    }

    #[test]
    fn empty_filter_is_offline() {
        let e = SyncFilter::default().estimate(0.0);
        assert_eq!(e.state, SyncState::Offline);
        assert!(e.error_ms.is_infinite());
    }

    #[test]
    fn picks_lowest_delay_sample() {
        let mut f = SyncFilter::default();
        assert!(f.add(sample(0.0, 100.0, 300.0)));
        assert!(f.add(sample(1_000.0, 100.0, 12.0)));
        assert!(f.add(sample(2_000.0, 100.0, 150.0)));
        let e = f.estimate(2_200.0);
        assert!((e.offset_ms - 100.0).abs() < 1e-9);
        assert!((e.error_ms - 6.0).abs() < 1e-9);
        assert_eq!(e.state, SyncState::Locked);
        assert_eq!(e.samples_used, 3);
    }

    #[test]
    fn asymmetric_spread_widens_error() {
        let mut f = SyncFilter::default();
        f.add(sample(0.0, 100.0, 20.0));
        f.add(Sample {
            t0: 1_000.0,
            t1: 1_190.0,
            t2: 1_191.0,
            t3: 1_031.0,
        }); // offset 175, delay 30
        let e = f.estimate(1_100.0);
        assert!((e.offset_ms - 100.0).abs() < 1e-9);
        assert!((e.error_ms - (10.0 + 75.0)).abs() < 1e-9);
        assert_eq!(e.state, SyncState::Drifting);
    }

    #[test]
    fn rejects_invalid_and_slow_samples() {
        let mut f = SyncFilter::default();
        assert!(!f.add(sample(0.0, 0.0, 5_000.0)));
        assert!(!f.add(Sample {
            t0: 10.0,
            t1: 5.0,
            t2: 6.0,
            t3: 5.0
        }));
        assert!(!f.add(Sample {
            t0: f64::NAN,
            t1: 0.0,
            t2: 0.0,
            t3: 1.0
        }));
        assert!(f.is_empty());
    }

    #[test]
    fn ring_buffer_keeps_newest() {
        let cfg = SyncConfig {
            max_samples: 3,
            ..SyncConfig::default()
        };
        let mut f = SyncFilter::new(cfg);
        for i in 0..5 {
            f.add(sample(i as f64 * 1_000.0, 0.0, 10.0));
        }
        assert_eq!(f.len(), 3);
    }

    #[test]
    fn stale_samples_go_offline() {
        let mut f = SyncFilter::default();
        f.add(sample(0.0, 50.0, 10.0));
        let later = 20.0 * 60_000.0;
        assert_eq!(f.estimate(later).state, SyncState::Offline);
    }

    #[test]
    fn measures_drift_in_ppm() {
        // Offset grows 0.05 ms per second = 50 ppm.
        let mut f = SyncFilter::default();
        for i in 0..10 {
            let at = i as f64 * 30_000.0;
            f.add(sample(at, 100.0 + at * 50e-6, 10.0));
        }
        let e = f.estimate(300_000.0);
        assert!((e.drift_ppm - 50.0).abs() < 0.5, "drift {}", e.drift_ppm);
    }

    #[test]
    fn no_drift_on_short_span() {
        let mut f = SyncFilter::default();
        for i in 0..5 {
            f.add(sample(i as f64 * 1_000.0, i as f64, 10.0));
        }
        assert_eq!(f.estimate(5_000.0).drift_ppm, 0.0);
    }
}
