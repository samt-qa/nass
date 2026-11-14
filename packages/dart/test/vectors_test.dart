// Runs the shared test vectors in spec/vectors against the Dart package.
import 'dart:convert';
import 'dart:io';

import 'package:nass/nass.dart';
import 'package:test/test.dart';

List<Map<String, dynamic>> load(String name) {
  final f = File('../../spec/vectors/$name.json');
  final doc = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
  return (doc['cases'] as List).cast<Map<String, dynamic>>();
}

Level level(Object? v) => Level.values.byName((v as String?) ?? 'search');
Honorifics hon(Map? o) =>
    Honorifics.values.byName((o?['honorifics'] as String?) ?? 'keep');
MatchMode mode(Map? o) =>
    MatchMode.values.byName((o?['matchMode'] as String?) ?? 'phrase');

void main() {
  group('normalize', () {
    for (final c in load('normalize')) {
      test('${c['id']}: ${c['note']}', () {
        expect(
          normalize(
            c['input'] as String,
            level: level(c['level']),
            honorifics: hon(c['options'] as Map?),
          ),
          c['expected'],
        );
      });
    }
  });

  group('offsets', () {
    for (final c in load('offsets')) {
      test('${c['id']}: ${c['note']}', () {
        final r = normalizeWithMap(
          c['input'] as String,
          level: level(c['level']),
          honorifics: hon(c['options'] as Map?),
        );
        expect(r.text, c['expected']);
        expect(r.start, c['start']);
        expect(r.end, c['end']);
      });
    }
  });

  group('search', () {
    for (final c in load('search')) {
      test('${c['id']}: ${c['note']}', () {
        final o = c['options'] as Map?;
        final got = findAll(
          c['haystack'] as String,
          c['needle'] as String,
          level: level(o?['level']),
          matchMode: mode(o),
          wholeWord: (o?['wholeWord'] as bool?) ?? false,
          honorifics: hon(o),
        );
        expect(
          got
              .map((m) => {'start': m.start, 'end': m.end, 'text': m.text})
              .toList(),
          c['expected'],
        );
      });
    }
  });

  group('names', () {
    for (final c in load('names')) {
      test('${c['id']}: ${c['note']}', () {
        if (c.containsKey('expected')) {
          expect(nameKey(c['input'] as String), c['expected']);
        }
        if (c.containsKey('same')) {
          final keys = (c['same'] as List)
              .map((n) => nameKey(n as String))
              .toSet();
          expect(keys.length, 1, reason: 'keys: $keys');
        }
        if (c.containsKey('different')) {
          final names = (c['different'] as List).cast<String>();
          final keys = names.map(nameKey).toSet();
          expect(keys.length, names.length, reason: 'keys: $keys');
        }
      });
    }
  });

  group('isnad', () {
    final cases = load('isnad');
    for (final c in cases) {
      test('${c['id']}', () {
        final input = c['input'] as String;
        final r = splitIsnad(input);
        final start = r.isnad.isEmpty ? -1 : input.length - r.matn.length;
        expect({
          'matnStart': start,
          'confidence': r.confidence,
          'narrators': [
            for (final n in r.narrators) {'name': n.name, 'form': n.form},
          ],
        }, c['reference']);
        if (start >= 0) expect(r.isnad, input.substring(0, start).trimRight());
      });
    }
    for (final (split, min) in [('dev', 0.95), ('test', 0.9)]) {
      test('$split accuracy >= $min', () {
        final set = cases.where((c) => c['split'] == split).toList();
        final ok = set
            .where(
              (c) => (c['acceptMatnStart'] as List).contains(
                (c['reference'] as Map)['matnStart'],
              ),
            )
            .length;
        expect(ok / set.length, greaterThanOrEqualTo(min));
      });
    }
    test('no split for plain text', () {
      final r = splitIsnad('الحمد لله رب العالمين');
      expect(
        [r.isnad, r.matn, r.confidence, r.narrators],
        ['', 'الحمد لله رب العالمين', 0, isEmpty],
      );
      expect(splitIsnad('').matn, '');
      expect(splitIsnad('حدثنا').isnad, '');
    });
    test('vocalized text is split on the original', () {
      final r = splitIsnad(
        'حَدَّثَنَا مَالِكٌ عَنْ نَافِعٍ عَنِ ابْنِ عُمَرَ أَنَّ رَسُولَ اللَّهِ ﷺ قَالَ لَا يَبِعْ بَعْضُكُمْ',
      );
      expect(r.matn, 'لَا يَبِعْ بَعْضُكُمْ');
      expect(r.narrators.map((n) => n.name), [
        'مَالِكٌ',
        'نَافِعٍ',
        'ابْنِ عُمَرَ',
      ]);
    });
  });
}
