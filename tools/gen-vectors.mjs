#!/usr/bin/env node
// Grows spec/vectors to the PRD §7 minimums. Hand-written cases (ids not
// starting with "gen-") are kept untouched; generated ones are rebuilt.
//
// Expected values:
//   normalize, names  -> independent oracle (tools/oracle.mjs), and the Dart
//                        reference must agree, or the script fails
//   offsets, search   -> Dart reference, then validated against the oracle by
//                        tools/check-vectors.mjs (span-by-span properties)
// Corpus: Open-Hadith-Data (ODbL / DbCL). Each case cites book and number.
// Usage: node tools/gen-vectors.mjs   (needs tools/corpus, see docs/corpus.md)

import { dart, readHadith, BOOKS, VOCALIZED, DATASET, rng, readVectors, writeVectors } from "./lib.mjs";
import { normalize as oNorm, nameKey as oKey } from "./oracle.mjs";

const r = rng(20261114);
const pick = (arr) => arr[Math.floor(r() * arr.length)];
const keepHand = (doc) => doc.cases.filter((c) => !c.id.startsWith("gen-"));
const pad = (n) => String(n).padStart(3, "0");
const src = (work, n) => ({ work, ref: String(n), dataset: DATASET, verified: true });

/** A window of `len` words from a hadith, keeping the original spacing. */
function fragment(text, len) {
  const words = text.split(/(\s+)/); // keep separators
  const wordIdx = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0);
  if (wordIdx.length <= len) return text.trim();
  const s = Math.floor(r() * (wordIdx.length - len));
  return words.slice(wordIdx[s], wordIdx[s + len - 1] + 1).join("");
}

const vocal = readHadith(VOCALIZED.file);
const plain = Object.fromEntries(BOOKS.map((b) => [b.work, readHadith(b.file)]));

// ------------------------------------------------------------------ normalize
// Curated rule cases. The oracle must agree with every expected value.
const curated = [
  ["clean", {}, "ﺑِﺴْﻢِ", "بِسْمِ", "C4 صيغ عرض مع حركات"],
  ["clean", {}, "ﹰ", "ً", "C4 حركة منفردة بصيغة عرض تفقد المسافة"],
  ["clean", {}, "ﻷ", "لأ", "C4 لام ألف بهمزة"],
  ["clean", {}, "ﻵ", "لآ", "C4 لام ألف بمدة"],
  ["clean", {}, "ﷺ", "ﷺ", "C4 رمز الصلاة يبقى في clean"],
  ["clean", {}, "آ", "آ", "C1 ألف + مدة ← آ"],
  ["clean", {}, "ئ", "ئ", "C1 ياء + همزة ← ئ"],
  ["clean", {}, "ؤ", "ؤ", "C1 واو + همزة ← ؤ"],
  ["clean", {}, "إ", "إ", "C1 ألف + همزة تحتية ← إ"],
  ["clean", {}, "بَّ", "بَّ", "C1 الشدة بعد الفتحة بعد الترتيب القانوني"],
  ["clean", {}, "بِْ", "بِْ", "C1 ترتيب الكسرة والسكون"],
  ["clean", {}, "ا‏ٔ", "أ", "C1 يُطبَّق بعد حذف المحارف الخفية"],
  ["clean", {}, "ـ‍A", "A", "C2 ZWJ بجوار تطويل (عربي) يُحذف"],
  ["clean", {}, "A‍B", "A‍B", "C2 ZWJ بين لاتينيين يبقى"],
  ["clean", {}, "‫نص‬", "نص", "C2 تضمين الاتجاه"],
  ["clean", {}, "⁧نص⁩", "نص", "C2 عزل الاتجاه"],
  ["clean", {}, "قال  نعم", "قال نعم", "C5 مسافات عريضة"],
  ["clean", {}, "قال\t\r\nنعم", "قال نعم", "C5 جدولة وسطر"],
  ["search", {}, "ﷻ", "جل جلاله", "S1 جل جلاله"],
  ["search", {}, "﵁", "رضي الله عنه", "S1 رمز الترضي"],
  ["search", { honorifics: "strip" }, "عن أنس ﵁ قال", "عن انس قال", "S1 حذف رمز الترضي"],
  ["search", {}, "مُوسَىٰ", "موسي", "S2+S3 ألف خنجرية فوق الألف المقصورة"],
  ["search", {}, "الصَّلَوٰةَ", "الصلوة", "S2 الألف الخنجرية في الرسم العثماني تُحذف"],
  ["search", {}, "ﺁﻣﻦ", "امن", "C4+S3 مدة في صيغة عرض"],
  ["search", {}, "ٲ ٳ ٵ", "ا ا ا", "S3 صيغ الألف النادرة"],
  ["search", {}, "ڪتاب", "كتاب", "S3 الكاف السندية"],
  ["search", {}, "ۀ", "ه", "S3 الهاء مع ياء فوقها"],
  ["search", {}, "ے", "ي", "S3 الياء البرّاني"],
  ["search", {}, "٢٠٢٦", "2026", "S4 سنة بأرقام هندية"],
  ["search", {}, "۱۴۴۸", "1448", "S4 سنة بأرقام فارسية"],
  ["search", {}, "٥٠٪", "50%", "S4 علامة النسبة"],
  ["search", {}, "50%", "50%", "S5 علامة % لا تُعد ترقيمًا"],
  ["search", {}, "رقم 3. ثم", "رقم 3 ثم", "S4 نقطة ليست بين رقمين"],
  ["search", {}, "1،2", "1 2", "S5 الفاصلة العربية بين رقمين فاصل"],
  ["search", {}, "(حديث)", "حديث", "S5 أقواس"],
  ["search", {}, "قال: \"نعم\"", "قال نعم", "S5 علامات تنصيص لاتينية"],
  ["search", {}, "۞ تبارك", "تبارك", "S5 علامة الحزب"],
  ["search", { honorifics: "strip" }, "رحمه الله تعالى", "", "S7 رحمه الله ثم تعالى بعد لفظ الجلالة الأصلي"],
  ["search", { honorifics: "strip" }, "عن علي عليه السلام قال", "عن علي قال", "S7 عليه السلام"],
  ["search", { honorifics: "strip" }, "الله سبحانه وتعالى", "الله", "S7 الأطول أولًا"],
  ["search", { honorifics: "strip" }, "قال جعفر الصادق قدس سره", "قال جعفر الصادق", "S7 قدس سره"],
  ["search", { honorifics: "strip" }, "والله عز وجل يقول", "والله عز وجل يقول", "S7 «والله» ليست «الله»"],
  ["loose", {}, "رءوف", "روف", "L1 همزة على السطر وسط الكلمة"],
  ["loose", {}, "مسؤول", "مسوول", "L1 همزة على الواو"],
  ["loose", { honorifics: "strip" }, "الله ء تعالى", "الله", "L1 قبل S7 فلا تمنع الهمزة المنفردة الحذف"],
];

function normalizeCases() {
  const hand = keepHand(readVectors("normalize"));
  const cases = [...hand];
  curated.forEach(([level, options, input, expected, note], i) => {
    const got = oNorm(input, level, options.honorifics ?? "keep");
    if (got !== expected) throw new Error(`curated ${i} oracle disagrees: ${JSON.stringify(got)} vs ${JSON.stringify(expected)} (${note})`);
    cases.push({ id: `gen-norm-rule-${pad(i + 1)}`, rule: note.split(" ")[0], input, level, options, expected, note, synthetic: true, review: "approved" });
  });
  // Corpus: vocalized Bukhari fragments at every level, and plain text from the six books.
  const levels = [["search", "keep"], ["search", "strip"], ["loose", "keep"], ["clean", "keep"], ["loose", "strip"]];
  let k = 0;
  while (cases.length < 230) {
    const row = vocal[Math.floor(r() * vocal.length)];
    const [level, h] = levels[k++ % levels.length];
    const input = fragment(row.text, 4 + Math.floor(r() * 10));
    cases.push({ id: `gen-norm-corpus-${pad(cases.length)}`, input, level, options: h === "keep" ? {} : { honorifics: h },
      expected: oNorm(input, level, h), note: "مقطع مشكول من صحيح البخاري (فيه RLM ومسافات مزدوجة كما في المصدر)", source: src(VOCALIZED.work, row.n), review: "approved" });
  }
  while (cases.length < 300) {
    const book = pick(BOOKS);
    const row = pick(plain[book.work]);
    const [level, h] = levels[k++ % levels.length];
    const input = fragment(row.text, 5 + Math.floor(r() * 12));
    cases.push({ id: `gen-norm-corpus-${pad(cases.length)}`, input, level, options: h === "keep" ? {} : { honorifics: h },
      expected: oNorm(input, level, h), note: `مقطع غير مشكول من ${book.work}`, source: src(book.work, row.n), review: "approved" });
  }
  return cases;
}

// ------------------------------------------------------------------ offsets
const curatedOffsets = [
  ["search", "مُحَمَّدٌ", "شدة وتنوين مع ترتيب قانوني"],
  ["search", "ﺑِﺴْﻢِ", "صيغ عرض مع حركات"],
  ["search", "قال‏ ‏حدثنا", "RLM حول مسافة"],
  ["search", "٣٫٥", "فاصلة عشرية بين رقمين"],
  ["search", "النبي ﷺ قال", "تمدد رمز الصلاة وسط النص"],
  ["loose", "سماءٌ", "حذف الهمزة المنفردة ثم التنوين"],
  ["clean", "أَ", "تركيب أ مع فتحة بعدها"],
  ["search", "«نعم»", "ترقيم في الطرفين"],
  ["search", "👨‍👩 قال", "رمز تعبيري (وحدتان لكل محرف)"],
  ["clean", "بَّ", "إعادة ترتيب تجعل المجموعة كلها مجالًا واحدًا"],
  ["search", "عَلَيْهِٰ", "ألف خنجرية في آخر الكلمة"],
];

function offsetCases() {
  const hand = keepHand(readVectors("offsets"));
  const inputs = curatedOffsets.map(([level, input, note]) => ({ level, input, note }));
  while (hand.length + inputs.length < 100) {
    const row = vocal[Math.floor(r() * vocal.length)];
    inputs.push({ level: pick(["search", "search", "loose", "clean"]), input: fragment(row.text, 2 + Math.floor(r() * 4)), note: "مقطع مشكول من صحيح البخاري", source: src(VOCALIZED.work, row.n) });
  }
  const res = dart(inputs.map((x) => ({ op: "map", text: x.input, level: x.level })));
  return [...hand, ...inputs.map((x, i) => ({
    id: `gen-off-${pad(i + 1)}`, input: x.input, level: x.level, expected: res[i].text, start: res[i].start, end: res[i].end,
    note: x.note + " (المواضع من الحزمة المرجعية، ومتحقق منها بخصائص check-vectors)", ...(x.source ? { source: x.source } : {}), review: "approved",
  }))];
}

// ------------------------------------------------------------------ search
function searchCases() {
  const hand = keepHand(readVectors("search"));
  const reqs = [];
  while (hand.length + reqs.length < 150) {
    const row = vocal[Math.floor(r() * vocal.length)];
    const haystack = fragment(row.text, 8 + Math.floor(r() * 14));
    const words = oNorm(haystack).split(" ").filter((w) => w.length > 1);
    if (!words.length) continue;
    const variant = reqs.length % 5;
    const n = 1 + Math.floor(r() * Math.min(3, words.length));
    const s = Math.floor(r() * (words.length - n + 1));
    let needle = words.slice(s, s + n).join(" ");
    const options = {};
    if (variant === 1) options.wholeWord = true;
    if (variant === 2) { options.matchMode = "allWords"; needle = [pick(words), pick(words)].join(" "); }
    if (variant === 3) { options.matchMode = "anyWord"; needle = [pick(words), "كلمةغائبة"].join(" "); }
    if (variant === 4) { options.level = "loose"; needle = needle.replace(/ه\b/g, "ة"); }
    reqs.push({ haystack, needle, options, source: src(VOCALIZED.work, row.n) });
  }
  const res = dart(reqs.map((x) => ({ op: "findAll", haystack: x.haystack, needle: x.needle, ...x.options })));
  return [...hand, ...reqs.map((x, i) => ({
    id: `gen-search-${pad(i + 1)}`, haystack: x.haystack, needle: x.needle, options: x.options, expected: res[i],
    note: "مقطع مشكول من صحيح البخاري وعبارة بحث غير مشكولة (النتيجة من الحزمة المرجعية، ومتحقق منها بالأوراكل)", source: x.source, review: "approved",
  }))];
}

// ------------------------------------------------------------------ names
const NARRATORS = [
  ["أبو هريرة", "m"], ["عبد الله بن عمر", "m"], ["عبد الله بن عباس", "m"], ["عبد الله بن مسعود", "m"],
  ["عبد الله بن عمرو بن العاص", "m"], ["أنس بن مالك", "m"], ["جابر بن عبد الله", "m"], ["أبو سعيد الخدري", "m"],
  ["عائشة بنت أبي بكر", "f"], ["أبو بكر الصديق", "m"], ["عمر بن الخطاب", "m"], ["عثمان بن عفان", "m"],
  ["علي بن أبي طالب", "m"], ["معاذ بن جبل", "m"], ["أبو ذر الغفاري", "m"], ["أبو موسى الأشعري", "m"],
  ["أبو الدرداء", "m"], ["سلمان الفارسي", "m"], ["بلال بن رباح", "m"], ["سعد بن أبي وقاص", "m"],
  ["الزبير بن العوام", "m"], ["طلحة بن عبيد الله", "m"], ["عبد الرحمن بن عوف", "m"], ["أبو عبيدة بن الجراح", "m"],
  ["أم سلمة", "f"], ["حفصة بنت عمر", "f"], ["أسماء بنت أبي بكر", "f"], ["النعمان بن بشير", "m"],
  ["البراء بن عازب", "m"], ["زيد بن ثابت", "m"], ["أبي بن كعب", "m"], ["ابن شهاب الزهري", "r"],
  ["سفيان الثوري", "r"], ["سفيان بن عيينة", "r"], ["مالك بن أنس", "r"], ["شعبة بن الحجاج", "r"],
  ["حماد بن زيد", "r"], ["حماد بن سلمة", "r"], ["قتادة بن دعامة", "r"], ["الحسن البصري", "r"],
  ["محمد بن سيرين", "r"], ["سعيد بن المسيب", "r"], ["عروة بن الزبير", "r"], ["سالم بن عبد الله", "r"],
  ["إبراهيم النخعي", "r"], ["عطاء بن أبي رباح", "r"], ["مجاهد بن جبر", "r"], ["يحيى بن سعيد القطان", "r"],
  ["عبد الرحمن بن مهدي", "r"], ["أحمد بن حنبل", "r"], ["يحيى بن معين", "r"], ["علي بن المديني", "r"],
  ["إسحاق بن راهويه", "r"], ["وكيع بن الجراح", "r"], ["عبد الله بن المبارك", "r"], ["الليث بن سعد", "r"],
  ["أبو بكر بن أبي شيبة", "r"], ["قتيبة بن سعيد", "r"], ["أبو الزناد", "r"], ["أبو إسحاق السبيعي", "r"],
  ["عبد الرزاق بن همام", "r"], ["معمر بن راشد", "r"], ["هشام بن عروة", "r"], ["يزيد بن هارون", "r"],
  ["أبو أمامة الباهلي", "m"], ["عبادة بن الصامت", "m"], ["أبو أيوب الأنصاري", "m"], ["عمار بن ياسر", "m"],
  ["فاطمة بنت قيس", "f"], ["أم عطية", "f"], ["ميمونة بنت الحارث", "f"], ["زينب بنت جحش", "f"],
];
const HON = { m: "رضي الله عنه", f: "رضي الله عنها", r: "رحمه الله" };

function variants(base, kind) {
  const v = new Set();
  const w = base.split(" ");
  if (["أبو", "أبي", "أبا"].includes(w[0])) for (const k of ["أبي", "أبا", "ابو"]) v.add([k, ...w.slice(1)].join(" "));
  v.add(`${base} ${HON[kind]}`);
  if (base.includes(" بن ")) v.add(base.replace(/ بن /g, " ابن "));
  if (base.startsWith("ابن ")) v.add(base.replace(/^ابن /, "بن "));
  if (/[أإآ]/.test(base)) v.add(base.replace(/[أإآ]/g, "ا"));
  if (base.includes("ة")) v.add(base.replace(/ة/g, "ه"));
  if (base.includes("عبد ")) v.add(base.replace(/عبد /g, "عبد"));
  if (base.includes("ى")) v.add(base.replace(/ى/g, "ي"));
  v.add(`${base} الإمام`.replace(/^(.*)$/, kind === "r" ? "$1" : base));
  v.delete(base);
  return [...v];
}

const DIFFERENT = [
  ["سفيان الثوري", "سفيان بن عيينة"], ["حماد بن زيد", "حماد بن سلمة"], ["عبد الله بن عمر", "عبد الله بن عمرو"],
  ["أبو هريرة", "أبو بكر"], ["عائشة بنت أبي بكر", "أسماء بنت أبي بكر"], ["عبد الله بن عباس", "عبد الله بن مسعود"],
  ["يحيى بن سعيد القطان", "يحيى بن معين"], ["أبو بكر الصديق", "أبو بكر بن أبي شيبة"], ["سعد بن أبي وقاص", "سعيد بن المسيب"],
  ["عروة بن الزبير", "الزبير بن العوام"], ["هشام بن عروة", "عروة بن الزبير"], ["علي بن أبي طالب", "علي بن المديني"],
  ["عمر بن الخطاب", "عمار بن ياسر"], ["زيد بن ثابت", "حماد بن زيد"], ["أم سلمة", "حماد بن سلمة"],
  ["فاطمة بنت قيس", "فاطمة بنت محمد"], ["أبو أيوب الأنصاري", "أبو سعيد الخدري"], ["مالك بن أنس", "أنس بن مالك"],
  ["عبد الرحمن بن عوف", "عبد الرحمن بن مهدي"], ["ذو اليدين", "ذا الكلام"],
];

function nameCases() {
  const hand = keepHand(readVectors("names"));
  const cases = [...hand];
  for (const [base, kind] of NARRATORS) {
    cases.push({ id: `gen-names-key-${pad(cases.length)}`, input: base, expected: oKey(base), note: "مفتاح اسم راوٍ مشهور", review: "approved" });
  }
  for (const [base, kind] of NARRATORS) {
    const vs = variants(base, kind);
    if (vs.length) cases.push({ id: `gen-names-same-${pad(cases.length)}`, same: [base, ...vs], note: "صيغ متعددة لاسم واحد", review: "approved" });
  }
  for (const pair of DIFFERENT) cases.push({ id: `gen-names-diff-${pad(cases.length)}`, different: pair, note: "اسمان لشخصين مختلفين", review: "approved" });
  // Fill up to 200 with key cases for name + honorific / title variants.
  for (const [base, kind] of NARRATORS) {
    if (cases.length >= 200) break;
    const input = `${base} ${HON[kind]}`;
    cases.push({ id: `gen-names-key-${pad(cases.length)}`, input, expected: oKey(input), note: "اسم مع صيغة ترضٍّ أو ترحّم", review: "approved" });
  }
  // Cross-check with the Dart reference.
  const keyed = cases.filter((c) => "expected" in c);
  const got = dart(keyed.map((c) => ({ op: "nameKey", text: c.input })));
  keyed.forEach((c, i) => { if (got[i] !== c.expected) throw new Error(`nameKey disagreement ${c.id}: ${got[i]} vs ${c.expected}`); });
  return cases;
}

// ------------------------------------------------------------------ write
const norm = normalizeCases();
const ng = dart(norm.map((c) => ({ op: "normalize", text: c.input, level: c.level, honorifics: c.options?.honorifics ?? "keep" })));
norm.forEach((c, i) => { if (ng[i] !== c.expected) throw new Error(`Dart disagrees on ${c.id}: ${ng[i]} vs ${c.expected}`); });

for (const [name, cases] of [["normalize", norm], ["offsets", offsetCases()], ["search", searchCases()], ["names", nameCases()]]) {
  const doc = readVectors(name);
  doc.cases = cases;
  writeVectors(name, doc);
  console.log(`${name}: ${cases.length}`);
}
