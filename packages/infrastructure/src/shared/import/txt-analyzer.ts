import type {
  ImportTxtAnalysis,
  ImportTxtAnalyzer,
} from "@dailyflow/application";

import { decodeTxt } from "./txt-decoder.js";

export class TxtAnalyzer implements ImportTxtAnalyzer {
  async analyze(bytes: Uint8Array): Promise<ImportTxtAnalysis> {
    return decodeTxt(bytes);
  }
}
