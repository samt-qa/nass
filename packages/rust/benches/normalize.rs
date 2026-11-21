// Benchmark: normalize 1 Mi UTF-16 units (~2 MB UTF-8) of real, fully vocalized
// hadith text: Sahih al-Bukhari in file order, built by tools/bench-text.mjs and
// shared with the Dart, JS and PHP benchmarks. Each level runs normalize,
// normalize_into (reused buffer) and normalize_with_map.
// Run from packages/rust: cargo bench --bench normalize
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};
use nass::{normalize, normalize_into, normalize_with_map, Level, Options};

fn text() -> String {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../tools/corpus/bench-bukhari-1m.txt"
    );
    std::fs::read_to_string(path).unwrap_or_else(|e| {
        panic!(
            "cannot read {path}: {e}\n\
             run: node tools/fetch-corpus.mjs && node tools/bench-text.mjs"
        )
    })
}

fn bench(c: &mut Criterion) {
    let t = text();
    let mut g = c.benchmark_group("normalize_bukhari_1M_utf16_units");
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
        g.bench_with_input(BenchmarkId::new("normalize_with_map", name), &o, |b, o| {
            b.iter(|| normalize_with_map(&t, o))
        });
    }
    g.finish();
}

criterion_group!(benches, bench);
criterion_main!(benches);
