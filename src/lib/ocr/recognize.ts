import TextRecognition from '@react-native-ml-kit/text-recognition';

import { rowsFromLines, type PositionedLine } from './receipt';

/**
 * On-device text recognition (Google ML Kit, works offline). Returns the text
 * as printed rows — labels re-joined with their amounts using line positions —
 * or null when recognition can't run.
 */
export async function recognizeText(uri: string): Promise<string | null> {
  try {
    const result = await TextRecognition.recognize(uri);
    const lines: PositionedLine[] = result.blocks.flatMap((block) =>
      block.lines
        .filter((line) => line.frame)
        .map((line) => ({ text: line.text, top: line.frame!.top, height: line.frame!.height, left: line.frame!.left })),
    );
    return lines.length ? rowsFromLines(lines).join('\n') : result.text;
  } catch {
    return null;
  }
}

export const OCR_AVAILABLE = true;
