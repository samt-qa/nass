// Experimental isnad/matn split (SPEC §8). A small recursive-descent parser over
// search-normalized words: the isnad is a chain of links (a transmission word
// followed by a narrator), and the matn starts where no link can continue.
import 'normalizer.dart';

class Narrator {
  /// The narrator's name as written in the input (qualifiers such as «يعني ابن…» excluded).
  final String name;

  /// The transmission word that introduced the narrator, as written («حدثنا», «عن», …).
  final String form;
  const Narrator(this.name, this.form);
}

class IsnadSplit {
  final String isnad;
  final String matn;
  final double confidence;
  final List<Narrator> narrators;
  const IsnadSplit(this.isnad, this.matn, this.confidence, this.narrators);
}

Set<String> _set(String words) => {
  for (final w in words.split(' ')) normalize(w),
};

// Lexicon (SPEC §8.2). Stored normalized at the search level.
final _tv = _set(
  'حدثنا حدثني أخبرنا أخبرني أنبأنا أنبأني حدثناه أخبرناه حدثنيه أخبرنيه أخبرناه',
);
final _abbr = _set('ثنا نا أنا أنبا');
final _pronTv = _set(
  'حدثه حدثته حدثها حدثهم حدثهما أخبره أخبرته أخبرها أخبرهم أخبرهما حدث أخبر',
);
final _say = _set('قال قالت قالا قالوا يقول تقول يقولا يقولان');
final _hear = _set('سمعت سمع سمعه سمعنا سمعته سمعتها');
final _skip = _set('و ح أحسبه');
final _raise = _set('يرويه يرفعه رفعه');
final _qualifier = _set('يعني تعني وهو هو واسمه');
final _client = _set('زوج مولى صاحب');
final _mawla = _w('مولى'), _ha = _w('ح'), _wording = _w('واللفظ');
// Names that may follow «قال قال» (SPEC §8.3): a kunya/patronymic head takes the next word.
final _nameHead = _set('أبو أبي أبا أم ابن بنت عبد');
final _nameLink = _set('بن ابن بنت');
// First-person narrative verbs: a story, never a narrator's name (SPEC §8.2).
final _narrative = _set(
  'أتيت أتينا أتاني أتانا سألت سألنا سألني دخلت دخلنا خرجت خرجنا رأيت رأينا شهدت جاءنا جاءني قدمت قدمنا صليت صلينا',
);
final _heardHim = _set('سمعته سمعتها سمعه');
// «قراءة عليه وأنا أسمع» (al-Nasa'i) between a narrator and the next link.
final _qira2a = normalize('قراءة عليه وأنا أسمع').split(' ');
final _stop = {
  ..._tv,
  ..._abbr,
  ..._pronTv,
  ..._say,
  ..._hear,
  ..._skip,
  ..._raise,
  ..._qualifier,
  ..._client,
  ..._set(
    'عن أن أنه أنها أنهم أنهما يحدث رضي رسول النبي نبي نبيكم صلى في يا لما إذا إذ كان كانت كانوا كنا كنت لا ما لم لن هل قد ثم إلى قراءة واللفظ',
  ),
};
final _prophet = [
  _set('رسول').single,
  _set('النبي').single,
  _set('نبي').single,
  _set('الله').single,
  _set('نبيكم').single,
];
final _salawat = normalize('صلى الله عليه وسلم').split(' ');
final _peace = normalize('عليه السلام').split(' ');
final _honor = _set('رضي');
final _honorTail = _set('عنه عنها عنهما عنهم');
final _w = (String s) => normalize(s);
final _an = _w('أن'), _anhu = _w('أنه'), _anha = _w('أنها'), _3an = _w('عن');
final _yuhaddith = _w('يحدث'),
    _li = _w('لي'),
    _lana = _w('لنا'),
    _kana = _w('كان');
final _qara2tu = _w('قرأت'), _3ala = _w('على'), _min = _w('من');

const _maxStrongName = 14, _maxWeakName = 6;

class _Parser {
  final String text;
  final List<String> w = []; // normalized words
  final List<int> st = [], en = []; // their spans in [text]
  final List<Narrator> narrators = [];
  int how = 0; // 3 = Prophet formula, 2 = terminal «قال», 1 = end of a name

  _Parser(this.text) {
    final m = normalizeWithMap(text);
    final t = m.text;
    var i = 0;
    while (i < t.length) {
      if (t.codeUnitAt(i) == 0x20) {
        i++;
        continue;
      }
      var j = i;
      while (j < t.length && t.codeUnitAt(j) != 0x20) {
        j++;
      }
      w.add(t.substring(i, j));
      st.add(m.start[i]);
      en.add(m.end[j - 1]);
      i = j;
    }
  }

  int get n => w.length;
  String at(int i) => i < n ? w[i] : '';

  bool isTv(int i, {bool abbr = false}) {
    final x = at(i);
    if (_tv.contains(x) || (abbr && _abbr.contains(x))) return true;
    return x.length > 2 && x.startsWith('و') && _tv.contains(x.substring(1));
  }

  /// End of «رسول الله / النبي / نبي الله ﷺ» starting at [i], or -1.
  int prophet(int i) {
    int j;
    if (at(i) == _prophet[0] && at(i + 1) == _prophet[3]) {
      j = i + 2;
    } else if (at(i) == _prophet[1]) {
      j = i + 1;
    } else if (at(i) == _prophet[2] && at(i + 1) == _prophet[3]) {
      j = i + 2;
    } else if (at(i) == _prophet[4]) {
      j = i + 1;
    } else {
      return -1;
    }
    if (_seq(j, _salawat)) return j + _salawat.length;
    if (_seq(j, _peace)) return j + _peace.length;
    return j;
  }

  bool _seq(int i, List<String> s) {
    for (var k = 0; k < s.length; k++) {
      if (at(i + k) != s[k]) return false;
    }
    return true;
  }

  int honorific(int i) =>
      _honor.contains(at(i)) &&
          at(i + 1) == _prophet[3] &&
          _honorTail.contains(at(i + 2))
      ? i + 3
      : -1;

  /// Consumes a narrator name from [i]; returns its end, or -1.
  int name(int i, String form, int max) {
    var j = i;
    while (j < n && !_stop.contains(w[j]) && !isTv(j)) {
      if (j - i == max) return -1;
      j++;
    }
    if (j == i) return -1;
    narrators.add(Narrator(text.substring(st[i], en[j - 1]), form));
    return j;
  }

  int _try(int Function() f) {
    final keep = narrators.length;
    final r = f();
    if (r < 0) narrators.removeRange(keep, narrators.length);
    return r;
  }

  /// A link at [i]; returns the matn start, or -1 when [i] does not start a link.
  int link(int i, {int max = _maxStrongName}) {
    if (i >= n) return -1;
    final x = w[i];
    if (_skip.contains(x)) return link(i + 1, max: max);
    if (isTv(i) || (x == _qara2tu && at(i + 1) == _3ala)) {
      final from = x == _qara2tu ? i + 2 : i + 1;
      final j = name(from, text.substring(st[i], en[i]), max);
      return j < 0 ? -1 : after(j, strong: true);
    }
    if (x == _3an) {
      final p = prophet(i + 1);
      if (p >= 0) return prophetEnd(p);
      final j = name(i + 1, text.substring(st[i], en[i]), max);
      return j < 0 ? -1 : after(j, strong: true);
    }
    if (_hear.contains(x)) {
      if (_heardHim.contains(x) && _say.contains(at(i + 1))) return _done(i + 2, 2);
      final p = prophet(i + 1);
      if (p >= 0) return prophetEnd(p);
      final from = at(i + 1) == _min ? i + 2 : i + 1;
      final j = name(from, text.substring(st[i], en[i]), max);
      return j < 0 ? -1 : after(j, strong: true);
    }
    if (x == _anhu || x == _anha) {
      if (_say.contains(at(i + 1))) return say(i + 1);
      if (_hear.contains(at(i + 1))) return link(i + 1);
      return -1;
    }
    if (x == _an) {
      final p = prophet(i + 1);
      if (p >= 0) {
        if (_say.contains(at(p))) return _done(p + 1, 3);
        if (at(p) == _kana && _say.contains(at(p + 1))) return _done(p + 2, 3);
        return _done(i, 3);
      }
      return _try(() {
        var j = name(i + 1, text.substring(st[i], en[i]), _maxStrongName);
        if (j < 0) return -1;
        final (k, honored) = tail(j);
        if (honored) return after(k, strong: true);
        if (_pronTv.contains(at(k))) return link(k);
        // «أن أبا هريرة قال قال رسول الله ﷺ»: accepted only when it reaches the Prophet.
        if (_say.contains(at(k))) {
          final r = say(k);
          return how == 3 ? r : -1;
        }
        return -1;
      });
    }
    if (_pronTv.contains(x)) {
      if (i + 1 < n && _isLinkWord(i + 1)) return after(i + 1, strong: true);
      final r = _try(() {
        final j = name(i + 1, text.substring(st[i], en[i]), _maxWeakName);
        return j < 0 ? -1 : after(j, strong: true);
      });
      return r >= 0 ? r : _done(i + 1, 1);
    }
    if (_say.contains(x)) return say(i);
    if (_raise.contains(x))
      return _done(_say.contains(at(i + 1)) ? i + 2 : i + 1, 3);
    if (x == _yuhaddith) {
      if (_isLinkWord(i + 1)) return link(i + 1);
      final j = name(i + 1, text.substring(st[i], en[i]), _maxWeakName);
      return j < 0 ? -1 : after(j, strong: true);
    }
    return -1;
  }

  bool _isLinkWord(int i) {
    final x = at(i);
    return isTv(i) ||
        x == _3an ||
        x == _an ||
        x == _anhu ||
        x == _anha ||
        _say.contains(x) ||
        _hear.contains(x) ||
        _skip.contains(x) ||
        _raise.contains(x) ||
        x == _yuhaddith;
  }

  int _done(int b, int kind) {
    how = kind;
    return b;
  }

  /// After «عن النبي ﷺ»: an optional «أنه» and a speech verb belong to the isnad.
  int prophetEnd(int p) {
    var j = p;
    if (at(j) == _anhu) j++;
    if (_say.contains(at(j))) return _done(j + 1, 3);
    // Another chain follows: «… عن النبي ﷺ ح و حدثنا …».
    if (at(p) == _ha && p + 1 < n) {
      final r = _try(() => link(p));
      if (r >= 0) return r;
    }
    return _done(p, 3);
  }

  /// A speech verb at [i]: returns the matn start if the chain continues
  /// through it, or -1 when it is terminal (the matn starts after it).
  int sayCont(int i) {
    final j = i + 1;
    final x = at(j);
    if (_say.contains(x)) {
      final r = _try(() => sayCont(j));
      if (r >= 0) return r;
      // «قال قال أنس ║ …»: a short name, then the matn.
      final k = at(j + 1) == _li || at(j + 1) == _lana ? j + 1 : shortName(j + 1);
      if (k > j + 1) {
        narrators.add(Narrator(text.substring(st[j + 1], en[k - 1]), text.substring(st[j], en[j])));
        return _done(k, 2);
      }
      return _done(j, 2);
    }
    if (_pronTv.contains(x) || (x == _qara2tu && at(j + 1) == _3ala)) {
      final r = _try(() => link(j));
      if (r >= 0) return r;
    }
    if (x == _li || x == _lana) {
      final p = prophet(j + 1);
      if (p >= 0) return _done(p, 3);
      return _try(() => _weak(j + 1, i));
    }
    final p = prophet(j);
    if (p >= 0) return _done(p, 3);
    if (_isLinkWord(j) && x != _an) {
      final r = _try(() => link(j));
      if (r >= 0) return r;
    }
    return _try(() => _weak(j, i));
  }

  /// End of a short name at [i] («أنس», «ابن عباس», «عبد الله بن عمرو»), or [i].
  int shortName(int i) {
    var j = i;
    int unit(int k) {
      if (k >= n || _stop.contains(w[k]) || isTv(k)) return -1;
      if (_nameHead.contains(w[k])) {
        return k + 1 < n && !_stop.contains(w[k + 1]) && !isTv(k + 1) ? k + 2 : -1;
      }
      return k + 1;
    }
    final u = unit(j);
    if (u < 0) return i;
    j = u;
    while (_nameLink.contains(at(j))) {
      final v = unit(j + 1);
      if (v < 0) break;
      j = v;
    }
    return j;
  }

  int _weak(int i, int formAt) {
    if (_narrative.contains(at(i))) return -1;
    final j = name(i, text.substring(st[formAt], en[formAt]), _maxWeakName);
    if (j < 0) return -1;
    return after(j, strong: false);
  }

  int say(int i) {
    final r = sayCont(i);
    return r >= 0 ? r : _done(i + 1, 2);
  }

  /// Continues after a narrator name ending at [j].
  int after(int j, {required bool strong}) {
    final (k, honored) = tail(j);
    j = k;
    if (j >= n) return -1;
    if (_say.contains(at(j))) {
      final r = sayCont(j);
      return r >= 0 ? r : _done(j + 1, 2);
    }
    if (isTv(j, abbr: true) || _isLinkWord(j)) {
      final r = _try(
        () => link(j, max: strong ? _maxStrongName : _maxWeakName),
      );
      if (r >= 0) return r;
      // A transmission word cannot start the matn: the chain is broken.
      if (isTv(j, abbr: true)) return -1;
    }
    return strong || honored ? _done(j, 1) : -1;
  }

  /// Skips what may follow a narrator's name: honorifics, «يعني …», «مولى …»,
  /// «زوج النبي ﷺ», «قراءة عليه وأنا أسمع». Returns the end and whether an honorific was seen.
  (int, bool) tail(int j) {
    var honored = false;
    for (;;) {
      final h = honorific(j);
      if (h >= 0) {
        j = h;
        honored = true;
        continue;
      }
      if (_qualifier.contains(at(j))) {
        final k = _try(() => name(j + 1, '', _maxStrongName));
        if (k >= 0) {
          narrators.removeLast(); // a qualifier, not another narrator
          j = k;
          continue;
        }
      }
      if (_client.contains(at(j))) {
        final p = prophet(j + 1);
        if (p >= 0) {
          j = p;
          continue;
        }
        // «أبي مرة مولى عقيل بن أبي طالب»: the patron's name qualifies the narrator.
        if (at(j) == _mawla) {
          final k = _try(() => name(j + 1, '', _maxWeakName));
          if (k >= 0) {
            narrators.removeLast();
            j = k;
            continue;
          }
        }
      }
      // «واللفظ له» / «واللفظ لسعيد» / «واللفظ لابن المثنى»: whose wording is given.
      if (at(j) == _wording && j + 2 < n) {
        final x = at(j + 1);
        final head = x.length > 1 && _nameHead.contains(x.substring(1));
        j += head && j + 3 < n ? 3 : 2;
        continue;
      }
      if (_seq(j, _qira2a)) {
        j += _qira2a.length;
        continue;
      }
      break;
    }
    return (j, honored);
  }
}

/// Splits a hadith into isnad and matn (SPEC §8). Experimental: API may change before 2.0.
IsnadSplit splitIsnad(String text) {
  final p = _Parser(text);
  if (p.n == 0 || !p._isLinkWord(0)) return IsnadSplit('', text, 0, const []);
  final b = p.link(0);
  if (b <= 0 || b >= p.n || p.narrators.isEmpty)
    return IsnadSplit('', text, 0, const []);
  final off = p.st[b];
  // Heuristic confidence in tenths (SPEC §8.4).
  final tenths =
      switch (p.how) {
        3 => 9,
        2 => 8,
        _ => 6,
      } -
      (p.narrators.length >= 2 ? 0 : 2);
  final conf = tenths / 10;
  return IsnadSplit(
    text.substring(0, off).trimRight(),
    text.substring(off),
    conf,
    List.unmodifiable(p.narrators),
  );
}
