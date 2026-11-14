// Property tests (PRD §8.2–8.3) over random strings built from tricky pieces.
import 'dart:math';

import 'package:nass/nass.dart' hide contains;
import 'package:test/test.dart';

const pieces = [
  'ب', 'س', 'م', 'ا', 'أ', 'إ', 'آ', 'ٱ', 'ى', 'ي', 'ة', 'ه', 'ؤ', 'ئ', 'ء', 'ک', 'ی', 'ھ',
  'َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ً', 'ٰ', 'ۥ', 'ۦ',
  'ۚ', 'ٔ', 'ٓ', 'ؐ', 'ـ', 'ﷲ', 'ﻻ', 'ﷺ', '﷽', 'ﷻ', '﵁', 'ﻣ', 'ﹰ',
  ' ', '  ', '\n', ' ', '،', '.', ',', '؟', '«', '»', '٫', '۝', '%', '٪',
  '١', '٢', '۳', '3', '7', '‍', '‌', '‏', '﻿', '👨', 'A', 'z',
  ' الله ', ' تعالى ', ' رضي الله عنه ', ' صلى الله عليه وسلم ', ' عز وجل ', ' عبد ', ' أبي ',
];

String randomText(Random r) {
  final n = r.nextInt(14);
  return List.generate(n, (_) => pieces[r.nextInt(pieces.length)]).join();
}

void main() {
  final r = Random(20261114);
  final samples = List.generate(3000, (_) => randomText(r));

  for (final level in Level.values) {
    for (final h in Honorifics.values) {
      test('idempotent: ${level.name}/${h.name}', () {
        for (final x in samples) {
          final once = normalize(x, level: level, honorifics: h);
          expect(normalize(once, level: level, honorifics: h), once, reason: 'input: ${x.runes.toList()}');
        }
      });
    }
  }

  test('levels include the previous level', () {
    for (final x in samples) {
      for (final h in Honorifics.values) {
        final clean = normalize(x, level: Level.clean, honorifics: h);
        expect(normalize(clean, honorifics: h), normalize(x, honorifics: h),
            reason: 'input: ${x.runes.toList()}');
        final search = normalize(x, honorifics: h);
        expect(normalize(search, level: Level.loose, honorifics: h),
            normalize(x, level: Level.loose, honorifics: h),
            reason: 'input: ${x.runes.toList()}');
      }
    }
  });

  test('map has one span per unit and spans lie inside the input', () {
    for (final x in samples) {
      for (final level in Level.values) {
        final m = normalizeWithMap(x, level: level);
        expect(m.start.length, m.text.length);
        expect(m.end.length, m.text.length);
        for (var i = 0; i < m.start.length; i++) {
          expect(m.start[i] < m.end[i] && m.end[i] <= x.length, isTrue);
          if (i > 0) expect(m.start[i] >= m.start[i - 1], isTrue, reason: 'input: ${x.runes.toList()}');
        }
      }
    }
  });

  test('every findAll span normalizes to the needle', () {
    for (final x in samples) {
      for (final level in Level.values) {
        final norm = normalize(x, level: level);
        for (final w in norm.split(' ').where((w) => w.isNotEmpty)) {
          final needle = normalize(w, level: level);
          for (final m in findAll(x, w, level: level)) {
            expect(normalize(m.text, level: level), contains(needle),
                reason: 'input: ${x.runes.toList()} needle: $w');
          }
        }
      }
    }
  });
}
