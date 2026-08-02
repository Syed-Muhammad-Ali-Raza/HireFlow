import pdf from 'pdf-parse';

/**
 * Extracts plain text from a PDF file buffer.
 * Runs on the server-side only.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF file. Ensure it is a valid PDF document.');
  }
}
