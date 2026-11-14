// API behaviour not covered by the shared vectors.
import 'package:nass/nass.dart' hide contains;
import 'package:nass/nass.dart' as nass show contains;
import 'package:test/test.dart';

const hadith = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';

void main() {
  test('highlight wraps matches in the vocalized original', () {
    expect(
      highlight(hadith, 'الاعمال'),
      'إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ',
    );
    expect(
      highlight(hadith, 'النيات', open: '[', close: ']'),
      'إِنَّمَا الْأَعْمَالُ بِ[النِّيَّاتِ]',
    );
    expect(highlight(hadith, 'غائب'), hadith);
  });

  test('contains and wholeWord', () {
    expect(nass.contains(hadith, 'انما الاعمال'), isTrue);
    expect(nass.contains(hadith, 'الاعمال', wholeWord: true), isTrue);
    expect(nass.contains(hadith, 'عمال', wholeWord: true), isFalse);
    expect(
      nass.contains(hadith, 'ُ'),
      isFalse,
      reason: 'a needle that normalizes to nothing',
    );
  });

  test('match modes', () {
    expect(
      findAll(
        hadith,
        'النيات انما',
        matchMode: MatchMode.allWords,
      ).map((m) => m.text),
      ['إِنَّمَا', 'النِّيَّاتِ'],
    );
    expect(
      findAll(hadith, 'النيات غائب', matchMode: MatchMode.allWords),
      isEmpty,
    );
    expect(
      findAll(hadith, 'النيات غائب', matchMode: MatchMode.anyWord).single.text,
      'النِّيَّاتِ',
    );
  });

  test('Match value semantics', () {
    const a = Match(1, 3, 'ab'), b = Match(1, 3, 'ab');
    expect(a, b);
    expect(a.hashCode, b.hashCode);
    expect(a, isNot(const Match(1, 4, 'ab')));
    expect(a.toString(), 'Match(1, 3, "ab")');
  });

  test('normalizeWithMap maps spans back to the original', () {
    final m = normalizeWithMap(hadith);
    expect(m.start.length, m.text.length);
    final (s, e) = m.toOriginal(5, 12)!;
    expect(hadith.substring(s, e), 'الْأَعْمَالُ');
    expect(m.toOriginal(3, 3), isNull);
  });

  test('astral characters', () {
    // U+10100 AEGEAN WORD SEPARATOR LINE is punctuation (Po); emoji are symbols.
    expect(normalize('ب\u{10100}ت'), 'ب ت');
    expect(normalize('ب 👨 ت'), 'ب 👨 ت');
    expect(normalize('\u{10100}', level: Level.clean), '\u{10100}');
  });
}
