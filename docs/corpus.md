# Corpus and test data / مصادر النصوص وملفات الاختبار

## Source / المصدر

All hadith text in `spec/vectors/` comes from **[Open-Hadith-Data](https://github.com/mhashim6/Open-Hadith-Data)**. That repository contains the six books (and others) as CSV files without and with diacritics. The database is licensed **ODbL 1.0** and its contents **DbCL 1.0**. We redistribute short excerpts with attribution and claim no rights over the religious texts themselves.

كل نصوص الحديث في ملفات الاختبار مأخوذة من Open-Hadith-Data، برخصة ODbL لقاعدة البيانات و DbCL للمحتوى. ننقل مقتطفات قصيرة مع ذكر المصدر، ولا ندّعي أي حق في النصوص الشرعية نفسها.

| Work / الكتاب | File |
|---|---|
| صحيح البخاري | `sahih_al-bukhari_ahadith.utf8.csv` |
| صحيح البخاري (مشكول) | `sahih_al-bukhari_ahadith_mushakkala_mufassala.utf8.csv` |
| صحيح مسلم | `sahih_muslim_ahadith.utf8.csv` |
| سنن أبي داود | `sunan_abu-dawud_ahadith.utf8.csv` |
| جامع الترمذي | `sunan_al-tirmidhi_ahadith.utf8.csv` |
| سنن النسائي | `sunan_al-nasai_ahadith.utf8.csv` |
| سنن ابن ماجه | `sunan_ibn-maja_ahadith.utf8.csv` |

Every case that quotes a hadith has a `source`, for example `{"work": "صحيح مسلم", "ref": "3222", "dataset": "Open-Hadith-Data …", "verified": true}`. Here `ref` is the hadith **number in that dataset**, which may differ from other numbering systems. `verified: true` means the text was copied by script from the dataset row, not typed. It does **not** mean a scholar compared it with a printed edition. `review: approved` means Mohammed approved the expected value (2026-11-14, see SPEC §12): all 286 pending cases were reviewed one by one in a review page, after an independent blind relabel of the 200 isnad cases that agreed with the labels.

We did **not** use corpora without a clear licence, such as the LK Hadith Corpus or Sanadset.

لم نستعمل مجموعات بلا رخصة واضحة.

```bash
node tools/fetch-corpus.mjs     # downloads the CSV files into tools/corpus (git-ignored)
```

## How the vectors are built / كيف بُنيت الحالات

| File | Built by | Cases |
|---|---|---|
| `normalize.json`, `offsets.json`, `search.json`, `names.json` | hand-written cases + `tools/gen-vectors.mjs` (deterministic, seeded) | 302 / 100 / 150 / 200 |
| `isnad.json` | `tools/gen-isnad-vectors.mjs` from the hand labels in `tools/isnad-labels.mjs` | 200 |

- Generated cases (`gen-…`) take real lines from the corpus, or are marked `synthetic: true` when they are built from rule fragments. The expected value comes from the Dart reference package and must agree with the independent oracle (`tools/oracle.mjs`).
- `tools/check-vectors.mjs` checks the structure and properties of every case. Text that looks sacred (Quranic marks, or two or more vocalized words) must have a `source` unless it is `synthetic`.
- `tools/differential.mjs` compares Dart with the oracle over the whole corpus. The last run found 0 mismatches in 172,463 comparisons.

## The isnad set / مجموعة الإسناد

### Sampling / الاختيار
`tools/corpus/isnad-sample.json` (committed) holds 500 hadiths from the six books, interleaved by book:

| Indices | Drawn for | Role in 0.2 |
|---|---|---|
| 0–99 | v0.1 dev | dev |
| 100–199 | v0.1 test (held out in v0.1) | dev: its errors guided the 0.2 changes |
| 200–299 | v0.2 dev | dev |
| 300–499 | v0.2 test | **held out**, measured once |

The v0.1 sample (0–199) was a one-off draw. The v0.2 draw is `tools/sample-isnad.mjs`: 50 hadiths per book with a fixed seed, none already in the sample. Case ids keep their original names (`isnad-test-100`…`199` are now in the `dev` split).

### Labelling / الوسم
The labels are in `tools/isnad-labels.mjs`. Each label is the first words of the matn, plus any alternatives that are equally defensible. The convention is SPEC §8.1. In short: the formula that raises the hadith to the Prophet ﷺ and is followed by speech belongs to the isnad; otherwise the matn starts with the reported content.

- v0.1 (0–199): written by hand **before** any algorithm existed.
- v0.2 (200–499): two independent annotators labelled each hadith blind, seeing only the convention and the numbered words, **before** any change to `splitIsnad`. They chose the same start in 299 of 300; the one disagreement (`isnad-test-346`) was settled by the convention. An alternative is kept only when both annotators accepted it. The anchors are words of the corpus text itself. These cases are pending Mohammed's review.

القاعدة: صيغة الرفع إلى النبي ﷺ المتبوعة بقول تتبع الإسناد، وإلا فالمتن يبدأ بالمحتوى المروي. الوسوم كُتبت قبل أي تعديل على الخوارزمية.

### Protocol / المنهج
1. Label the sample.
2. Change `splitIsnad` while looking **only** at dev failures.
3. Freeze the design and measure the test set **once**.

### Results (v0.2) / النتائج

| Work / الكتاب | dev (300) | test (200, held out) |
|---|---|---|
| صحيح البخاري | 51/51 | 29/33 |
| صحيح مسلم | 49/51 | 24/33 |
| سنن أبي داود | 48/50 | 31/33 |
| جامع الترمذي | 49/50 | 29/33 |
| سنن النسائي | 49/49 | 31/34 |
| سنن ابن ماجه | 49/49 | 32/34 |
| **Total** | **295/300 (98.3%)** | **176/200 (88.0%)** |

Read these numbers with care:
- **The held-out result is 88.0%.** The v0.1 algorithm scores 87.5% (175/200) on the same set, so the 0.2 changes barely help on unseen hadiths. Most of the dev gain (92.0% → 98.3%) came from patterns specific to the dev set.
- After the measurement, three test errors turned out to be a bug in a new 0.2 rule (`واللفظ لابن المثنى` is three words, the rule skipped two). The bug was fixed, which brings the test set to 180/200 (90.0%). **That figure is not held out**, because the fix was made after seeing the test set.
- The target for removing the experimental tag is ≥90% on a held-out set. 88.0% misses it, so **`splitIsnad` stays experimental**. The next measurement needs a new test set.

v0.1 for reference: dev 98/100, held-out test 91/100.

### Held-out errors (v0.2) / أخطاء مجموعة الاختبار
Listed to guide the next version. They were not fixed, except the «واللفظ» bug.

| Pattern / النمط | Cases | What happens |
|---|---|---|
| «واللفظ **لابن المثنى** قالا» | test-327, 369, 435 | fixed after measurement (see above) |
| «**هذا ما حدثنا** أبو هريرة» (صحيفة همام) | test-411, 453 | formula not in the lexicon |
| «قال رسول الله ﷺ **لعلي** / **لبلال**» | test-419, 467 | the addressee is not absorbed before the speech |
| «عن **مولى لأبي سعيد** عن…» | test-313 | an unnamed client is not read as a narrator |
| «قال **واقد بن عبد الله أخبرني** عن أبيه» | test-320 | name before the transmission verb |
| «**حُدِّثت** أن أبا هريرة» | test-431 | passive transmission |
| «فاطمة بنت رسول الله ﷺ قالت **كان رسول الله**» | test-481 | «بنت رسول الله» read as a Prophet formula |
| story framing, action or speech misread | test-302, 303, 318, 339, 344, 346, 420, 459, 462, 472, 483, 485, 488 | various |

Design-set errors (0.2): dev-027 («وكانت ممن بايعت النبي ﷺ»), dev-089 («أتاني ابن عباس فسألني»), test-133 and test-158 (a story after «قال قال»: «قال أبو جهل اللهم», «قال عبادة بن الصامت لابنه»; ambiguous with «قال قال أنس ║»), test-175 (rare formula), dev-208 («فإن نافعا»).

## Reproduce / إعادة القياس

```bash
node tools/fetch-corpus.mjs
node tools/gen-isnad-vectors.mjs      # rebuilds isnad.json (labels + reference output)
node tools/eval-isnad.mjs dev --show  # accuracy and failures on dev
node tools/eval-isnad.mjs test        # accuracy on the held-out set
```

### Known errors outside the sample / أخطاء معروفة خارج العينة
- صحيح البخاري 1: «سمعت عمر بن الخطاب رضي الله عنه **على المنبر** قال سمعت رسول الله ﷺ يقول». The matn should start at «إنما الأعمال», but the parser stops after the honorific because «على المنبر» is not a link. It was found outside the sample and kept for the next version.
