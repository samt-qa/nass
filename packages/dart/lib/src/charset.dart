// Runtime lookup tables built once from the generated tables.
// Everything on the hot path is an array index over the BMP; astral code
// points (rare in Arabic text) fall back to small lists.
import 'dart:typed_data';

import 'tables.g.dart' as t;

// flags
const int fInvisAlways = 1;
const int fInvisNear = 2;
const int fTatweel = 4;
const int fArabic = 8;
const int fMark = 16;
const int fSep = 32; // punctuation or extra separator (S5)
const int fSpace = 64;
const int fLooseRemove = 128;

class Charset {
  Charset._();
  static final Charset instance = Charset._().._build();

  final Uint8List flags = Uint8List(0x10000);
  final Uint8List ccc = Uint8List(0x10000);

  /// S3/S4/S6 single-character map (letters, digits, ASCII case). 0 = none.
  final Int32List map1 = Int32List(0x10000);
  final Int32List looseMap = Int32List(0x10000);
  final Int32List digitSep = Int32List(0x10000);

  /// Second code point of a composition -> list of (first, composed).
  final Map<int, Map<int, int>> compose = {};

  /// Presentation expansions: index into [presData] as (offset << 8 | length).
  final Int32List pres = Int32List(0x10000);
  final Int32List presSearch = Int32List(0x10000);
  final List<int> presData = [0]; // offset 0 means "none"

  final Set<int> astralSep = {};
  final Set<int> astralSpace = {};

  void _ranges(List<int> flat, int flag, [Set<int>? astral]) {
    for (var i = 0; i < flat.length; i += 2) {
      for (var c = flat[i]; c <= flat[i + 1]; c++) {
        if (c < 0x10000) {
          flags[c] |= flag;
        } else {
          astral?.add(c);
        }
      }
    }
  }

  void _expansions(List<int> flat, Int32List into) {
    var i = 0;
    while (i < flat.length) {
      final k = flat[i], n = flat[i + 1];
      into[k] = presData.length << 8 | n;
      presData.addAll(flat.sublist(i + 2, i + 2 + n));
      i += 2 + n;
    }
  }

  static void _pairs(List<int> flat, Int32List into) {
    for (var i = 0; i < flat.length; i += 2) {
      into[flat[i]] = flat[i + 1];
    }
  }

  void _build() {
    _ranges(t.invisibleAlways, fInvisAlways);
    _ranges(t.invisibleNearArabic, fInvisNear);
    _ranges(t.tatweel, fTatweel);
    _ranges(t.arabic, fArabic);
    _ranges(t.marks, fMark);
    _ranges(t.punctuation, fSep, astralSep);
    _ranges(t.extraSeparators, fSep);
    _ranges(t.whitespace, fSpace, astralSpace);
    _ranges(t.looseRemove, fLooseRemove);
    flags[0x25] &= ~fSep; // '%' is kept as a symbol (SPEC S5)
    for (var i = 0; i < t.ccc.length; i += 2) {
      ccc[t.ccc[i]] = t.ccc[i + 1];
    }
    for (var i = 0; i < t.compositions.length; i += 3) {
      (compose[t.compositions[i + 1]] ??= {})[t.compositions[i]] = t.compositions[i + 2];
    }
    _expansions(t.presentation, pres);
    _expansions(t.presentationSearch, presSearch);
    _pairs(t.letterMap, map1);
    _pairs(t.digitMap, map1);
    for (var c = 0x41; c <= 0x5A; c++) {
      map1[c] = c + 0x20;
    }
    _pairs(t.looseMap, looseMap);
    _pairs(t.digitSeparators, digitSep);
  }

  int flagsOf(int c) => c < 0x10000 ? flags[c] : 0;
  int cccOf(int c) => c < 0x10000 ? ccc[c] : 0;
  bool isArabic(int c) => c < 0x10000 && flags[c] & fArabic != 0;
  bool isSep(int c) => c < 0x10000 ? flags[c] & fSep != 0 : astralSep.contains(c);
  bool isSpace(int c) => c < 0x10000 ? flags[c] & fSpace != 0 : astralSpace.contains(c);
}
