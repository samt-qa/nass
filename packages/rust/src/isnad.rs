//! Experimental isnad/matn split (SPEC §8). **The API may change before 2.0.**
//!
//! A small recursive-descent parser over search-normalized words: the isnad is a chain of
//! links (a transmission word followed by a narrator), and the matn starts where no link can
//! continue. Mirrors `packages/js/src/isnad.ts`.
use crate::normalizer::{normalize, normalize_with_map, Options};
use std::collections::HashSet;
use std::sync::OnceLock;

/// A narrator found in the isnad.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Narrator {
    /// The narrator's name as written in the input.
    pub name: String,
    /// The transmission word that introduced the narrator, as written.
    pub form: String,
}

/// The result of [`split_isnad`].
#[derive(Debug, Clone, PartialEq)]
pub struct IsnadResult {
    /// The original text before the matn, without trailing whitespace. Empty if no split.
    pub isnad: String,
    /// The original text from the start of the matn to the end.
    pub matn: String,
    /// Heuristic confidence in tenths (SPEC §8.4); 0 if no split. Not a calibrated probability.
    pub confidence: f64,
    /// Narrators in order (non-normative, SPEC §8.3).
    pub narrators: Vec<Narrator>,
}

struct Lex {
    tv: HashSet<String>,
    abbr: HashSet<String>,
    pron_tv: HashSet<String>,
    say: HashSet<String>,
    hear: HashSet<String>,
    skip: HashSet<String>,
    raise: HashSet<String>,
    qualifier: HashSet<String>,
    client: HashSet<String>,
    name_head: HashSet<String>,
    name_link: HashSet<String>,
    narrative: HashSet<String>,
    heard_him: HashSet<String>,
    stop: HashSet<String>,
    honor_tail: HashSet<String>,
    anonymous: HashSet<String>,
    qira2a: Vec<String>,
    salawat: Vec<String>,
    peace: Vec<String>,
    dhakara: Vec<String>,
    mawla: String,
    ha: String,
    wording: String,
    rasul: String,
    nabi_al: String,
    nabi: String,
    allah: String,
    nabikum: String,
    radi: String,
    an: String,
    anhu: String,
    anha: String,
    aan: String,
    yuhaddith: String,
    li: String,
    lana: String,
    kana: String,
    qara2tu: String,
    ala: String,
    min: String,
    hatha: String,
    ma: String,
    waqala: String,
}

fn n(s: &str) -> String {
    normalize(s, &Options::default())
}
fn set(words: &str) -> HashSet<String> {
    words.split(' ').map(n).collect()
}
fn seq(s: &str) -> Vec<String> {
    n(s).split(' ').map(str::to_string).collect()
}

fn lex() -> &'static Lex {
    static L: OnceLock<Lex> = OnceLock::new();
    L.get_or_init(|| {
        // Lexicon (SPEC §8.2), normalized at the search level.
        let tv = set("حدثنا حدثني أخبرنا أخبرني أنبأنا أنبأني حدثناه أخبرناه حدثنيه أخبرنيه أخبرناه");
        let abbr = set("ثنا نا أنا أنبا");
        let pron_tv = set("حدثه حدثته حدثها حدثهم حدثهما أخبره أخبرته أخبرها أخبرهم أخبرهما حدث أخبر");
        let say = set("قال قالت قالا قالوا يقول تقول يقولا يقولان");
        let hear = set("سمعت سمع سمعه سمعنا سمعته سمعتها");
        let skip = set("و ح أحسبه");
        let raise = set("يرويه يرفعه رفعه");
        let qualifier = set("يعني تعني وهو هو واسمه");
        let client = set("زوج مولى صاحب");
        // First-person narrative verbs: a story, never a narrator's name (SPEC §8.2).
        let narrative = set(
            "أتيت أتينا أتاني أتانا لقيت سألت سألنا سألني دخلت دخلنا خرجت خرجنا رأيت رأينا شهدت جاءنا جاءني قدمت قدمنا صليت صلينا",
        );
        let mut stop = HashSet::new();
        for s in [&tv, &abbr, &pron_tv, &say, &hear, &skip, &raise, &qualifier, &client, &narrative] {
            stop.extend(s.iter().cloned());
        }
        stop.extend(set(
            "عن أن أنه أنها أنهم أنهما يحدث رضي رسول النبي نبي نبيكم صلى في يا لما إذا إذ كان كانت كانوا كنا كنت لا ما لم لن هل قد ثم إلى قراءة واللفظ",
        ));
        Lex {
            tv,
            abbr,
            pron_tv,
            say,
            hear,
            skip,
            raise,
            qualifier,
            client,
            // Names that may follow «قال قال» (SPEC §8.3): a kunya/patronymic head takes the next word.
            name_head: set("أبو أبي أبا أم ابن بنت عبد"),
            name_link: set("بن ابن بنت"),
            narrative,
            heard_him: set("سمعته سمعتها سمعه"),
            stop,
            honor_tail: set("عنه عنها عنهما عنهم"),
            // Anonymous people: never a narrator's name after «قال قال» (SPEC §8.3).
            anonymous: set("رجل رجلا امرأة أعرابي ناس قوم"),
            // «قراءة عليه وأنا أسمع» (al-Nasa'i) between a narrator and the next link.
            qira2a: seq("قراءة عليه وأنا أسمع"),
            salawat: seq("صلى الله عليه وسلم"),
            peace: seq("عليه السلام"),
            // Hammam's sahifa: «هذا ما حدثنا أبو هريرة عن رسول الله ﷺ فذكر أحاديث منها وقال رسول الله ﷺ».
            dhakara: seq("فذكر أحاديث منها"),
            mawla: n("مولى"),
            ha: n("ح"),
            wording: n("واللفظ"),
            rasul: n("رسول"),
            nabi_al: n("النبي"),
            nabi: n("نبي"),
            allah: n("الله"),
            nabikum: n("نبيكم"),
            radi: n("رضي"),
            an: n("أن"),
            anhu: n("أنه"),
            anha: n("أنها"),
            aan: n("عن"),
            yuhaddith: n("يحدث"),
            li: n("لي"),
            lana: n("لنا"),
            kana: n("كان"),
            qara2tu: n("قرأت"),
            ala: n("على"),
            min: n("من"),
            hatha: n("هذا"),
            ma: n("ما"),
            waqala: n("وقال"),
        }
    })
}

const MAX_STRONG: i64 = 14;
const MAX_WEAK: i64 = 6;

struct Parser<'a> {
    text: &'a str,
    l: &'static Lex,
    w: Vec<String>,
    st: Vec<usize>,
    en: Vec<usize>,
    narrators: Vec<Narrator>,
    how: u8, // 3 = Prophet formula, 2 = terminal «قال», 1 = end of a name
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Self {
        let m = normalize_with_map(text, &Options::default());
        let b = m.text.as_bytes();
        let (mut w, mut st, mut en) = (Vec::new(), Vec::new(), Vec::new());
        let mut i = 0;
        while i < b.len() {
            if b[i] == b' ' {
                i += 1;
                continue;
            }
            let mut j = i;
            while j < b.len() && b[j] != b' ' {
                j += 1;
            }
            w.push(m.text[i..j].to_string());
            st.push(m.start[i]);
            en.push(m.end[j - 1]);
            i = j;
        }
        Parser {
            text,
            l: lex(),
            w,
            st,
            en,
            narrators: Vec::new(),
            how: 0,
        }
    }

    fn n(&self) -> i64 {
        self.w.len() as i64
    }
    fn at(&self, i: i64) -> &str {
        if i >= 0 && i < self.n() {
            &self.w[i as usize]
        } else {
            ""
        }
    }
    fn src(&self, i: i64) -> String {
        self.text[self.st[i as usize]..self.en[i as usize]].to_string()
    }
    fn span(&self, i: i64, j: i64) -> String {
        self.text[self.st[i as usize]..self.en[j as usize]].to_string()
    }

    fn is_tv(&self, i: i64, abbr: bool) -> bool {
        let x = self.at(i);
        let l = self.l;
        if l.tv.contains(x) || (abbr && l.abbr.contains(x)) {
            return true;
        }
        x.chars().count() > 2 && x.starts_with('و') && l.tv.contains(&x['و'.len_utf8()..])
    }

    fn prophet(&self, i: i64) -> i64 {
        let l = self.l;
        let j = if self.at(i) == l.rasul && self.at(i + 1) == l.allah {
            i + 2
        } else if self.at(i) == l.nabi_al {
            i + 1
        } else if self.at(i) == l.nabi && self.at(i + 1) == l.allah {
            i + 2
        } else if self.at(i) == l.nabikum {
            i + 1
        } else {
            return -1;
        };
        if self.seq(j, &l.salawat) {
            return j + l.salawat.len() as i64;
        }
        if self.seq(j, &l.peace) {
            return j + l.peace.len() as i64;
        }
        j
    }

    fn seq(&self, i: i64, s: &[String]) -> bool {
        s.iter()
            .enumerate()
            .all(|(k, x)| self.at(i + k as i64) == x)
    }

    fn honorific(&self, i: i64) -> i64 {
        let l = self.l;
        if self.at(i) == l.radi
            && self.at(i + 1) == l.allah
            && l.honor_tail.contains(self.at(i + 2))
        {
            i + 3
        } else {
            -1
        }
    }

    fn name(&mut self, i: i64, form: String, max: i64) -> i64 {
        let l = self.l;
        let mut j = i;
        // «عن مولى لأبي سعيد»: an unnamed client is still a narrator.
        while j < self.n()
            && (!l.stop.contains(self.at(j)) || (j == i && self.at(j) == l.mawla))
            && !self.is_tv(j, false)
        {
            if j - i == max {
                return -1;
            }
            j += 1;
        }
        if j == i {
            return -1;
        }
        let name = self.span(i, j - 1);
        self.narrators.push(Narrator { name, form });
        j
    }

    fn attempt(&mut self, f: impl FnOnce(&mut Self) -> i64) -> i64 {
        let keep = self.narrators.len();
        let r = f(self);
        if r < 0 {
            self.narrators.truncate(keep);
        }
        r
    }

    fn done(&mut self, b: i64, kind: u8) -> i64 {
        self.how = kind;
        b
    }

    fn is_link_word(&self, i: i64) -> bool {
        let l = self.l;
        let x = self.at(i);
        self.is_tv(i, false)
            || x == l.aan
            || x == l.an
            || x == l.anhu
            || x == l.anha
            || l.say.contains(x)
            || l.hear.contains(x)
            || l.skip.contains(x)
            || l.raise.contains(x)
            || x == l.yuhaddith
    }

    fn link(&mut self, i: i64, max: i64) -> i64 {
        if i >= self.n() {
            return -1;
        }
        let l = self.l;
        let x = self.at(i).to_string();
        if l.skip.contains(&x) {
            return self.link(i + 1, max);
        }
        if self.is_tv(i, false) || (x == l.qara2tu && self.at(i + 1) == l.ala) {
            let from = if x == l.qara2tu { i + 2 } else { i + 1 };
            // «قال واقد بن عبد الله أخبرني عن أبيه»: the name came first.
            if self.at(from) == l.aan {
                return self.link(from, max);
            }
            let j = self.name(from, self.src(i), max);
            return if j < 0 { -1 } else { self.after(j, true) };
        }
        if x == l.aan {
            let p = self.prophet(i + 1);
            if p >= 0 {
                return self.prophet_end(p);
            }
            let j = self.name(i + 1, self.src(i), max);
            return if j < 0 { -1 } else { self.after(j, true) };
        }
        if l.hear.contains(&x) {
            if l.heard_him.contains(&x) && l.say.contains(self.at(i + 1)) {
                return self.done(i + 2, 2);
            }
            let p = self.prophet(i + 1);
            if p >= 0 {
                return self.prophet_end(p);
            }
            let from = if self.at(i + 1) == l.min {
                i + 2
            } else {
                i + 1
            };
            let j = self.name(from, self.src(i), max);
            return if j < 0 { -1 } else { self.after(j, true) };
        }
        if x == l.anhu || x == l.anha {
            if l.say.contains(self.at(i + 1)) {
                return self.say(i + 1);
            }
            if l.hear.contains(self.at(i + 1)) || l.pron_tv.contains(self.at(i + 1)) {
                return self.link(i + 1, MAX_STRONG);
            }
            return -1;
        }
        if x == l.an {
            let p = self.prophet(i + 1);
            if p >= 0 {
                if l.say.contains(self.at(p)) {
                    return self.prophet_say(p + 1);
                }
                if self.at(p) == l.kana && l.say.contains(self.at(p + 1)) {
                    return self.done(p + 2, 3);
                }
                return self.done(i, 3);
            }
            return self.attempt(|s| {
                let form = s.src(i);
                let j = s.name(i + 1, form, MAX_STRONG);
                if j < 0 {
                    return -1;
                }
                let (k, honored) = s.tail(j);
                if honored {
                    // «أن عليا رضي الله عنه حرق قوما»: a story about him, not a link.
                    let r = s.after(k, true);
                    return if r == k && s.how == 1 { -1 } else { r };
                }
                if l.pron_tv.contains(s.at(k)) {
                    return s.link(k, MAX_STRONG);
                }
                // «أن أبا هريرة كان يحدث أن …»
                if s.at(k) == l.kana && s.at(k + 1) == l.yuhaddith {
                    return s.link(k + 1, MAX_STRONG);
                }
                if l.say.contains(s.at(k)) {
                    let r = s.say(k);
                    // «أن عائشة زوج النبي ﷺ قالت»: a qualified narrator speaks.
                    if k > j {
                        return r;
                    }
                    // «أن أبا هريرة قال قال رسول الله ﷺ»: accepted only when it reaches the Prophet.
                    return if s.how == 3 { r } else { -1 };
                }
                -1
            });
        }
        if l.pron_tv.contains(&x) {
            if i + 1 < self.n() && self.is_link_word(i + 1) {
                return self.after(i + 1, true);
            }
            let r = self.attempt(|s| {
                let form = s.src(i);
                let j = s.name(i + 1, form, MAX_WEAK);
                if j < 0 {
                    -1
                } else {
                    s.after(j, true)
                }
            });
            return if r >= 0 { r } else { self.done(i + 1, 1) };
        }
        if l.say.contains(&x) {
            return self.say(i);
        }
        if l.raise.contains(&x) {
            let b = if l.say.contains(self.at(i + 1)) {
                i + 2
            } else {
                i + 1
            };
            return self.done(b, 3);
        }
        if x == l.yuhaddith {
            if self.is_link_word(i + 1) {
                return self.link(i + 1, MAX_STRONG);
            }
            let j = self.name(i + 1, self.src(i), MAX_WEAK);
            return if j < 0 { -1 } else { self.after(j, true) };
        }
        -1
    }

    fn prophet_end(&mut self, p: i64) -> i64 {
        let l = self.l;
        let mut j = p;
        if self.at(j) == l.anhu {
            j += 1;
        }
        if l.say.contains(self.at(j)) {
            return self.prophet_say(j + 1);
        }
        if self.seq(p, &l.dhakara) && self.at(p + 3) == l.waqala {
            let q = self.prophet(p + 4);
            if q >= 0 {
                return self.done(q, 3);
            }
        }
        // Another chain follows: «… عن النبي ﷺ ح و حدثنا …».
        if self.at(p) == l.ha && p + 1 < self.n() {
            let r = self.attempt(|s| s.link(p, MAX_STRONG));
            if r >= 0 {
                return r;
            }
        }
        self.done(p, 3)
    }

    /// After «… رسول الله ﷺ قال»: the matn, unless another chain follows («ح و حدثنا …»).
    fn prophet_say(&mut self, b: i64) -> i64 {
        if self.at(b) == self.l.ha && b + 1 < self.n() {
            let r = self.attempt(|s| s.link(b, MAX_STRONG));
            if r >= 0 {
                return r;
            }
        }
        self.done(b, 3)
    }

    fn say_cont(&mut self, i: i64) -> i64 {
        let l = self.l;
        let j = i + 1;
        let x = self.at(j).to_string();
        if l.say.contains(&x) {
            let r = self.attempt(|s| s.say_cont(j));
            if r >= 0 {
                return r;
            }
            // «قال قال أنس ║ …»: a short name, then the matn.
            let k = if self.at(j + 1) == l.li || self.at(j + 1) == l.lana {
                j + 1
            } else {
                self.short_name(j + 1)
            };
            if k > j + 1 {
                let name = self.span(j + 1, k - 1);
                let form = self.src(j);
                self.narrators.push(Narrator { name, form });
                return self.done(k, 2);
            }
            return self.done(j, 2);
        }
        if l.pron_tv.contains(&x) || (x == l.qara2tu && self.at(j + 1) == l.ala) {
            let r = self.attempt(|s| s.link(j, MAX_STRONG));
            if r >= 0 {
                return r;
            }
        }
        if x == l.hatha && self.at(j + 1) == l.ma && self.is_tv(j + 2, false) {
            let r = self.attempt(|s| s.link(j + 2, MAX_STRONG));
            if r >= 0 {
                return r;
            }
        }
        // «قال قال يعني رسول الله ﷺ»
        if l.qualifier.contains(&x) {
            let p = self.prophet(j + 1);
            if p >= 0 {
                return self.done(p, 3);
            }
        }
        if x == l.li || x == l.lana {
            let p = self.prophet(j + 1);
            if p >= 0 {
                return self.done(p, 3);
            }
            return self.attempt(|s| s.weak(j + 1, i));
        }
        let p = self.prophet(j);
        if p >= 0 {
            return self.done(p, 3);
        }
        if self.is_link_word(j) && x != l.an {
            let r = self.attempt(|s| s.link(j, MAX_STRONG));
            if r >= 0 {
                return r;
            }
        }
        self.attempt(|s| s.weak(j, i))
    }

    /// End of a short name at `i` («أنس», «ابن عباس», «عبد الله بن عمرو»), or `i`.
    fn short_name(&self, i: i64) -> i64 {
        let l = self.l;
        let unit = |k: i64| -> i64 {
            if k >= self.n()
                || l.stop.contains(self.at(k))
                || l.anonymous.contains(self.at(k))
                || self.is_tv(k, false)
            {
                return -1;
            }
            if l.name_head.contains(self.at(k)) {
                return if k + 1 < self.n()
                    && !l.stop.contains(self.at(k + 1))
                    && !self.is_tv(k + 1, false)
                {
                    k + 2
                } else {
                    -1
                };
            }
            k + 1
        };
        let u = unit(i);
        if u < 0 {
            return i;
        }
        let mut j = u;
        while l.name_link.contains(self.at(j)) {
            let v = unit(j + 1);
            if v < 0 {
                break;
            }
            j = v;
        }
        j
    }

    fn weak(&mut self, i: i64, form_at: i64) -> i64 {
        if self.l.narrative.contains(self.at(i)) {
            return -1;
        }
        let j = self.name(i, self.src(form_at), MAX_WEAK);
        if j < 0 {
            -1
        } else {
            self.after(j, false)
        }
    }

    fn say(&mut self, i: i64) -> i64 {
        let r = self.say_cont(i);
        if r >= 0 {
            r
        } else {
            self.done(i + 1, 2)
        }
    }

    fn after(&mut self, j0: i64, strong: bool) -> i64 {
        let (j, honored) = self.tail(j0);
        if j >= self.n() {
            return -1;
        }
        if self.l.say.contains(self.at(j)) {
            let r = self.say_cont(j);
            return if r >= 0 { r } else { self.done(j + 1, 2) };
        }
        if self.is_tv(j, true) || self.is_link_word(j) {
            let max = if strong { MAX_STRONG } else { MAX_WEAK };
            let r = self.attempt(|s| s.link(j, max));
            if r >= 0 {
                return r;
            }
            if self.is_tv(j, true) {
                return -1;
            }
        }
        if strong || honored {
            self.done(j, 1)
        } else {
            -1
        }
    }

    /// Skips what may follow a narrator's name: honorifics, «يعني …», «مولى …»,
    /// «زوج النبي ﷺ», «قراءة عليه وأنا أسمع». Returns the end and whether an honorific was seen.
    fn tail(&mut self, j0: i64) -> (i64, bool) {
        let l = self.l;
        let mut j = j0;
        let mut honored = false;
        // «فاطمة بنت رسول الله ﷺ»: the Prophet's kin.
        if j > 0 && l.name_link.contains(self.at(j - 1)) {
            let p = self.prophet(j);
            if p >= 0 {
                j = p;
            }
        }
        loop {
            let h = self.honorific(j);
            if h >= 0 {
                j = h;
                honored = true;
                continue;
            }
            if l.qualifier.contains(self.at(j)) {
                let k = self.attempt(|s| s.name(j + 1, String::new(), MAX_STRONG));
                if k >= 0 {
                    self.narrators.pop(); // a qualifier, not another narrator
                    j = k;
                    continue;
                }
            }
            if l.client.contains(self.at(j)) {
                let p = self.prophet(j + 1);
                if p >= 0 {
                    j = p;
                    continue;
                }
                // «أبي مرة مولى عقيل بن أبي طالب»: the patron's name qualifies the narrator.
                if self.at(j) == l.mawla {
                    let k = self.attempt(|s| s.name(j + 1, String::new(), MAX_WEAK));
                    if k >= 0 {
                        self.narrators.pop();
                        j = k;
                        continue;
                    }
                }
            }
            // «واللفظ له» / «واللفظ لسعيد» / «واللفظ لابن المثنى»: whose wording is given.
            if self.at(j) == l.wording && j + 2 < self.n() {
                let x = self.at(j + 1);
                let mut cs = x.chars();
                let head = x.chars().count() > 1 && {
                    cs.next();
                    l.name_head.contains(cs.as_str())
                };
                j += if head && j + 3 < self.n() { 3 } else { 2 };
                continue;
            }
            if self.seq(j, &l.qira2a) {
                j += l.qira2a.len() as i64;
                continue;
            }
            break;
        }
        (j, honored)
    }
}

/// JavaScript's `String.prototype.trimEnd`, which the reference packages follow.
fn trim_end_js(s: &str) -> &str {
    s.trim_end_matches(|c: char| {
        matches!(
            c,
            '\u{9}'..='\u{D}'
                | ' '
                | '\u{A0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
        )
    })
}

/// Splits a hadith into isnad and matn (SPEC §8). **Experimental**: may change before 2.0.
///
/// ```
/// use nass::isnad::split_isnad;
/// let r = split_isnad("حدثنا مالك عن نافع عن ابن عمر أن رسول الله صلى الله عليه وسلم قال الخيل معقود في نواصيها الخير");
/// assert!(r.matn.starts_with("الخيل"));
/// ```
pub fn split_isnad(text: &str) -> IsnadResult {
    let none = || IsnadResult {
        isnad: String::new(),
        matn: text.to_string(),
        confidence: 0.0,
        narrators: Vec::new(),
    };
    let mut p = Parser::new(text);
    if p.n() == 0 || !p.is_link_word(0) {
        return none();
    }
    let b = p.link(0, MAX_STRONG);
    if b <= 0 || b >= p.n() || p.narrators.is_empty() {
        return none();
    }
    let off = p.st[b as usize];
    let base: i32 = match p.how {
        3 => 9,
        2 => 8,
        _ => 6,
    };
    let tenths = base - if p.narrators.len() >= 2 { 0 } else { 2 };
    IsnadResult {
        isnad: trim_end_js(&text[..off]).to_string(),
        matn: text[off..].to_string(),
        confidence: f64::from(tenths) / 10.0,
        narrators: p.narrators,
    }
}
