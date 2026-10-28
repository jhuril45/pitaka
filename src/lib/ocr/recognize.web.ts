/** ML Kit has no web build: in the browser a receipt photo is attached without reading it. */
export async function recognizeText(_uri: string): Promise<string | null> {
  return null;
}

export const OCR_AVAILABLE = false;
