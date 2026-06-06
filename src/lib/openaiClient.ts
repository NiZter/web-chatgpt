import type { AssistantSettings, Message, MessageAttachment, Role } from '../types';

export type AssistantRequest = {
  messages: Message[];
  prompt: string;
  attachments?: MessageAttachment[];
  settings: AssistantSettings;
  taskInstruction: string;
};

export type AssistantResponse = {
  text: string;
  source: 'mock' | 'api';
};

const shouldUseMock =
  import.meta.env.VITE_USE_MOCK_RESPONSES !== 'false' ||
  !import.meta.env.VITE_OPENAI_PROXY_URL;

export async function sendAssistantRequest(request: AssistantRequest): Promise<AssistantResponse> {
  if (shouldUseMock) {
    return mockAssistantResponse(request);
  }

  const response = await fetch(import.meta.env.VITE_OPENAI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toResponsesPayload(request)),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'Không thể gọi API OpenAI.');
  }

  const data = await response.json();
  return {
    text: extractResponseText(data),
    source: 'api',
  };
}

export function toResponsesPayload(request: AssistantRequest) {
  type InputContent =
    | string
    | Array<
        | { type: 'input_text'; text: string }
        | { type: 'input_image'; image_url: string }
        | { type: 'input_file'; filename: string; file_data: string }
      >;

  const payload: {
    model: string;
    input: Array<{
      role: 'system' | 'user' | 'assistant';
      content: InputContent;
    }>;
    reasoning?: { effort: AssistantRequest['settings']['reasoningEffort'] };
    tools?: Array<{ type: 'web_search_preview' }>;
  } = {
    model: request.settings.model,
    input: [
      {
        role: 'system',
        content: [
          'Bạn là trợ lý AI thân thiện, chính xác, trả lời bằng tiếng Việt mặc định.',
          'Luôn áp dụng quy trình skill được cung cấp cho tác vụ hiện tại trước khi trả lời.',
          'Bạn đang chạy trong một web chat, không phải Codex CLI. Không được giả vờ dùng terminal, shell, công cụ, kế hoạch JSON, hoặc nói rằng bạn sẽ kiểm tra workspace.',
          'Khi người dùng gửi tệp đính kèm, nội dung tệp đã được đưa vào tin nhắn nếu đọc được. Hãy xử lý trực tiếp nội dung đó.',
          'Nếu người dùng yêu cầu tạo file, hãy trả về nội dung cuối cùng để UI xuất file; không nói rằng bạn không truy cập được tệp khi nội dung đã nằm trong prompt.',
          request.taskInstruction,
          `Giọng văn: ${request.settings.tone}. Độ dài: ${request.settings.outputLength}.`,
        ].join('\n'),
      },
      ...request.messages
        .filter(
          (
            message,
          ): message is Message & {
            role: Exclude<Role, 'system'>;
          } => message.role !== 'system',
        )
        .map((message, index, conversation) => {
          const isLatestUserMessage = index === conversation.length - 1 && message.role === 'user';
          const textContent = message.modelContent || message.content;
          return {
            role: message.role,
            content: isLatestUserMessage
              ? buildUserContent(request.prompt || textContent, request.attachments ?? message.attachments ?? [])
              : textContent,
          };
        }),
    ],
  };

  if (request.settings.reasoningEffort !== 'none') {
    payload.reasoning = {
      effort: request.settings.reasoningEffort,
    };
  }

  if (request.settings.useWeb) {
    payload.tools = [{ type: 'web_search_preview' }];
  }

  return payload;
}

function buildUserContent(prompt: string, attachments: MessageAttachment[]) {
  const parts: Array<
    | { type: 'input_text'; text: string }
    | { type: 'input_image'; image_url: string }
    | { type: 'input_file'; filename: string; file_data: string }
  > = [{ type: 'input_text', text: prompt || 'Hãy xử lý các tệp đính kèm này.' }];

  for (const attachment of attachments) {
    if (attachment.status !== 'ready') continue;

    if (attachment.kind === 'image' && attachment.dataUrl) {
      parts.push({ type: 'input_image', image_url: attachment.dataUrl });
    }

    if (attachment.kind === 'document' && attachment.mimeType === 'application/pdf' && attachment.dataUrl) {
      parts.push({
        type: 'input_file',
        filename: attachment.name,
        file_data: attachment.dataUrl,
      });
    }
  }

  return parts;
}

function extractResponseText(data: unknown): string {
  if (typeof data === 'object' && data && 'output_text' in data) {
    const outputText = (data as { output_text?: unknown }).output_text;
    if (typeof outputText === 'string' && outputText.trim()) {
      return outputText;
    }
  }

  const output = (data as { output?: Array<{ content?: Array<{ text?: unknown }> }> })?.output;
  const text = output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n\n');

  if (text) return text;

  if (typeof data === 'object' && data && 'text' in data) {
    const textValue = (data as { text?: unknown }).text;
    if (typeof textValue === 'string' && textValue.trim()) {
      return textValue;
    }
  }

  return 'API đã trả về kết quả nhưng adapter chưa nhận diện được định dạng.';
}

async function mockAssistantResponse(request: AssistantRequest): Promise<AssistantResponse> {
  await new Promise((resolve) => window.setTimeout(resolve, 650));

  const latest = request.prompt.trim();
  const taskName =
    request.taskInstruction.match(/^Tác vụ:\s*(.+)$/m)?.[1]?.trim() || 'Tác vụ';
  const skillName =
    request.taskInstruction.match(/^Skill áp dụng:\s*(.+)$/m)?.[1]?.trim() || 'skill tương ứng';
  const webNote = request.settings.useWeb
    ? '\n\nGhi chú: Khi nối API thật, tùy chọn web search sẽ được gửi qua tools.'
    : '';
  const attachmentNote = request.attachments?.length
    ? `\n\nĐã nhận ${request.attachments.length} tệp đính kèm. Bản demo đã đọc nội dung text/preview ở giao diện; khi nối API thật, ảnh và PDF sẽ được gửi cùng request.`
    : '';
  const priorFileContext = findPriorFileContext(request.messages);
  const memoryNote =
    !request.attachments?.length && priorFileContext
      ? '\n\nMình vẫn giữ nội dung tệp đã gửi trước đó trong phiên chat này. Bấm Chat mới sẽ xóa phần nhớ tạm này.'
      : '';

  return {
    source: 'mock',
    text: [
      `Mình đã nhận yêu cầu cho "${taskName}".`,
      `Skill đang áp dụng: ${skillName}.`,
      '',
      'Bạn có thể nối API OpenAI sau. Hiện tại đây là bản demo để kiểm tra giao diện và luồng làm việc.',
      '',
      'Để xử lý yêu cầu này, mình sẽ làm theo khung:',
      '1. Xác định mục tiêu và ngữ cảnh.',
      '2. Tạo bản nháp rõ ý, dễ dùng lại.',
      '3. Nếu cần, đưa thêm phiên bản ngắn gọn hoặc chuyên nghiệp hơn.',
      '',
      latest ? `Nội dung vừa nhập: "${latest.slice(0, 220)}${latest.length > 220 ? '...' : ''}"` : '',
      attachmentNote,
      memoryNote,
      webNote,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function findPriorFileContext(messages: Message[]) {
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'user' && message.modelContent?.includes('[Tệp ')) {
      return message;
    }
  }

  return undefined;
}
