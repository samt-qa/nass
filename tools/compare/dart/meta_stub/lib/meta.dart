// Minimal stand-in for package:meta, so the compared Dart files can be loaded without
// `pub get`. They only use the @internal annotation, which has no runtime effect.
library;

class _Internal {
  const _Internal();
}

const Object internal = _Internal();
