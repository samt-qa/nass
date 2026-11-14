import 'package:nass/nass.dart';

void main() {
  const text = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ';

  // Normalize for search: diacritics removed, letter variants unified.
  print(normalize(text)); // انما الاعمال بالنيات

  // Find a plain query in vocalized text; offsets point into the original.
  for (final m in findAll(text, 'الاعمال')) {
    print('${m.start}-${m.end}: ${m.text}'); // 9-21: الْأَعْمَالُ
  }

  // Highlight the match in the original text.
  print(highlight(text, 'الاعمال'));

  // A key for comparing narrator names.
  print(nameKey('أبي عبدِ الله البخاريّ رحمه الله')); // ابو عبدالله البخاري
}
