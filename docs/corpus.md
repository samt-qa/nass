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
| `normalize.json`, `offsets.json`, `search.json`, `names.json` | hand-written cases + `tools/gen-vectors.mjs` (deterministic, seeded) | 304 / 100 / 150 / 200 |
| `isnad.json` | `tools/gen-isnad-vectors.mjs` from the hand labels in `tools/isnad-labels.mjs` | 800 |

- Generated cases (`gen-…`) take real lines from the corpus, or are marked `synthetic: true` when they are built from rule fragments. The expected value comes from the Dart reference package and must agree with the independent oracle (`tools/oracle.mjs`).
- `tools/check-vectors.mjs` checks the structure and properties of every case. Text that looks sacred (Quranic marks, or two or more vocalized words) must have a `source` unless it is `synthetic`.
- `tools/differential.mjs` compares Dart with the oracle over the whole corpus. The last run found 0 mismatches in 172,463 comparisons.

## The isnad set / مجموعة الإسناد

### Sampling / الاختيار
`tools/corpus/isnad-sample.json` (committed) holds 800 hadiths from the six books, interleaved by book:

| Indices | Drawn for | Role in 0.3 |
|---|---|---|
| 0–99 | v0.1 dev | dev |
| 100–199 | v0.1 test (held out in v0.1) | dev |
| 200–299 | v0.2 dev | dev |
| 300–499 | v0.2 test (held out in v0.2) | dev: its errors guided the 0.3 changes |
| 500–799 | v0.3 test | **held out**, measured once |

The v0.1 sample (0–199) was a one-off draw. Later draws come from `tools/sample-isnad.mjs`: 50 hadiths per book per round with a fixed seed, none already in the sample. After each release the held-out set joins dev, and the next release draws a new one. Case ids keep their original names (`isnad-test-100`…`499` are now in the `dev` split).

### Labelling / الوسم
The labels are in `tools/isnad-labels.mjs`. Each label is the first words of the matn, plus any alternatives that are equally defensible. The convention is SPEC §8.1. In short: the formula that raises the hadith to the Prophet ﷺ and is followed by speech belongs to the isnad; otherwise the matn starts with the reported content.

- v0.1 (0–199): written by hand **before** any algorithm existed.
- v0.2 (200–499): two independent annotators labelled each hadith blind, seeing only the convention and the numbered words, **before** any change to `splitIsnad`. They chose the same start in 299 of 300; the one disagreement (`isnad-test-346`) was settled by the convention. An alternative is kept only when both annotators accepted it. The anchors are words of the corpus text itself. Mohammed approved them after a delegated review (SPEC §13): every case where an annotator was unsure (47) was checked against the convention, plus a random 30 of the rest; no label was wrong.
- v0.3 (500–799): same method, labelled blind before any 0.3 change. They chose the same start in 297 of 300; the three disagreements (`isnad-test-567`, `592`, `754`) were settled by the convention. Mohammed approved them after a delegated review (SPEC §14): all 40 cases where an annotator was unsure, plus a random 30 of the rest; no label was wrong.

القاعدة: صيغة الرفع إلى النبي ﷺ المتبوعة بقول تتبع الإسناد، وإلا فالمتن يبدأ بالمحتوى المروي. الوسوم كُتبت قبل أي تعديل على الخوارزمية.

### Protocol / المنهج
1. Label the sample.
2. Change `splitIsnad` while looking **only** at dev failures.
3. Freeze the design and measure the test set **once**.

### Results (v0.3) / النتائج

| Work / الكتاب | dev (500) | test (300, held out) |
|---|---|---|
| صحيح البخاري | 84/84 | 37/50 |
| صحيح مسلم | 82/84 | 41/50 |
| سنن أبي داود | 80/83 | 46/50 |
| جامع الترمذي | 79/83 | 46/50 |
| سنن النسائي | 82/83 | 47/50 |
| سنن ابن ماجه | 83/83 | 48/50 |
| **Total** | **490/500 (98.0%)** | **265/300 (88.3%)** |

Read these numbers with care:
- **The held-out result is 88.3%.** The 0.2 algorithm scores 86.7% (260/300) on the same set, so 0.3 gains 1.6 points on unseen hadiths, against 3 points on dev (95.0% → 98.0%).
- Nothing was changed after the measurement.
- Every held-out result so far is close to 88% (v0.1 87.5%, v0.2 88.0%, v0.3 88.3%). The remaining errors are mostly rare forms that a new sample brings in each time. The target for removing the experimental tag is ≥90% on a held-out set, so **`splitIsnad` stays experimental**.

History: v0.1 dev 98/100, held-out 91/100. v0.2 dev 295/300, held-out 176/200 (88.0%).

### Held-out errors (v0.3) / أخطاء مجموعة الاختبار
Listed to guide the next version. None was fixed.

| Pattern / النمط | Cases | What happens |
|---|---|---|
| A narrator's or compiler's aside inside the chain («والصواب…», «قال إسحق أخبرنا وقال عبد حدثنا», «وأظنني قد سمعته», «وزعم عروة», «وجدت في كتابي», «صاحب أحمد بن حنبل») | test-507, 508, 519, 611, 621, 651, 662, 669, 678, 732, 771 | the aside is read as the matn, or breaks the chain |
| «أن فلانًا …» as a link (e.g. «أن أم سلمة **حدثتهم**», «أن ابن عمر قال» without a Prophet formula) | test-527, 560, 572, 605, 626, 692, 728 | the link is not accepted, so the matn starts at «أن» |
| A description not in the lexicon: «أنس **خادم النبي ﷺ**», «رجل **من أصحاب النبي ﷺ**», «**يبلغ به** النبي ﷺ» | test-524, 586, 674 | read as a Prophet formula or a name |
| Story, question or framing by a narrator | test-517, 554, 566, 567, 575, 644, 645, 705 | the boundary lands one step early or late |
| The addressee: «قالت **لعروة**», «قال **لي جرير**», «**لرسول الله** ﷺ» | test-588, 596, 620 | the addressee is split from the speech |
| Other | test-568, 577, 688 | various |

Design-set errors (0.3): dev-027 («وكانت ممن بايعت النبي ﷺ»), test-133 («يقولا» then «قال أبو جهل»), test-158 («قال عبادة بن الصامت لابنه»), test-175 (rare formula), test-346, test-419 and test-467 (addressee «لبلال», «لعلي»), test-420, test-431 («حُدِّثت»), test-472.

## Reproduce / إعادة القياس

```bash
node tools/fetch-corpus.mjs
node tools/gen-isnad-vectors.mjs      # rebuilds isnad.json (labels + reference output)
node tools/eval-isnad.mjs dev --show  # accuracy and failures on dev
node tools/eval-isnad.mjs test        # accuracy on the held-out set
```

### Known errors outside the sample / أخطاء معروفة خارج العينة
- صحيح البخاري 1: «سمعت عمر بن الخطاب رضي الله عنه **على المنبر** قال سمعت رسول الله ﷺ يقول». The matn should start at «إنما الأعمال», but the parser stops after the honorific because «على المنبر» is not a link. It was found outside the sample and kept for the next version.
