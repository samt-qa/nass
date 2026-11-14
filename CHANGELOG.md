# Changelog

All three packages (Dart `nass`, npm `@samt-qa/nass`, Packagist `samt/nass`) share one version and one spec.

## 0.3.0

### splitIsnad (still experimental)
- New rules: «أنه أخبره عن», «كان يحدث أن», «أخبرني عن» after a name, «أن عائشة زوج النبي ﷺ قالت», «فاطمة بنت رسول الله ﷺ», «قال قال يعني رسول الله ﷺ», a second chain after «أن رسول الله ﷺ قال ح», Hammam's sahifa («هذا ما حدثنا أبو هريرة… فذكر أحاديث منها وقال رسول الله ﷺ»), «عن مولى لأبي سعيد», «لقيت» as a narrative verb, narrative verbs now end a name, and «قال قال رجل…» keeps «قال رجل» in the matn.
- «أن فلان رضي الله عنه» followed by a story (not a chain) is no longer taken as a link.
- Measured on a new sample of 300 hadiths, labelled blind by two annotators and held out until the design was frozen: dev 98.0% (490/500), **held-out test 88.3% (265/300)**. Details in `docs/corpus.md` and SPEC §14.

### Normalization
- No change. Keys from 0.2 stay valid.

### Test vectors
- 1,554 shared cases (was 1,254): 300 new isnad cases, reviewed and approved (SPEC §14).

## 0.2.0

### Normalization (SPEC §13)
- **U+06E7 ARABIC SMALL HIGH YEH becomes «ي» at the `search` level** instead of being deleted. In Uthmani script it stands for an omitted ya: «ٱلنَّبِيِّـۧنَ» now gives «النبيين» (was «النبين»).
- **ZWNJ (U+200C) is kept at the `clean` level**, so Persian and Urdu words keep their shape («می‌خواهم»). `search` removes it when it touches an Arabic letter.
- Keys produced by `search`, `loose` and `nameKey` change for text that contains U+06E7 or ZWNJ. Rebuild stored keys.

### splitIsnad (still experimental)
- New lexicon and rules: «قال قال فلان», «مولى» followed by a name, «صاحب رسول الله ﷺ», «نبيكم», «واللفظ له / لفلان», «قراءة عليه وأنا أسمع», «حدثهما / أخبرهما», «سمعته يقول», a second chain after «عن النبي ﷺ ح», and first-person narrative verbs («أتيت», «سألت»…) that never start a narrator's name.
- Measured on a new sample of 300 hadiths, labelled blind by two annotators before any change: dev 98.3% (295/300), **held-out test 88.0% (176/200)**. The 0.1 algorithm scores 87.5% on the same held-out set. Details in `docs/corpus.md`.

### Test vectors
- 1,254 shared cases (was 952): 300 new isnad cases, and new normalization cases for ZWNJ.
- All v0.1 cases were reviewed and approved (SPEC §12).

## 0.1.0

- First release: `normalize`, `normalizeWithMap`, `findAll`, `contains`, `highlight`, `nameKey`.
- Experimental `splitIsnad` (91% on a held-out set of 100 hadiths).
- Implements SPEC v0.1 and passes all shared test vectors.
