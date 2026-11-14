// Normalization pipeline (SPEC §1–§5).
//
// Text is decoded into a buffer of code points, each carrying the [start, end)
// span of its source group in the original string (UTF-16 units). Steps map
// one buffer to the next with table lookups; no regular expressions are used.
//
//   pass 1  decode + C2 C3 C4 C5 + Z (space collapse at insertion)
//   pass 2  C1 Arabic canonical reordering + composition, in place
//   pass 3  S1 S2 S3 S4 S5 S6 (+ L1 in loose) + Z            [search, loose]
//   pass 4  S7 written honorifics + Z                         [strip only]
import 'dart:typed_data';

import 'charset.dart';
import 'tables.g.dart' as t;

/// Normalization level (SPEC §1). Each level includes the previous one.
enum Level { clean, search, loose }

/// How honorific formulas and ligatures are treated (SPEC S1, S7).
enum Honorifics { keep, strip }

/// Result of [normalizeWithMap]: normalized text plus, for every UTF-16 unit of
/// [text], the [start, end) span of its source group in the original string.
class NormalizedText {
  final String text;
  final List<int> start;
  final List<int> end;
  const NormalizedText(this.text, this.start, this.end);

  /// Maps a span [s, e) of [text] back to the original string.
  /// Returns `null` for an empty span.
  (int, int)? toOriginal(int s, int e) =>
      s >= e ? null : (start[s], end[e - 1]);
}

const int _space = 0x20;
const int _zwnj = 0x200C;
const int _zwj = 0x200D;
final Charset _cs = Charset.instance;

/// Growable triple of typed arrays: code point, source start, source end.
class Buf {
  Int32List cp, s, e;
  int length = 0;
  Buf(int capacity)
    : cp = Int32List(capacity < 8 ? 8 : capacity),
      s = Int32List(capacity < 8 ? 8 : capacity),
      e = Int32List(capacity < 8 ? 8 : capacity);

  void _grow() {
    final n = cp.length * 2;
    cp = Int32List(n)..setRange(0, length, cp);
    s = Int32List(n)..setRange(0, length, s);
    e = Int32List(n)..setRange(0, length, e);
  }

  void add(int c, int st, int en) {
    if (length == cp.length) _grow();
    cp[length] = c;
    s[length] = st;
    e[length] = en;
    length++;
  }

  /// Adds a space unless the buffer is empty or already ends with one (Z).
  void addSpace(int st, int en) {
    if (length == 0 || cp[length - 1] == _space) return;
    add(_space, st, en);
  }

  /// A deleted mark joins the source group of the last kept unit (SPEC §5).
  /// Units produced by one expansion share the same start, so all are extended.
  void attach(int en) {
    if (length == 0) return;
    final st = s[length - 1];
    for (var i = length - 1; i >= 0 && s[i] == st; i--) {
      if (e[i] < en) e[i] = en;
    }
  }

  void trimEnd() {
    if (length > 0 && cp[length - 1] == _space) length--;
  }

  String get text => String.fromCharCodes(cp, 0, length);
}

// ---------------------------------------------------------------- pass 1

/// Decode UTF-16 and apply C2 (invisibles), C3 (tatweel), C4 (presentation
/// forms) and C5 (spaces), collapsing spaces as they are added.
Buf _pass1(String text) {
  final n = text.length;
  final out = Buf(n + 16);
  final flags = _cs.flags;
  final pres = _cs.pres;
  final data = _cs.presData;
  var i = 0;
  while (i < n) {
    var c = text.codeUnitAt(i);
    var w = 1;
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      final d = text.codeUnitAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) {
        c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
        w = 2;
      }
    }
    final st = i, en = i + w;
    i = en;
    if (c >= 0x10000) {
      if (_cs.isSpace(c)) {
        out.addSpace(st, en);
      } else {
        out.add(c, st, en);
      }
      continue;
    }
    final f = flags[c];
    if (f == 0) {
      out.add(c, st, en);
      continue;
    }
    if (f & (fInvisAlways | fTatweel) != 0) {
      out.attach(en);
      continue;
    }
    if (f & fInvisNear != 0) {
      // Neighbours: nearest input code points on each side that are not
      // invisible (SPEC C2). Tatweel counts as Arabic.
      var near = false;
      for (var m = st - 1; m >= 0; m--) {
        final x = text.codeUnitAt(m);
        if (flags[x] & (fInvisAlways | fInvisNear) == 0) {
          near = flags[x] & fArabic != 0;
          break;
        }
      }
      if (!near) {
        var m = i;
        while (m < n) {
          final x = text.codeUnitAt(m);
          if (flags[x] & (fInvisAlways | fInvisNear) == 0) {
            near = flags[x] & fArabic != 0;
            break;
          }
          m++;
        }
      }
      // ZWNJ next to Arabic is kept in clean and removed in search (SPEC C2, S2).
      if (near && c != _zwnj) {
        out.attach(en);
      } else {
        out.add(c, st, en);
      }
      continue;
    }
    final p = pres[c];
    if (p != 0) {
      final off = p >> 8, len = p & 0xFF;
      for (var k = 0; k < len; k++) {
        out.add(data[off + k], st, en);
      }
      continue;
    }
    if (f & fSpace != 0) {
      out.addSpace(st, en);
    } else {
      out.add(c, st, en);
    }
  }
  out.trimEnd();
  return out;
}

// ---------------------------------------------------------------- pass 2 (C1)

/// Arabic-scope canonical normalization, in place: stable reordering of runs
/// of non-zero combining class, then the Arabic canonical compositions.
void _c1(Buf a) {
  final cp = a.cp, s = a.s, e = a.e, ccc = _cs.ccc;
  final n = a.length;
  // Reordering (insertion sort; runs are short).
  var i = 0;
  while (i < n) {
    final c = cp[i];
    if (c >= 0x10000 || ccc[c] == 0) {
      i++;
      continue;
    }
    var j = i + 1;
    while (j < n && cp[j] < 0x10000 && ccc[cp[j]] != 0) {
      j++;
    }
    if (j - i > 1) {
      var changed = false;
      for (var k = i + 1; k < j; k++) {
        final x = cp[k], xs = s[k], xe = e[k], xc = ccc[x];
        var m = k - 1;
        while (m >= i && ccc[cp[m]] > xc) {
          cp[m + 1] = cp[m];
          s[m + 1] = s[m];
          e[m + 1] = e[m];
          m--;
          changed = true;
        }
        cp[m + 1] = x;
        s[m + 1] = xs;
        e[m + 1] = xe;
      }
      if (changed) {
        var lo = s[i], hi = e[i];
        for (var k = i; k < j; k++) {
          if (s[k] < lo) lo = s[k];
          if (e[k] > hi) hi = e[k];
        }
        for (var k = i; k < j; k++) {
          s[k] = lo;
          e[k] = hi;
        }
      }
    }
    i = j;
  }
  // Composition, compacting in place.
  var w = 0;
  var starter = -1;
  var lastCcc = -1;
  for (var k = 0; k < n; k++) {
    final c = cp[k];
    final cc = c < 0x10000 ? ccc[c] : 0;
    if (starter >= 0 && (lastCcc == -1 || lastCcc < cc)) {
      final firsts = _cs.compose[c];
      final composed = firsts?[cp[starter]];
      if (composed != null) {
        cp[starter] = composed;
        if (e[k] > e[starter]) e[starter] = e[k];
        continue;
      }
    }
    if (cc == 0) {
      starter = w;
      lastCcc = -1;
    } else {
      lastCcc = cc;
    }
    cp[w] = c;
    s[w] = s[k];
    e[w] = e[k];
    w++;
  }
  a.length = w;
}

// ---------------------------------------------------------------- pass 3 (S1–S6, L1)

bool _isDigit(int c) => c >= 0x30 && c <= 0x39;

bool _becomesDigit(int c) {
  if (_isDigit(c)) return true;
  if (c >= 0x10000) return false;
  return _isDigit(_cs.map1[c]);
}

Buf _pass3(Buf a, Honorifics h, bool loose) {
  final out = Buf(a.length + 16);
  final flags = _cs.flags, presSearch = _cs.presSearch, data = _cs.presData;
  for (var k = 0; k < a.length; k++) {
    final c = a.cp[k], st = a.s[k], en = a.e[k];
    if (c < 0x10000) {
      // S1 honorific / basmala ligatures.
      final p = presSearch[c];
      if (p != 0) {
        if (h == Honorifics.strip && c != 0xFDFD) {
          out.addSpace(st, en);
        } else {
          final off = p >> 8, len = p & 0xFF;
          for (var m = 0; m < len; m++) {
            _emit(out, data[off + m], st, en, -1, loose);
          }
        }
        continue;
      }
      // S2 ZWNJ next to Arabic in the clean text.
      if (c == _zwnj && _zwnjNearArabic(a, k)) {
        out.attach(en);
        continue;
      }
      // S2 marks.
      if (flags[c] & fMark != 0) {
        out.attach(en);
        continue;
      }
    }
    // Next code point that survives S2 (marks are deleted), for S4.
    var next = -1;
    for (var m = k + 1; m < a.length; m++) {
      final x = a.cp[m];
      if (x >= 0x10000 || flags[x] & fMark == 0) {
        next = x;
        break;
      }
    }
    _emit(out, c, st, en, next, loose);
  }
  out.trimEnd();
  return out;
}

/// Whether the ZWNJ at [k] has an Arabic neighbour: the nearest code point on
/// either side that is not ZWNJ or ZWJ (SPEC S2).
bool _zwnjNearArabic(Buf a, int k) {
  bool arabic(int x) => x < 0x10000 && _cs.flags[x] & fArabic != 0;
  for (var m = k - 1; m >= 0; m--) {
    final x = a.cp[m];
    if (x == _zwnj || x == _zwj) continue;
    if (arabic(x)) return true;
    break;
  }
  for (var m = k + 1; m < a.length; m++) {
    final x = a.cp[m];
    if (x == _zwnj || x == _zwj) continue;
    return arabic(x);
  }
  return false;
}

/// S3–S6 (and L1 when [loose]) for one code point.
void _emit(Buf out, int c, int st, int en, int next, bool loose) {
  if (c >= 0x10000) {
    if (_cs.isSep(c)) {
      out.addSpace(st, en);
    } else {
      out.add(c, st, en);
    }
    return;
  }
  if (c == _space) {
    out.addSpace(st, en);
    return;
  }
  // S3 letters, S4 digits, S6 ASCII case.
  final m = _cs.map1[c];
  if (m != 0) {
    c = m;
  } else {
    // S4 digit separators between two digits.
    final sep = _cs.digitSep[c];
    if (sep != 0) {
      final prev = out.length > 0 ? out.cp[out.length - 1] : -1;
      if (_isDigit(prev) && next >= 0 && _becomesDigit(next)) {
        out.add(sep, st, en);
        return;
      }
    }
    // S5 punctuation.
    if (_cs.flags[c] & fSep != 0) {
      out.addSpace(st, en);
      return;
    }
  }
  if (loose) {
    // L1.
    if (_cs.flags[c] & fLooseRemove != 0) {
      out.attach(en);
      return;
    }
    final l = _cs.looseMap[c];
    if (l != 0) c = l;
  }
  out.add(c, st, en);
}

// ---------------------------------------------------------------- pass 4 (S7)

// Longest phrase first, so «سبحانه وتعالي» wins over «سبحانه».
List<List<String>> _byLength(List<String> list, bool loose) =>
    list
        .map((p) => (loose ? normalize(p, level: Level.loose) : p).split(' '))
        .toList()
      ..sort((a, b) => b.length - a.length);
final List<List<String>> _always = _byLength(t.honorificsAlways, false);
final List<List<String>> _afterAllah = _byLength(t.honorificsAfterAllah, false);
final List<List<String>> _alwaysLoose = _byLength(t.honorificsAlways, true);
final List<List<String>> _afterAllahLoose = _byLength(
  t.honorificsAfterAllah,
  true,
);

/// Remove written honorific formulas (SPEC S7). [a] is already collapsed.
Buf _s7(Buf a, bool loose) {
  final always = loose ? _alwaysLoose : _always;
  final afterAllah = loose ? _afterAllahLoose : _afterAllah;
  // Words as (start, end) indices into a.
  final ws = <int>[];
  var i = 0;
  while (i < a.length) {
    var j = i;
    while (j < a.length && a.cp[j] != _space) {
      j++;
    }
    ws
      ..add(i)
      ..add(j);
    i = j + 1;
  }
  final nw = ws.length ~/ 2;
  final texts = [
    for (var w = 0; w < nw; w++)
      String.fromCharCodes(a.cp, ws[2 * w], ws[2 * w + 1]),
  ];
  final removed = List<bool>.filled(nw, false);
  bool matchAt(int w, List<String> p) {
    if (w + p.length > nw) return false;
    for (var k = 0; k < p.length; k++) {
      if (texts[w + k] != p[k]) return false;
    }
    return true;
  }

  var any = false;
  var w = 0;
  while (w < nw) {
    List<String>? hit;
    for (final p in always) {
      if (matchAt(w, p)) {
        hit = p;
        break;
      }
    }
    if (hit == null && w > 0 && texts[w - 1] == 'الله') {
      for (final p in afterAllah) {
        if (matchAt(w, p)) {
          hit = p;
          break;
        }
      }
    }
    if (hit != null) {
      for (var k = 0; k < hit.length; k++) {
        removed[w + k] = true;
      }
      any = true;
      w += hit.length;
    } else {
      w++;
    }
  }
  if (!any) return a;
  final out = Buf(a.length);
  for (var w = 0; w < nw; w++) {
    if (removed[w]) continue;
    if (out.length > 0) {
      // Keep the original separator before this word.
      final sp = ws[2 * w] - 1;
      out.add(_space, a.s[sp], a.e[sp]);
    }
    for (var k = ws[2 * w]; k < ws[2 * w + 1]; k++) {
      out.add(a.cp[k], a.s[k], a.e[k]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- public

Buf normalizeBuf(String text, Level level, Honorifics honorifics) {
  var b = _pass1(text);
  _c1(b);
  if (level == Level.clean) return b;
  b = _pass3(b, honorifics, level == Level.loose);
  if (honorifics == Honorifics.strip) {
    // Repeat until stable: a removal can make «الله» precede another formula.
    for (var prev = -1; prev != b.length;) {
      prev = b.length;
      b = _s7(b, level == Level.loose);
    }
  }
  return b;
}

/// Normalizes [text] (SPEC §1). Deterministic and idempotent.
String normalize(
  String text, {
  Level level = Level.search,
  Honorifics honorifics = Honorifics.keep,
}) => normalizeBuf(text, level, honorifics).text;

/// Normalizes [text] and returns, for each UTF-16 unit of the result, the
/// span of its source in [text] (SPEC §5).
NormalizedText normalizeWithMap(
  String text, {
  Level level = Level.search,
  Honorifics honorifics = Honorifics.keep,
}) {
  final b = normalizeBuf(text, level, honorifics);
  final start = <int>[], end = <int>[];
  for (var k = 0; k < b.length; k++) {
    final units = b.cp[k] > 0xFFFF ? 2 : 1;
    for (var u = 0; u < units; u++) {
      start.add(b.s[k]);
      end.add(b.e[k]);
    }
  }
  return NormalizedText(
    b.text,
    List.unmodifiable(start),
    List.unmodifiable(end),
  );
}
