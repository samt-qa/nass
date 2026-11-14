// Benchmark: normalize ~1 MB of fully vocalized Arabic (PRD §6.4: < 50 ms).
import 'package:nass/nass.dart';

void main() {
  const unit = 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى ﷺ. ';
  final sb = StringBuffer();
  while (sb.length < 1 << 20) {
    sb.write(unit);
  }
  final text = sb.toString();
  for (final level in Level.values) {
    for (var i = 0; i < 5; i++) {
      normalize(text, level: level); // warm-up
    }
    final sw = Stopwatch()..start();
    const runs = 10;
    for (var i = 0; i < runs; i++) {
      normalize(text, level: level);
    }
    print('${level.name}: ${(sw.elapsedMicroseconds / runs / 1000).toStringAsFixed(1)} ms '
        'per ${(text.length / 1024).round()} K units');
  }
}
