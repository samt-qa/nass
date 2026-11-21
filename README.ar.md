<div align="center">

# نَصّ · nass

**تطبيع النص العربي والبحث فيه بلا اعتبار للحركات، للقرآن والحديث وكتب التراث،<br>مع مواضع التطابق في النص الأصلي المشكول.**

مواصفة واحدة · أربع حزم متطابقة المخرجات · Dart و TypeScript و PHP و Rust

[![CI](https://github.com/samt-qa/nass/actions/workflows/ci.yml/badge.svg)](https://github.com/samt-qa/nass/actions/workflows/ci.yml)
[![pub.dev](https://img.shields.io/pub/v/nass?logo=dart&label=pub.dev)](https://pub.dev/packages/nass)
[![npm](https://img.shields.io/npm/v/@samt-qa/nass?logo=npm&label=npm)](https://www.npmjs.com/package/@samt-qa/nass)
[![Packagist](https://img.shields.io/packagist/v/samt/nass?logo=packagist&logoColor=white&label=packagist)](https://packagist.org/packages/samt/nass)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Test vectors: CC0](https://img.shields.io/badge/test%20vectors-CC0-lightgrey.svg)](spec/vectors)
[![Unicode 17](https://img.shields.io/badge/Unicode-17.0-informational.svg)](spec/SPEC.md)
![Dart](https://img.shields.io/badge/Dart-3.x-0175C2?logo=dart&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM%20%7C%20CJS-3178C6?logo=typescript&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-%E2%89%A5%208.3-777BB4?logo=php&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-%E2%89%A5%201.70-B7410E?logo=rust&logoColor=white)

[English](README.md) · [المواصفة](spec/SPEC.md) · [ملفات الاختبار](spec/vectors) · [مصادر النصوص ودقة الإسناد](docs/corpus.md)

</div>

<div dir="rtl">

```text
ابحث عن  «الاعمال»
في       إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ
النتيجة  إِنَّمَا <mark>الْأَعْمَالُ</mark> بِالنِّيَّاتِ   (من 9 إلى 21 في الأصل)
```

## المحتويات

- [لماذا نَصّ](#لماذا-نَصّ)
- [الحزم](#الحزم)
- [أمثلة سريعة](#أمثلة-سريعة)
- [مستويات التطبيع](#مستويات-التطبيع)
- [تقسيم الإسناد والمتن (تجريبي)](#تقسيم-الإسناد-والمتن-تجريبي)
- [الجودة والاختبار](#الجودة-والاختبار)
- [الأداء](#الأداء)
- [مقارنة بالمكتبات الأخرى](#مقارنة-بالمكتبات-الأخرى)
- [المساهمة](#المساهمة)
- [الرخصة](#الرخصة)

## لماذا نَصّ

البحث في النص المشكول يبدو سهلًا. تحذف الحركات فتجد الكلمة، لكنك تفقد موضعها في النص الذي يقرؤه المستخدم. ثم تأتي علامات الضبط القرآني، وصيغ العرض مثل «ﷲ» و«ﻻ»، ورموز الصلاة مثل «ﷺ»، وعلامات الاتجاه الخفية، والحروف الفارسية الشبيهة، وكل منها يُفسد البحث بطريقته. وأغلب المكتبات تعالج بعضها، بلغة واحدة، بلا اختبارات مشتركة.

| | |
|---|---|
| **المواضع في الأصل** | كل محرف مطبَّع يُعرف مصدره، فتُظلِّل النص المشكول الذي يراه القارئ فعلًا. |
| **مواصفة واحدة، أربع لغات** | الحزم الأربع تجتاز 1,554 حالة اختبار مشتركة، ومعها اختبار تفاضلي مع نسخة مستقلة: صفر اختلاف في 172,463 مقارنة على الكتب الستة. |
| **مصمَّم للنص الشرعي** | يفهم صيغ الترضّي («ﷺ»، «رضي الله عنه»، «عز وجل» بعد لفظ الجلالة فقط)، وفيه مفتاح لأسماء الرواة `nameKey`، وتقسيم تجريبي للإسناد والمتن مقيس على أحاديث موسومة باليد. |
| **خفيف بلا اعتماديات** | حزمة JS الأساسية 7.9 كيلوبايت بعد الضغط، وحزم Dart و PHP و Rust بلا اعتماديات كذلك. |

## الحزم

| اللغة | الحزمة | التثبيت | التوثيق |
|---|---|---|---|
| Dart / Flutter | `nass` | `dart pub add nass` | [packages/dart](packages/dart) |
| TypeScript / JavaScript | `@samt-qa/nass` | `npm i @samt-qa/nass` | [packages/js](packages/js) |
| PHP 8.3 فأحدث | `samt/nass` | `composer require samt/nass` | [packages/php](packages/php) |
| Rust 1.70 فأحدث | `nass` *(لم يُنشر على crates.io بعد)* | `nass = { git = "https://github.com/samt-qa/nass" }` | [packages/rust](packages/rust) |

> [!NOTE]
> **الإصدار 0.3.0.** منشور على [pub.dev](https://pub.dev/packages/nass) و[npm](https://www.npmjs.com/package/@samt-qa/nass) و[Packagist](https://packagist.org/packages/samt/nass). حالات الاختبار كلها مراجَعة ومعتمدة ([المواصفة، الأقسام 12–14](spec/SPEC.md)).

## أمثلة سريعة

</div>

```ts
import { normalize, findAll, highlight, nameKey } from "@samt-qa/nass";
import { splitIsnad } from "@samt-qa/nass/isnad"; // تجريبي، في مدخل منفصل

normalize("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ");            // "انما الاعمال بالنيات"
findAll("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", "الاعمال");   // [{ start: 9, end: 21, text: "الْأَعْمَالُ" }]
highlight(text, "الاعمال", { wholeWord: true });
nameKey("أبي عبدِ الله البخاريّ رحمه الله");               // "ابو عبدالله البخاري"
```

```dart
import 'package:nass/nass.dart';

normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');                // 'انما الاعمال بالنيات'
```

```php
use Samt\Nass\Nass;

Nass::normalize('إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ');           // 'انما الاعمال بالنيات'
```

```rust
use nass::*;

normalize("إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ", &Options::default());   // "انما الاعمال بالنيات"
find_all(text, "الاعمال", &SearchOptions::default());          // المواضع في Rust بايتات UTF-8
```

<div dir="rtl">

## مستويات التطبيع

| المستوى | الاستعمال | ماذا يفعل |
|---|---|---|
| `clean` | التخزين والعرض | يحذف التطويل والمحارف الخفية، ويفك صيغ العرض (عدا رموز الصلاة)، ويوحّد المسافات، ويركّب الهمزة والمدة. **شكل النص لا يتغير.** |
| `search` (الافتراضي) | البحث والفهرسة | ما سبق، ويفك «ﷺ» و«﷽»، ويحذف الحركات وعلامات الضبط القرآني، ويوحّد صور الألف والياء والكاف والهاء، ويحوّل الأرقام العربية والفارسية، ويجعل الترقيم مسافة، ويصغّر اللاتينية. ومع `honorifics: strip` يحذف صيغ الترضّي المكتوبة. |
| `loose` | البحث المتسامح | ما سبق، و«ة» ← «ه»، و«ؤ» ← «و»، و«ئ» ← «ي»، ويحذف «ء» المنفردة. يدمج بعض الكلمات المختلفة عمدًا. |

كل قاعدة بسببها ومجالاتها في [spec/SPEC.md](spec/SPEC.md).

## تقسيم الإسناد والمتن (تجريبي)

| المجموعة | عدد الأحاديث | إصابة الحدّ بين الإسناد والمتن |
|---|---|---|
| التصميم (dev) | 500 | **98.0%** |
| المحجوزة (test، عيّنة جديدة قيست مرة واحدة) | 300 | **88.3%** |

خوارزمية 0.2 تحصل على 86.7% في المجموعة المحجوزة نفسها. كل النتائج المحجوزة حتى الآن قرب 88%، فتبقى `splitIsnad` تجريبية حتى تبلغ 90% في مجموعة محجوزة.

النتائج لكل كتاب وتحليل الأخطاء في [docs/corpus.md](docs/corpus.md).

> [!IMPORTANT]
> `splitIsnad` محلل تقريبي لا عالم بالرجال، و`narrators` لا يحدد هوية الراوي، وتطابق `nameKey` لاسمين لا يعني أنهما لشخص واحد.

## الجودة والاختبار

| الفحص | النتيجة |
|---|---|
| حالات الاختبار المشتركة | 1,554 حالة في الحزم الأربع |
| الاختبار التفاضلي مع نسخة مستقلة (الكتب الستة) | صفر اختلاف في 172,463 مقارنة (Dart و Rust) |
| تغطية الأسطر | Dart ‏99.3% · TypeScript ‏99.6% · PHP ‏97.9% · Rust ‏98.0% |
| مصفوفة CI | Dart 3.13 · Node 20 / 22 / 24 · PHP 8.3 / 8.4 / 8.5 · Rust stable / 1.70 على Linux و Windows |

## الأداء

تطبيع 1 ميغابايت من البخاري المشكول على حاسوب مكتبي (Windows 11)، بالمللي ثانية:

| البيئة | clean | search | loose |
|---|--:|--:|--:|
| Dart 3.13 | 24 | 26 | 28 |
| Node 22 | 34 | 38 | 39 |
| PHP 8.5 مع JIT | 47 | 72 | 76 |
| PHP 8.5 بلا JIT | 132 | 227 | 238 |
| Rust 1.95 (`cargo bench`) | 16 | 21 | 22 |

قيس سطر Rust لاحقًا على الحاسوب نفسه، وأعطت Dart في الجلسة نفسها 29 / 30 / 31.

## مقارنة بالمكتبات الأخرى

شغّلنا حالات الاختبار المشتركة على ثلاث مكتبات أخرى (TypeScript و Rust و Dart)، وليست منها حزمة Rust في «نَصّ». في حالات التطبيع التي تدعمها كل مكتبة (205 حالات، مواصفة 0.2) كانت نسب النجاح 87% و37% و32%. الإخفاق معناه أن المخرج يخالف مواصفة «نَصّ»، لا أن المكتبة مخطئة في غرضها. التفاصيل وطريقة إعادة التشغيل في **[docs/comparison.md](docs/comparison.md)**.

## المساهمة

1. كل تغيير في السلوك يبدأ في `spec/SPEC.md` و`spec/vectors/`، ثم تتبعه الحزم الأربع.
2. لا يدخل نص قرآني أو حديث في الاختبارات بلا مصدر مذكور.
3. رسائل الإيداع بالإنجليزية، والتوثيق باللغتين.

## الرخصة

- الكود: [MIT](LICENSE) © 2026 سَمْت للبرمجيات.
- ملفات الاختبار: [CC0](spec/vectors/LICENSE)، والنصوص الشرعية فيها ليست ملكًا لأحد، ومصدر كل حالة مذكور.
- بيانات الحديث: [Open-Hadith-Data](https://github.com/mhashim6/Open-Hadith-Data) (ODbL / DbCL).

</div>
