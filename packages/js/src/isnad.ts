// Experimental isnad/matn split (SPEC §8). Implemented in phase 4.
export interface Narrator {
  name: string;
  form: string;
}
export interface IsnadSplit {
  isnad: string;
  matn: string;
  confidence: number;
  narrators: Narrator[];
}

/** @experimental API may change before 2.0. */
export function splitIsnad(text: string): IsnadSplit {
  return { isnad: "", matn: text, confidence: 0, narrators: [] };
}
