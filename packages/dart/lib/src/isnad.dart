// Experimental isnad/matn split (SPEC §8). Implemented in phase 4.
class Narrator {
  final String name;
  final String form;
  const Narrator(this.name, this.form);
}

class IsnadSplit {
  final String isnad;
  final String matn;
  final double confidence;
  final List<Narrator> narrators;
  const IsnadSplit(this.isnad, this.matn, this.confidence, this.narrators);
}

/// Experimental: API may change before 2.0.
IsnadSplit splitIsnad(String text) => IsnadSplit('', text, 0, const []);
