// Dev tool: answers a batch of JSON requests, used by tools/*.mjs to compare
// the Dart package with the oracle and to compute generated vectors.
// Usage: dart run tool/cli.dart < requests.json > responses.json
// Request: {"op": "normalize"|"map"|"findAll"|"nameKey"|"splitIsnad", ...}
import 'dart:convert';
import 'dart:io';

import 'package:nass/nass.dart';

Object? handle(Map<String, dynamic> r) {
  final level = Level.values.byName((r['level'] as String?) ?? 'search');
  final hon = Honorifics.values.byName((r['honorifics'] as String?) ?? 'keep');
  switch (r['op']) {
    case 'normalize':
      return normalize(r['text'] as String, level: level, honorifics: hon);
    case 'map':
      final m = normalizeWithMap(
        r['text'] as String,
        level: level,
        honorifics: hon,
      );
      return {'text': m.text, 'start': m.start, 'end': m.end};
    case 'findAll':
      return findAll(
        r['haystack'] as String,
        r['needle'] as String,
        level: level,
        honorifics: hon,
        matchMode: MatchMode.values.byName(
          (r['matchMode'] as String?) ?? 'phrase',
        ),
        wholeWord: (r['wholeWord'] as bool?) ?? false,
      ).map((m) => {'start': m.start, 'end': m.end, 'text': m.text}).toList();
    case 'nameKey':
      return nameKey(r['text'] as String);
    case 'splitIsnad':
      final s = splitIsnad(r['text'] as String);
      return {
        'isnad': s.isnad,
        'matn': s.matn,
        'confidence': s.confidence,
        'narrators': [
          for (final n in s.narrators) {'name': n.name, 'form': n.form},
        ],
      };
  }
  throw ArgumentError('unknown op ${r['op']}');
}

Future<void> main() async {
  final input = await stdin.transform(utf8.decoder).join();
  final reqs = (jsonDecode(input) as List).cast<Map<String, dynamic>>();
  stdout.add(utf8.encode(jsonEncode(reqs.map(handle).toList())));
}
