// Diacritic-insensitive search with offsets in the original text (SPEC §6).
import 'normalizer.dart';

/// How the needle is matched (SPEC §6).
enum MatchMode { phrase, allWords, anyWord }

/// A match in the ORIGINAL haystack: [start, end) in UTF-16 units.
class Match {
  final int start;
  final int end;
  final String text;
  const Match(this.start, this.end, this.text);

  @override
  bool operator ==(Object other) =>
      other is Match && other.start == start && other.end == end && other.text == text;
  @override
  int get hashCode => Object.hash(start, end, text);
  @override
  String toString() => 'Match($start, $end, "$text")';
}

List<Match> _phrase(String haystack, NormalizedText hay, String needle, bool wholeWord) {
  final out = <Match>[];
  if (needle.isEmpty) return out;
  final t = hay.text;
  var from = 0;
  var lastEnd = -1;
  while (true) {
    final s = t.indexOf(needle, from);
    if (s < 0) break;
    final e = s + needle.length;
    final boundaryOk = !wholeWord ||
        ((s == 0 || t.codeUnitAt(s - 1) == 0x20) &&
            (e == t.length || t.codeUnitAt(e) == 0x20));
    if (boundaryOk) {
      final os = hay.start[s], oe = hay.end[e - 1];
      if (os >= lastEnd) {
        out.add(Match(os, oe, haystack.substring(os, oe)));
        lastEnd = oe;
      }
      from = e;
    } else {
      from = s + 1;
    }
  }
  return out;
}

/// Sorts by start, longer first on ties, and drops matches overlapping an earlier one.
List<Match> _merge(List<Match> all) {
  all.sort((a, b) => a.start != b.start ? a.start - b.start : (b.end - b.start) - (a.end - a.start));
  final out = <Match>[];
  var lastEnd = -1;
  for (final m in all) {
    if (m.start >= lastEnd) {
      out.add(m);
      lastEnd = m.end;
    }
  }
  return out;
}

/// All non-overlapping matches of [needle] in [haystack], as spans of the
/// original [haystack].
List<Match> findAll(
  String haystack,
  String needle, {
  Level level = Level.search,
  MatchMode matchMode = MatchMode.phrase,
  bool wholeWord = false,
  Honorifics honorifics = Honorifics.keep,
}) {
  final n = normalize(needle, level: level, honorifics: honorifics);
  if (n.isEmpty) return const [];
  final hay = normalizeWithMap(haystack, level: level, honorifics: honorifics);
  switch (matchMode) {
    case MatchMode.phrase:
      return _phrase(haystack, hay, n, wholeWord);
    case MatchMode.allWords:
    case MatchMode.anyWord:
      final all = <Match>[];
      for (final w in n.split(' ').toSet()) {
        final ms = _phrase(haystack, hay, w, wholeWord);
        if (ms.isEmpty && matchMode == MatchMode.allWords) return const [];
        all.addAll(ms);
      }
      return _merge(all);
  }
}

/// Whether [needle] occurs in [haystack] after normalization.
bool contains(
  String haystack,
  String needle, {
  Level level = Level.search,
  MatchMode matchMode = MatchMode.phrase,
  bool wholeWord = false,
  Honorifics honorifics = Honorifics.keep,
}) =>
    findAll(haystack, needle,
            level: level, matchMode: matchMode, wholeWord: wholeWord, honorifics: honorifics)
        .isNotEmpty;

/// Wraps every match in the ORIGINAL [haystack] with [open] and [close].
/// Does not escape HTML; escape [haystack] yourself if it is untrusted.
String highlight(
  String haystack,
  String needle, {
  Level level = Level.search,
  MatchMode matchMode = MatchMode.phrase,
  bool wholeWord = false,
  Honorifics honorifics = Honorifics.keep,
  String open = '<mark>',
  String close = '</mark>',
}) {
  final ms = findAll(haystack, needle,
      level: level, matchMode: matchMode, wholeWord: wholeWord, honorifics: honorifics);
  if (ms.isEmpty) return haystack;
  final sb = StringBuffer();
  var pos = 0;
  for (final m in ms) {
    sb
      ..write(haystack.substring(pos, m.start))
      ..write(open)
      ..write(m.text)
      ..write(close);
    pos = m.end;
  }
  sb.write(haystack.substring(pos));
  return sb.toString();
}
