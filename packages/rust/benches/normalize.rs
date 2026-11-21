// Benchmark: normalize ~1 MB of fully vocalized Arabic, the same text as
// packages/dart/benchmark/normalize_bench.dart (1 Mi UTF-16 units), at each level.
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use nass::{normalize, normalize_into, Level, Options};

fn text() -> String {
    let unit = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى ﷺ. ";
    let mut s = String::new();
    let mut units = 0;
    while units < 1 << 20 {
        s.push_str(unit);
        units += unit.encode_utf16().count();
    }
    s
}

fn bench(c: &mut Criterion) {
    let t = text();
    let mut g = c.benchmark_group("normalize_1M_utf16_units");
    g.throughput(Throughput::Bytes(t.len() as u64));
    g.sample_size(20);
    for (name, level) in [
        ("clean", Level::Clean),
        ("search", Level::Search),
        ("loose", Level::Loose),
    ] {
        let o = Options::level(level);
        g.bench_with_input(BenchmarkId::new("normalize", name), &o, |b, o| {
            b.iter(|| normalize(&t, o))
        });
        let mut out = String::new();
        g.bench_with_input(BenchmarkId::new("normalize_into", name), &o, |b, o| {
            b.iter(|| normalize_into(&t, o, &mut out))
        });
    }
    g.finish();
}

criterion_group!(benches, bench);
criterion_main!(benches);
