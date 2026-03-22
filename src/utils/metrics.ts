/** String labels attached to counters, gauges, and histograms. */
type MetricLabels = Record<string, string>;

/** Minimal counter contract used by the in-memory registry. */
interface Counter {
  increment(labels?: MetricLabels): void;
  value(labels?: MetricLabels): number;
}

/** Minimal histogram contract used by the in-memory registry. */
interface Histogram {
  observe(value: number, labels?: MetricLabels): void;
}

/** Minimal gauge contract used by the in-memory registry. */
interface Gauge {
  increment(labels?: MetricLabels): void;
  decrement(labels?: MetricLabels): void;
  value(labels?: MetricLabels): number;
}

/** Simple in-memory metrics registry for lightweight observability. */
class InMemoryMetrics {
  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, Map<string, number[]>>();
  private gauges = new Map<string, Map<string, number>>();

  /** Canonicalize label order so the same dimensions reuse one map entry. */
  private key(labels?: MetricLabels): string {
    if (!labels) return "_global_";
    return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(";");
  }

  /** Shared helper to lazily allocate nested metric containers. */
  private getOrSet<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
    let value = map.get(key);
    if (value === undefined) {
      value = factory();
      map.set(key, value);
    }
    return value;
  }

  /** Build a counter view for a named metric. */
  getCounter(name: string): Counter {
    return {
      increment: (labels) => {
        const k = this.key(labels);
        const map = this.getOrSet(this.counters, name, () => new Map());
        map.set(k, (map.get(k) ?? 0) + 1);
      },
      value: (labels) => {
        const k = this.key(labels);
        return this.counters.get(name)?.get(k) ?? 0;
      },
    };
  }

  /** Build a histogram view for a named metric. */
  getHistogram(name: string): Histogram {
    return {
      observe: (value, labels) => {
        const k = this.key(labels);
        const map = this.getOrSet(this.histograms, name, () => new Map());
        const arr = this.getOrSet(map, k, () => []);
        arr.push(value);
      },
    };
  }

  /** Build a gauge view for a named metric. */
  getGauge(name: string): Gauge {
    return {
      increment: (labels) => {
        const k = this.key(labels);
        const map = this.getOrSet(this.gauges, name, () => new Map());
        map.set(k, (map.get(k) ?? 0) + 1);
      },
      decrement: (labels) => {
        const k = this.key(labels);
        const map = this.getOrSet(this.gauges, name, () => new Map());
        map.set(k, Math.max(0, (map.get(k) ?? 0) - 1));
      },
      value: (labels) => {
        const k = this.key(labels);
        return this.gauges.get(name)?.get(k) ?? 0;
      },
    };
  }

  /** Export the current registry into a JSON-friendly snapshot. */
  getSnapshot(): Record<string, unknown> {
    const snap: Record<string, unknown> = {};
    for (const [name, map] of this.counters) {
      snap[name] = Object.fromEntries(map);
    }
    for (const [name, map] of this.histograms) {
      const stats: Record<string, { count: number; min: number; max: number; avg: number }> = {};
      for (const [k, values] of map) {
        const sum = values.reduce((a, b) => a + b, 0);
        stats[k] = {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: sum / values.length,
        };
      }
      snap[name] = stats;
    }
    for (const [name, map] of this.gauges) {
      snap[name] = Object.fromEntries(map);
    }
    return snap;
  }

  /** Clear all accumulated metrics, useful for tests or future admin tasks. */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

/** Public metric handles consumed by the request pipeline and security helpers. */
export const metrics = {
  requests: {
    total: undefined as unknown as Counter,
    duration: undefined as unknown as Histogram,
    errors: undefined as unknown as Counter,
    active: undefined as unknown as Gauge,
  },
  rateLimit: {
    hits: undefined as unknown as Counter,
  },
};

/** Back all exported metric handles with one shared registry instance. */
const registry = new InMemoryMetrics();

metrics.requests.total = registry.getCounter("http_requests_total");
metrics.requests.duration = registry.getHistogram("http_request_duration_ms");
metrics.requests.errors = registry.getCounter("http_errors_total");
metrics.requests.active = registry.getGauge("active_requests");
metrics.rateLimit.hits = registry.getCounter("rate_limit_hits_total");

export function getMetricsSnapshot(): Record<string, unknown> {
  return registry.getSnapshot();
}
