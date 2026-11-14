// Adapter for BilalFali/arabic_dev_utils (Dart).
// The package depends on the Flutter SDK (for its RTL widgets) and on intl, but the text
// and search files only import package:meta for an @internal annotation. run.mjs therefore
// writes a package_config.json that maps `arabic_dev_utils` to the clone and `meta` to
// tools/compare/dart/meta_stub, and runs: dart --packages=<config> adapter.dart
// Protocol: see tools/compare/README.md (one tab-separated request per line on stdin).
//
// Mapping of nass levels to this library's functions:
//   clean  -> ArabicText.removeTatweel(ArabicText.stripInvisibleChars(x))
//   search -> ArabicText.stripInvisibleChars(ArabicText.normalize(x))   (normalizeTeh: false)
//   loose  -> ArabicSearch.normalizeForSearch(x)                          (adds ة→ه)
//   honorifics: "strip"  -> unsupported (no such function)
// Search: ArabicSearch.matches() returns a bool and no positions, so every search case is
// unsupported for offsets. For phrase cases without wholeWord the bool is still reported
// ("B"), and run.mjs compares it with whether `expected` is non-empty.

import 'dart:convert';
import 'dart:io';

import 'package:arabic_dev_utils/src/search/arabic_search.dart';
import 'package:arabic_dev_utils/src/text/arabic_text.dart';

String unhex(String h) {
  final bytes = <int>[];
  for (var i = 0; i < h.length; i += 2) {
    bytes.add(int.parse(h.substring(i, i + 2), radix: 16));
  }
  return utf8.decode(bytes);
}

String hex(String s) =>
    utf8.encode(s).map((b) => b.toRadixString(16).padLeft(2, '0')).join();

String normalizeAt(String level, String x) {
  switch (level) {
    case 'clean':
      return ArabicText.removeTatweel(ArabicText.stripInvisibleChars(x));
    case 'search':
      return ArabicText.stripInvisibleChars(ArabicText.normalize(x));
    case 'loose':
      return ArabicSearch.normalizeForSearch(x);
  }
  throw ArgumentError('unknown level $level');
}

Future<void> main() async {
  final out = StringBuffer();
  await for (final raw
      in stdin.transform(utf8.decoder).transform(const LineSplitter())) {
    final line = raw.trimRight();
    if (line.isEmpty) continue;
    final f = line.split('\t');
    if (f[0] == 'N') {
      final id = f[1], level = f[2], honorifics = f[3];
      final input = f.length > 4 ? f[4] : '';
      if (honorifics == 'strip') {
        out.writeln('$id\tU\tno option to remove written honorific phrases');
        continue;
      }
      out.writeln('$id\tN\t${hex(normalizeAt(level, unhex(input)))}');
    } else if (f[0] == 'S') {
      final id = f[1], matchMode = f[3], wholeWord = f[4];
      if (matchMode != 'phrase' || wholeWord == '1') {
        out.writeln('$id\tU\tno $matchMode${wholeWord == '1' ? '/wholeWord' : ''} mode and no positions');
        continue;
      }
      final found = ArabicSearch.matches(query: unhex(f[6]), text: unhex(f[5]));
      out.writeln('$id\tB\t${found ? 1 : 0}');
    }
  }
  stdout.write(out.toString());
}
