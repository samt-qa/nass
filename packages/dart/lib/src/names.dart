// Name matching key (SPEC §7). For comparison and indexing, never for display.
import 'normalizer.dart';
import 'tables.g.dart' as t;

final Set<String> _titles = t.trailingTitles.toSet();
final Map<String, String> _kunya = {
  for (var i = 0; i < t.kunya.length; i += 2) t.kunya[i]: t.kunya[i + 1],
};
final Set<String> _dhaFollowers = t.dhaFollowers.toSet();
final Set<String> _ibn = t.ibn.toSet();
final Set<String> _bint = t.bint.toSet();

/// A normalized key for comparing and indexing personal names.
///
/// Equal keys do NOT mean the same person.
String nameKey(String name) {
  // 1. search level with honorifics stripped.
  final base = normalize(name, level: Level.search, honorifics: Honorifics.strip);
  if (base.isEmpty) return '';
  final w = base.split(' ');
  // 2. trailing titles.
  while (w.length > 1 && _titles.contains(w.last)) {
    w.removeLast();
  }
  // 3–4. kunya cases, ذا, ibn/bint.
  for (var i = 0; i < w.length; i++) {
    final k = _kunya[w[i]];
    if (k != null) {
      w[i] = k;
    } else if (w[i] == 'ذا' && i + 1 < w.length && _dhaFollowers.contains(w[i + 1])) {
      w[i] = 'ذو';
    } else if (_ibn.contains(w[i])) {
      w[i] = 'بن';
    } else if (_bint.contains(w[i])) {
      w[i] = 'بنت';
    }
  }
  // 5. join «عبد» with the next word.
  final joined = <String>[];
  for (var i = 0; i < w.length; i++) {
    if (w[i] == 'عبد' && i + 1 < w.length) {
      joined.add('عبد${w[i + 1]}');
      i++;
    } else {
      joined.add(w[i]);
    }
  }
  // 6–7. loose letter rules, then spaces.
  return normalize(joined.join(' '), level: Level.loose);
}
