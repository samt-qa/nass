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

Every case that quotes a hadith has a `source`, for example `{"work": "صحيح مسلم", "ref": "3222", "dataset": "Open-Hadith-Data …", "verified": true}`. Here `ref` is the hadith **number in that dataset**, which may differ from other numbering systems. `verified: true` means the text was copied by script from the dataset row, not typed. It does **not** mean a scholar compared it with a printed edition. `review: approved` means Mohammed approved the expected value (2026-11-14, see SPEC §12): 152 pending cases were reviewed one by one, and 134 isnad cases were approved on the strength of an independent blind relabel that agreed with them.

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
`tools/corpus/isnad-sample.json` (committed) holds 200 hadiths drawn at random from the six books, about 34 per book, interleaved by book. The first 100 form the **dev** set and the last 100 the **test** set. The sampling was a one-off script, so the committed file is the record of the sample.

### Labelling / الوسم
The labels are in `tools/isnad-labels.mjs`. Each label is the first words of the matn, plus any alternatives that are equally defensible. The convention is SPEC §8.1. In short: the formula that raises the hadith to the Prophet ﷺ and is followed by speech belongs to the isnad; otherwise the matn starts with the reported content. The labels were written **before** any algorithm existed.

القاعدة: صيغة الرفع إلى النبي ﷺ المتبوعة بقول تتبع الإسناد، وإلا فالمتن يبدأ بالمحتوى المروي. الوسوم كُتبت قبل كتابة أي خوارزمية.

### Protocol / المنهج
1. Label all 200.
2. Design `splitIsnad` while looking **only** at dev failures.
3. Freeze the design and measure the test set **once**.

### Results (v0.1) / النتائج

| Work / الكتاب | dev | test (held out) |
|---|---|---|
| صحيح البخاري | 17/17 | 16/17 |
| صحيح مسلم | 17/17 | 14/17 |
| سنن أبي داود | 17/17 | 16/16 |
| جامع الترمذي | 16/17 | 15/16 |
| سنن النسائي | 16/16 | 15/17 |
| سنن ابن ماجه | 15/16 | 15/17 |
| **Total** | **98/100** | **91/100** |

The PRD target is ≥80% for the experimental release and ≥90% before the experimental tag is removed. The held-out result (91%) meets the second target, but on 100 cases only: a 95% confidence interval is roughly 84–95%. **`splitIsnad` therefore stays experimental** until it is measured on a new, larger held-out set that a specialist has reviewed.

### Test-set errors / أخطاء مجموعة الاختبار
These are listed to guide the next version. Fixing them now would mean tuning on the test set, so they were left as they are.

| Case | Pattern / النمط | What happens |
|---|---|---|
| test-109 | «أن ثوبان **مولى رسول الله ﷺ** حدثه قال» | the «مولى» qualifier is not skipped inside an «أن» link |
| test-141 | «عن أبي مرة **مولى عقيل** بن أبي طالب عن…» | «مولى» followed by a name (not the Prophet) is not a qualifier yet |
| test-118 | «قال الحارث بن مسكين **قراءة عليه وأنا أسمع** عن…» | al-Nasāʾī's formula is not in the lexicon |
| test-151 | «قال **قرأت على مالك** عن…» | «قرأت على» right after «قال» is not tried as a link |
| test-175 | «حدثني الضحاك **من رقعة عارض لي بها ثم قرأه علي** قال أخبرناه…» | rare formula |
| test-119 | «سمعه من شهر بن حوشب يقول **أخبرته أسماء** قالت» | a pronoun verb followed by a name, after «يقول» |
| test-198 | «عن أنس قال **سمعته يقول** إن رسول الله ﷺ…» | «سمعته يقول» (no name) is not absorbed |
| test-155 | «قال **سألت أنس بن مالك عن** قراءة النبي ﷺ» | a question framed like a chain link |
| test-166 | «قال **أتينا جابر بن عبد الله فسألناه عن** حجة النبي ﷺ» | same as test-155 |

Design-set errors: dev-027 («وكانت ممن بايعت النبي ﷺ» after the name) and dev-089 (the story «أتاني ابن عباس فسألني عن …» is parsed as a chain).

## Reproduce / إعادة القياس

```bash
node tools/fetch-corpus.mjs
node tools/gen-isnad-vectors.mjs      # rebuilds isnad.json (labels + reference output)
node tools/eval-isnad.mjs dev --show  # accuracy and failures on dev
node tools/eval-isnad.mjs test        # accuracy on the held-out set
```

### Known errors outside the sample / أخطاء معروفة خارج العينة
- صحيح البخاري 1: «سمعت عمر بن الخطاب رضي الله عنه **على المنبر** قال سمعت رسول الله ﷺ يقول». The matn should start at «إنما الأعمال», but the parser stops after the honorific because «على المنبر» is not a link. It was found outside the sample and kept for the next version.
