## 0.2.0

- `search`: U+06E7 (small high yeh) becomes «ي» instead of being deleted («ٱلنَّبِيِّـۧنَ» → «النبيين»).
- `clean` keeps ZWNJ (U+200C); `search` removes it next to Arabic letters.
- Experimental `splitIsnad`: new rules; 88.0% on a new held-out set of 200 hadiths (dev 98.3% on 300).
- Implements SPEC v0.2 and passes all 1,254 shared test vectors. Full notes in the repository CHANGELOG.md.

## 0.1.0

- First release: `normalize`, `normalizeWithMap`, `findAll`, `contains`, `highlight`, `nameKey`.
- Experimental `splitIsnad` (91% on a held-out set of 100 hadiths).
- Implements SPEC v0.1 and passes all shared test vectors.
