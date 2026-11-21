// Benchmark: normalize 1 Mi UTF-16 units (~2 MB UTF-8) of real, fully vocalized
// hadith text: Sahih al-Bukhari in file order, built by tools/bench-text.mjs
// (PRD §6.4: < 50 ms). Run from packages/dart:
// dart run benchmark/normalize_bench.dart
import 'dart:io';

import 'package:nass/nass.dart';

void main() {
  final file = File.fromUri(
    Platform.script.resolve('../../../tools/corpus/bench-bukhari-1m.txt'),
  );
  if (!file.existsSync()) {
    stderr.writeln(
      'missing ${file.path}\n'
      'run: node tools/fetch-corpus.mjs && node tools/bench-text.mjs',
    );
    exit(1);
  }
  final text = file.readAsStringSync();
  for (final level in Level.values) {
    for (var i = 0; i < 5; i++) {
      normalize(text, level: level); // warm-up
    }
    final sw = Stopwatch()..start();
    const runs = 10;
    for (var i = 0; i < runs; i++) {
      normalize(text, level: level);
    }
    print(
      '${level.name}: ${(sw.elapsedMicroseconds / runs / 1000).toStringAsFixed(1)} ms '
      'per ${(text.length / 1024).round()} K units',
    );
  }
}
