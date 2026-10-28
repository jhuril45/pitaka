import TextRecognition from '@react-native-ml-kit/text-recognition';

/** On-device text recognition (Google ML Kit, works offline). Null when it can't run. */
export async function recognizeText(uri: string): Promise<string | null> {
  try {
    const result = await TextRecognition.recognize(uri);
    return result.text;
  } catch {
    return null;
  }
}

export const OCR_AVAILABLE = true;
