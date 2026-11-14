// Benchmark: normalize ~1 MB of fully vocalized Arabic (PRD §6.4: < 50 ms).
import { normalize } from "../dist/index.js";
const unit = "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى ﷺ. ";
let text = "";
while (text.length < 1 << 20) text += unit;
for (const level of ["clean", "search", "loose"]) {
  for (let i = 0; i < 5; i++) normalize(text, { level });
  const runs = 10, t0 = performance.now();
  for (let i = 0; i < runs; i++) normalize(text, { level });
  console.log(`${level}: ${((performance.now() - t0) / runs).toFixed(1)} ms per ${Math.round(text.length / 1024)} K units`);
}
