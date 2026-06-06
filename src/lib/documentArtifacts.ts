import type { MessageArtifact, MessageAttachment } from '../types';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

type DocxModule = typeof import('docx');
type PdfMakeModule = typeof import('pdfmake/build/pdfmake');
type PdfTextRun = string | { text: string; bold?: boolean; italics?: boolean; color?: string };

const pdfIntentPattern = /\b(pdf|\.pdf)\b/i;
const docxIntentPattern = /\b(docx|word|\.docx)\b|clone/i;
const genericFileIntentPattern = /tạo\s+(file|tệp)|xuất\s+(file|tệp)/i;
const chapterOnePattern = /ch(ươ|u)o?ng\s*(i|1)\b|chapter\s*(i|1)\b/i;

export function shouldCreateDocxArtifact(prompt: string, attachments: MessageAttachment[]) {
  const wantsPdfOnly = pdfIntentPattern.test(prompt) && !docxIntentPattern.test(prompt);
  if (wantsPdfOnly) return false;

  return (
    docxIntentPattern.test(prompt) ||
    genericFileIntentPattern.test(prompt) ||
    attachments.some((attachment) => attachment.kind === 'document')
  );
}

export function shouldCreatePdfArtifact(prompt: string) {
  return pdfIntentPattern.test(prompt);
}

export function createDocxArtifactFromRequest(
  prompt: string,
  responseText: string,
  attachments: MessageAttachment[],
): MessageArtifact | null {
  if (!shouldCreateDocxArtifact(prompt, attachments)) return null;

  const { content, wantsChapterOne } = getArtifactContent(prompt, responseText, attachments);
  const filename = wantsChapterOne ? 'chuong-i-clone.docx' : 'tai-lieu-tao-moi.docx';

  return {
    id: crypto.randomUUID(),
    kind: 'docx',
    filename,
    content,
  };
}

export function createPdfArtifactFromRequest(
  prompt: string,
  responseText: string,
  attachments: MessageAttachment[],
): MessageArtifact | null {
  if (!shouldCreatePdfArtifact(prompt)) return null;

  const { content, wantsChapterOne } = getArtifactContent(prompt, responseText, attachments);
  const filename = wantsChapterOne ? 'chuong-i-clone.pdf' : 'tai-lieu-tao-moi.pdf';

  return {
    id: crypto.randomUUID(),
    kind: 'pdf',
    filename,
    content,
  };
}

function getArtifactContent(prompt: string, responseText: string, attachments: MessageAttachment[]) {
  const sourceText = attachments
    .filter((attachment) => attachment.kind === 'document' && attachment.status === 'ready')
    .map((attachment) => attachment.extractedText?.trim())
    .find((text): text is string => Boolean(text));

  const wantsChapterOne = chapterOnePattern.test(prompt);
  const content = wantsChapterOne && sourceText ? extractChapterOne(sourceText) : sourceText || responseText;

  return { content: content.trim() || responseText, wantsChapterOne };
}

export function createTextArtifact(content: string, filename = 'cau-tra-loi.txt'): MessageArtifact {
  return {
    id: crypto.randomUUID(),
    kind: 'txt',
    filename,
    content,
  };
}

export function createDocxArtifact(content: string, filename = 'cau-tra-loi.docx'): MessageArtifact {
  return {
    id: crypto.randomUUID(),
    kind: 'docx',
    filename,
    content,
  };
}

export function createPdfArtifact(content: string, filename = 'cau-tra-loi.pdf'): MessageArtifact {
  return {
    id: crypto.randomUUID(),
    kind: 'pdf',
    filename,
    content,
  };
}

export function downloadTextArtifact(artifact: MessageArtifact) {
  const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, artifact.filename);
}

export async function downloadDocxArtifact(artifact: MessageArtifact) {
  const docx = await import('docx');
  const doc = markdownLikeTextToDocx(artifact.content, docx);
  const blob = await docx.Packer.toBlob(doc);
  downloadBlob(blob, artifact.filename);
}

export async function downloadPdfArtifact(artifact: MessageArtifact) {
  const [pdfMakeModule, vfsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const pdfMakeCandidate = pdfMakeModule as PdfMakeModule & { default?: PdfMakeModule };
  const pdfMake = pdfMakeCandidate.default ?? pdfMakeModule;
  const vfsCandidate = vfsModule as typeof vfsModule & { default?: unknown };
  const virtualFileSystem = vfsCandidate.default ?? vfsModule;
  pdfMake.addVirtualFileSystem(
    virtualFileSystem as Parameters<typeof pdfMake.addVirtualFileSystem>[0],
  );

  const documentDefinition = markdownLikeTextToPdfDefinition(artifact.content);
  const blob = await pdfMake.createPdf(documentDefinition).getBlob();
  downloadBlob(blob, artifact.filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function extractChapterOne(text: string) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => chapterOnePattern.test(line));
  if (startIndex === -1) return text;

  const nextChapterIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) return false;
    return /^(#{1,3}\s*)?(ch(ươ|u)o?ng|chapter)\s+(ii|2|iii|3|iv|4|v|5)\b/i.test(line.trim());
  });

  return lines.slice(startIndex, nextChapterIndex === -1 ? undefined : nextChapterIndex).join('\n').trim();
}

function markdownLikeTextToDocx(content: string, docx: DocxModule) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const children = blocks.flatMap((block) => blockToDocxChildren(block, docx));

  return new docx.Document({
    sections: [
      {
        properties: {},
        children: children.length ? children : [new docx.Paragraph('')],
      },
    ],
  });
}

function markdownLikeTextToPdfDefinition(content: string): TDocumentDefinitions {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const pdfContent = blocks.flatMap(blockToPdfContent);

  return {
    pageSize: 'A4',
    pageMargins: [54, 54, 54, 60],
    content: pdfContent.length ? pdfContent : [{ text: '' }],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 11,
      lineHeight: 1.35,
      color: '#1f2933',
    },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 12], color: '#102a43' },
      h2: { fontSize: 16, bold: true, margin: [0, 10, 0, 8], color: '#243b53' },
      h3: { fontSize: 13, bold: true, margin: [0, 8, 0, 6], color: '#334e68' },
    },
    footer: (currentPage, pageCount) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'right',
      margin: [0, 0, 54, 0],
      fontSize: 8,
      color: '#829ab1',
    }),
  };
}

function blockToPdfContent(block: string): Content[] {
  if (isMarkdownTable(block)) {
    return [tableBlockToPdf(block)];
  }

  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const content: Content[] = [];
  let index = 0;

  while (index < lines.length) {
    const bulletItems: Array<string | PdfTextRun[]> = [];
    while (index < lines.length) {
      const bulletMatch = lines[index].match(/^[-*]\s+(.+)$/);
      if (!bulletMatch) break;
      bulletItems.push(inlinePdfText(bulletMatch[1]));
      index += 1;
    }
    if (bulletItems.length) {
      content.push({ ul: bulletItems, margin: [0, 0, 0, 8] } as Content);
      continue;
    }

    const orderedItems: Array<string | PdfTextRun[]> = [];
    while (index < lines.length) {
      const orderedMatch = lines[index].match(/^\d+[.)]\s+(.+)$/);
      if (!orderedMatch) break;
      orderedItems.push(inlinePdfText(orderedMatch[1]));
      index += 1;
    }
    if (orderedItems.length) {
      content.push({ ol: orderedItems, margin: [0, 0, 0, 8] } as Content);
      continue;
    }

    content.push(lineToPdfContent(lines[index]));
    index += 1;
  }

  return content;
}

function lineToPdfContent(line: string): Content {
  const trimmed = line.trim();
  const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return {
      text: inlinePdfText(headingMatch[2]),
      style: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3',
    } as Content;
  }

  return {
    text: inlinePdfText(trimmed),
    margin: [0, 0, 0, 8],
  } as Content;
}

function inlinePdfText(text: string): string | PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  const tokenPattern = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      runs.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***')) {
      runs.push({ text: token.slice(3, -3), bold: true, italics: true });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push({ text: token.slice(1, -1), italics: true });
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push({ text: token.slice(1, -1), color: '#52606d' });
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(text.slice(lastIndex));
  }

  return runs.length ? runs : text;
}

function tableBlockToPdf(block: string): Content {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((_, index) => index !== 1);
  const rows = lines.map((line, rowIndex) =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => ({
        text: inlinePdfText(cell.trim()),
        bold: rowIndex === 0,
        fillColor: rowIndex === 0 ? '#e6edf5' : undefined,
        margin: [5, 4, 5, 4],
      })),
  );
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const body = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? { text: '', margin: [5, 4, 5, 4] }),
  );

  return {
    table: {
      headerRows: 1,
      widths: Array.from({ length: columnCount }, () => '*'),
      body,
    },
    layout: 'lightHorizontalLines',
    margin: [0, 4, 0, 12],
  } as Content;
}

function blockToDocxChildren(block: string, docx: DocxModule) {
  if (isMarkdownTable(block)) {
    return [tableBlockToDocx(block, docx)];
  }

  return block.split(/\r?\n/).map((line) => lineToParagraph(line, docx));
}

function lineToParagraph(line: string, docx: DocxModule) {
  const trimmed = line.trim();
  const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return new docx.Paragraph({
      heading:
        level === 1
          ? docx.HeadingLevel.HEADING_1
          : level === 2
            ? docx.HeadingLevel.HEADING_2
            : docx.HeadingLevel.HEADING_3,
      children: inlineRuns(headingMatch[2], docx),
    });
  }

  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) {
    return new docx.Paragraph({
      bullet: { level: 0 },
      children: inlineRuns(bulletMatch[1], docx),
    });
  }

  const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
  if (orderedMatch) {
    return new docx.Paragraph({
      numbering: { reference: 'default-numbering', level: 0 },
      children: inlineRuns(orderedMatch[1], docx),
    });
  }

  return new docx.Paragraph({
    children: inlineRuns(trimmed, docx),
  });
}

function inlineRuns(text: string, docx: DocxModule) {
  const runs: InstanceType<DocxModule['TextRun']>[] = [];
  const tokenPattern = /(\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|`.+?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      runs.push(new docx.TextRun(text.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***')) {
      runs.push(new docx.TextRun({ text: token.slice(3, -3), bold: true, italics: true }));
    } else if (token.startsWith('**') && token.endsWith('**')) {
      runs.push(new docx.TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      runs.push(new docx.TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      runs.push(new docx.TextRun({ text: token.slice(1, -1), font: 'Consolas' }));
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(new docx.TextRun(text.slice(lastIndex)));
  }

  return runs.length ? runs : [new docx.TextRun('')];
}

function isMarkdownTable(block: string) {
  const lines = block.split(/\r?\n/).map((line) => line.trim());
  return lines.length >= 2 && lines[0].includes('|') && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1]);
}

function tableBlockToDocx(block: string, docx: DocxModule) {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((_, index) => index !== 1);

  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: lines.map((line, rowIndex) => {
      const cells = line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim());

      return new docx.TableRow({
        children: cells.map(
          (cell) =>
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  alignment: rowIndex === 0 ? docx.AlignmentType.CENTER : docx.AlignmentType.LEFT,
                  children: rowIndex === 0 ? [new docx.TextRun({ text: cell, bold: true })] : inlineRuns(cell, docx),
                }),
              ],
            }),
        ),
      });
    }),
  });
}
