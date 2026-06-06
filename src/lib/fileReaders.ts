import JSZip from 'jszip';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { MessageAttachment } from '../types';

const maxExtractedTextLength = 24_000;
const officeTextNamespaces = ['a:t', 'w:t', 't'];

export async function createDocumentAttachment(file: File): Promise<MessageAttachment> {
  const baseAttachment = createBaseAttachment(file, 'document');

  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const buffer = await file.arrayBuffer();
      const [text, dataUrl] = await Promise.all([extractPdfText(buffer), fileToDataUrl(file)]);
      return {
        ...baseAttachment,
        status: 'ready',
        extractedText: text,
        dataUrl,
        base64: dataUrlToBase64(dataUrl),
      };
    }

    const extractedText = await extractDocumentText(file);
    return {
      ...baseAttachment,
      status: 'ready',
      extractedText,
    };
  } catch (error) {
    return {
      ...baseAttachment,
      status: 'error',
      error: error instanceof Error ? error.message : 'Không đọc được tệp này.',
    };
  }
}

export async function createImageAttachment(file: File): Promise<MessageAttachment> {
  const baseAttachment = createBaseAttachment(file, 'image');

  try {
    const dataUrl = await fileToDataUrl(file);
    return {
      ...baseAttachment,
      status: 'ready',
      dataUrl,
      base64: dataUrlToBase64(dataUrl),
      previewUrl: dataUrl,
    };
  } catch (error) {
    return {
      ...baseAttachment,
      status: 'error',
      error: error instanceof Error ? error.message : 'Không đọc được ảnh này.',
    };
  }
}

export function buildAttachmentPrompt(attachments: MessageAttachment[]) {
  const readyDocuments = attachments.filter(
    (attachment) => attachment.kind === 'document' && attachment.status === 'ready',
  );
  if (!readyDocuments.length) return '';

  return readyDocuments
    .map((attachment, index) => {
      const extractedText = attachment.extractedText?.trim();
      if (!extractedText) {
        return [
          `[Tệp ${index + 1}: ${attachment.name}]`,
          'Không trích được nội dung text tự động. Nếu đây là PDF scan hoặc file nhiều hình, hãy xem tệp đính kèm trực tiếp khi API hỗ trợ.',
        ].join('\n');
      }

      return [
        `[Tệp ${index + 1}: ${attachment.name}]`,
        `Loại: ${attachment.mimeType || 'không rõ'}, dung lượng: ${formatFileSize(attachment.size)}`,
        'Nội dung trích xuất:',
        extractedText,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createBaseAttachment(file: File, kind: MessageAttachment['kind']): MessageAttachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    kind,
    status: 'processing',
  };
}

async function extractDocumentText(file: File) {
  const lowerName = file.name.toLowerCase();

  if (isPlainTextFile(file, lowerName)) {
    return limitExtractedText(await file.text());
  }

  if (lowerName.endsWith('.docx')) {
    const zip = await JSZip.loadAsync(file);
    const files = Object.values(zip.files).filter(
      (entry) => entry.name.startsWith('word/') && entry.name.endsWith('.xml'),
    );
    return extractTextFromXmlFiles(files, ['w:t']);
  }

  if (lowerName.endsWith('.pptx')) {
    const zip = await JSZip.loadAsync(file);
    const files = Object.values(zip.files)
      .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
      .sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true }));
    return extractTextFromXmlFiles(files, ['a:t']);
  }

  if (lowerName.endsWith('.xlsx')) {
    return extractXlsxText(file);
  }

  throw new Error('Định dạng này chưa hỗ trợ trích nội dung. Hãy thử PDF, DOCX, PPTX, XLSX, CSV hoặc TXT.');
}

async function extractPdfText(buffer: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ');
    pages.push(`Trang ${pageNumber}: ${pageText}`);

    if (pages.join('\n\n').length >= maxExtractedTextLength) break;
  }

  const text = pages.join('\n\n').trim();
  return limitExtractedText(text || 'Không tìm thấy text trong PDF này.');
}

async function extractXlsxText(file: File) {
  const zip = await JSZip.loadAsync(file);
  const sharedStrings = await readSharedStrings(zip);
  const sheetFiles = Object.values(zip.files)
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true }));
  const sheets: string[] = [];

  for (const [index, sheetFile] of sheetFiles.entries()) {
    const xml = await sheetFile.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const rows = Array.from(doc.getElementsByTagName('row')).slice(0, 120);
    const rowLines = rows
      .map((row) => {
        const values = Array.from(row.getElementsByTagName('c'))
          .map((cell) => readCellValue(cell, sharedStrings))
          .filter((value) => value.length > 0);
        return values.join('\t');
      })
      .filter(Boolean);

    if (rowLines.length) {
      sheets.push(`Sheet ${index + 1}\n${rowLines.join('\n')}`);
    }

    if (sheets.join('\n\n').length >= maxExtractedTextLength) break;
  }

  return limitExtractedText(sheets.join('\n\n') || 'Không tìm thấy dữ liệu text trong XLSX này.');
}

async function readSharedStrings(zip: JSZip) {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];

  const xml = await file.async('text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((node) => node.textContent ?? '')
      .join(''),
  );
}

function readCellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute('t');
  const inlineString = Array.from(cell.getElementsByTagName('t'))
    .map((node) => node.textContent ?? '')
    .join('');

  if (inlineString) return inlineString;

  const rawValue = cell.getElementsByTagName('v')[0]?.textContent?.trim() ?? '';
  if (!rawValue) return '';
  if (type === 's') return sharedStrings[Number(rawValue)] ?? rawValue;
  return rawValue;
}

async function extractTextFromXmlFiles(files: JSZip.JSZipObject[], tags: string[]) {
  const chunks: string[] = [];

  for (const file of files) {
    const xml = await file.async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const text = tags.flatMap((tag) =>
      Array.from(doc.getElementsByTagName(tag)).map((node) => node.textContent ?? ''),
    );

    if (!text.length) {
      const fallbackText = officeTextNamespaces.flatMap((tag) =>
        Array.from(doc.getElementsByTagName(tag)).map((node) => node.textContent ?? ''),
      );
      chunks.push(...fallbackText);
    } else {
      chunks.push(...text);
    }

    if (chunks.join(' ').length >= maxExtractedTextLength) break;
  }

  const normalized = chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .join(' ');

  return limitExtractedText(normalized || 'Không tìm thấy text trong tệp này.');
}

function isPlainTextFile(file: File, lowerName: string) {
  return (
    file.type.startsWith('text/') ||
    ['.txt', '.md', '.csv', '.json', '.log'].some((extension) => lowerName.endsWith(extension))
  );
}

function limitExtractedText(text: string) {
  const trimmed = text.replace(/\s+\n/g, '\n').trim();
  if (trimmed.length <= maxExtractedTextLength) return trimmed;
  return `${trimmed.slice(0, maxExtractedTextLength)}\n\n[Đã rút gọn nội dung vì tệp quá dài.]`;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Không đọc được dữ liệu file.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được dữ liệu file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.split(',')[1] ?? '';
}
