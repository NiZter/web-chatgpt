import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  FileUp,
  Image,
  ListChecks,
  MessageSquareText,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Settings,
  Sparkles,
  Target,
  WandSparkles,
  X,
  LogOut,
  LockKeyhole,
  Eye,
} from 'lucide-react';
import remarkGfm from 'remark-gfm';
import { defaultModelId, modelOptions } from './data/models';
import { getTaskSkillInstruction } from './data/taskSkills';
import { taskTemplates } from './data/tasks';
import {
  buildAttachmentPrompt,
  createDocumentAttachment,
  createImageAttachment,
  formatFileSize,
} from './lib/fileReaders';
import {
  createDocxArtifact,
  createDocxArtifactFromRequest,
  createImageArtifact,
  createPdfArtifact,
  createPdfArtifactFromRequest,
  createTextArtifact,
  downloadImageArtifact,
  downloadDocxArtifact,
  downloadPdfArtifact,
  downloadTextArtifact,
} from './lib/documentArtifacts';
import { loadTaskSkill, type LoadedTaskSkill } from './lib/skillClient';
import { generateImageRequest, sendAssistantRequest } from './lib/openaiClient';
import type { AssistantSettings, Message, MessageArtifact, MessageAttachment, ModelOption, TaskTemplate } from './types';

type SpeechRecognitionEventResult = {
  isFinal: boolean;
  [index: number]: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionEventResult>;
};

type SpeechRecognitionLike = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

type DemoAccount = {
  username: string;
  password: string;
  displayName: string;
};

type GuestSession = {
  username: 'demo';
  displayName: 'Demo';
};

type ComposerMode = 'chat' | 'image';

type StoredAuthSession = {
  username: string;
  expiresAt: number;
};

const demoAccounts: DemoAccount[] = [
  { username: 'cholo', password: 'cholo040312', displayName: 'cholo' },
  { username: 'xoisuon', password: 'thaonguyen1002', displayName: 'xoisuon' },
];
const authStorageKey = 'web-chatgpt-active-user';
const authSessionDurationMs = 24 * 60 * 60 * 1000;

const initialMessages: Message[] = [
  {
    id: 'welcome',
    role: 'assistant',
    createdAt: new Date().toISOString(),
    meta: 'Sẵn sàng',
    content:
      'Chào bạn. Chọn một tác vụ bên phải hoặc nhập thẳng vào ô chat. Mình có thể giúp học tập, email, tóm tắt, dịch, lập kế hoạch và công việc hằng ngày.',
  },
];

const toneOptions = ['Thân thiện', 'Chuyên nghiệp', 'Ngắn gọn', 'Dễ hiểu'];
const lengthOptions = ['Ngắn', 'Vừa đủ', 'Chi tiết'];
const featuredTaskIds = ['general-chat', 'summary', 'email', 'translate-edit'];
const maxAttachmentBytes = 10 * 1024 * 1024;
const documentAccept =
  '.pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/*';
const reasoningLabels: Record<AssistantSettings['reasoningEffort'], string> = {
  none: 'Không dùng',
  low: 'Nhanh',
  medium: 'Cân bằng',
  high: 'Kỹ',
  xhigh: 'Rất kỹ',
};
const taskCategoryOrder: TaskTemplate['category'][] = ['Học tập', 'Viết', 'Công việc', 'Phân tích'];
const imageGenerationModelLabel = 'GPT Image 2';
const maxSkillReferenceChars = 6000;
function toSkillCommand(skillId: string) {
  return `$${skillId}`;
}

function limitPromptSection(value: string, maxChars: number) {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}\n\n[Đã rút gọn phần tham khảo skill local.]`;
}

function readStoredAuthSession(): StoredAuthSession | null {
  if (typeof window === 'undefined') return null;

  const rawValue = window.localStorage.getItem(authStorageKey);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredAuthSession>;
    if (typeof parsed.username !== 'string' || typeof parsed.expiresAt !== 'number') {
      throw new Error('Invalid auth session');
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(authStorageKey);
      return null;
    }

    return {
      username: parsed.username,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

function writeStoredAuthSession(username: string) {
  const session: StoredAuthSession = {
    username,
    expiresAt: Date.now() + authSessionDurationMs,
  };
  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

function App() {
  const [activeUser, setActiveUser] = useState<DemoAccount | GuestSession | null>(() => {
    const session = readStoredAuthSession();
    return demoAccounts.find((account) => account.username === session?.username) ?? null;
  });
  const isDemoMode = activeUser?.username === 'demo';
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadedSkill, setLoadedSkill] = useState<LoadedTaskSkill | null>(null);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>('chat');
  const [settings, setSettings] = useState<AssistantSettings>({
    model: defaultModelId,
    taskId: 'general-chat',
    tone: 'Thân thiện',
    outputLength: 'Vừa đủ',
    reasoningEffort: 'xhigh',
    useWeb: false,
    citations: true,
  });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const activeTask = useMemo(
    () => taskTemplates.find((task) => task.id === settings.taskId) ?? taskTemplates[0],
    [settings.taskId],
  );

  const activeModel = useMemo(
    () => modelOptions.find((model) => model.id === settings.model) ?? modelOptions[0],
    [settings.model],
  );
  const activeSkill = useMemo(
    () => getTaskSkillInstruction(activeTask.skillId),
    [activeTask.skillId],
  );
  const effectiveSkill = loadedSkill?.id === activeTask.skillId ? loadedSkill : activeSkill;
  const activeSkillCommand = useMemo(() => toSkillCommand(activeSkill.id), [activeSkill.id]);
  const skillSourceLabel =
    loadedSkill?.id === activeTask.skillId && loadedSkill.source === 'local-skill-md'
      ? loadedSkill.truncated
        ? 'SKILL.md local, đã rút gọn'
        : 'SKILL.md local'
      : 'fallback';

  const featuredTasks = useMemo(
    () =>
      featuredTaskIds
        .map((id) => taskTemplates.find((task) => task.id === id))
        .filter((task): task is TaskTemplate => Boolean(task)),
    [],
  );
  const groupedTasks = useMemo(
    () =>
      taskCategoryOrder
        .map((category) => ({
          category,
          tasks: taskTemplates.filter((task) => task.category === category),
          labelId: `task-group-${category
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')}`,
        }))
        .filter((group) => group.tasks.length > 0),
    [],
  );
  const assistantMessages = messages.filter(
    (message) => message.role === 'assistant' && message.id !== 'welcome',
  );
  const lastAssistant = assistantMessages[assistantMessages.length - 1];
  const lastAssistantHasImage = Boolean(
    lastAssistant?.artifacts?.some((artifact) => artifact.kind === 'image'),
  );
  const visibleMessages = messages.filter((message) => message.id !== 'welcome');
  const hasConversation = visibleMessages.length > 0;
  const readyAttachments = attachments.filter((attachment) => attachment.status === 'ready');
  const hasPendingAttachments = attachments.some((attachment) => attachment.status === 'processing');
  const canSubmit =
    (composerMode === 'image' ? Boolean(prompt.trim()) : Boolean(prompt.trim() || readyAttachments.length)) &&
    !isSending &&
    !hasPendingAttachments &&
    !isDemoMode;
  const browserSupportsSpeechRecognition =
    typeof window !== 'undefined' &&
    Boolean(
      (window as WindowWithSpeechRecognition).SpeechRecognition ||
        (window as WindowWithSpeechRecognition).webkitSpeechRecognition,
    );

  function handleLogin(username: string, password: string) {
    const account = demoAccounts.find(
      (item) => item.username === username.trim() && item.password === password,
    );
    if (!account) return false;
    writeStoredAuthSession(account.username);
    setActiveUser(account);
    return true;
  }

  function handleDemoPreview() {
    window.localStorage.removeItem(authStorageKey);
    recognitionRef.current?.stop();
    setIsListening(false);
    setActiveUser({ username: 'demo', displayName: 'Demo' });
    setMessages(initialMessages);
    setPrompt('');
    setAttachments([]);
    setAttachmentNotice('');
    setSettingsOpen(false);
    setComposerMode('chat');
  }

  function handleLogout() {
    window.localStorage.removeItem(authStorageKey);
    recognitionRef.current?.stop();
    setIsListening(false);
    setActiveUser(null);
    setMessages(initialMessages);
    setPrompt('');
    setAttachments([]);
    setAttachmentNotice('');
    setSettingsOpen(false);
  }

  useEffect(() => {
    if (!activeUser) return undefined;
    if (isDemoMode) return undefined;

    const session = readStoredAuthSession();
    if (!session || session.username !== activeUser.username) {
      handleLogout();
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      handleLogout();
    }, Math.max(session.expiresAt - Date.now(), 0));

    return () => window.clearTimeout(timeout);
  }, [activeUser, isDemoMode]);

  useEffect(() => {
    let cancelled = false;
    setLoadedSkill(null);
    void loadTaskSkill(activeTask.skillId, activeTask.skillLabel).then((skill) => {
      if (!cancelled) {
        setLoadedSkill(skill);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTask.skillId, activeTask.skillLabel]);

  function updateSettings(patch: Partial<AssistantSettings>) {
    if (isDemoMode) {
      setAttachmentNotice('Chế độ demo chỉ cho tham quan giao diện. Hãy đăng nhập để dùng chức năng này.');
      return;
    }
    setSettings((current) => ({ ...current, ...patch }));
  }

  function selectTask(task: TaskTemplate) {
    setSettings((current) => ({ ...current, taskId: task.id }));
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function addFiles(files: FileList | null, kind: MessageAttachment['kind']) {
    if (isDemoMode) {
      setAttachmentNotice('Chế độ demo không đọc tệp. Hãy đăng nhập để dùng chức năng này.');
      return;
    }
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;

    setAttachmentNotice('');

    for (const file of selectedFiles) {
      if (file.size > maxAttachmentBytes) {
        setAttachmentNotice(`${file.name} vượt quá giới hạn 10 MB.`);
        continue;
      }

      const pendingAttachment: MessageAttachment = {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        size: file.size,
        kind,
        status: 'processing',
      };

      setAttachments((current) => [...current, pendingAttachment]);

      const parsedAttachment =
        kind === 'image' ? await createImageAttachment(file) : await createDocumentAttachment(file);

      setAttachments((current) =>
        current.map((attachment) =>
          attachment.id === pendingAttachment.id
            ? { ...parsedAttachment, id: pendingAttachment.id }
            : attachment,
        ),
      );
    }

    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function removeAttachment(attachmentId: string) {
    if (isDemoMode) return;
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function toggleSpeechInput() {
    if (isDemoMode) {
      setAttachmentNotice('Chế độ demo không dùng microphone. Hãy đăng nhập để dùng chức năng này.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as WindowWithSpeechRecognition).SpeechRecognition ||
      (window as WindowWithSpeechRecognition).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setAttachmentNotice('Trình duyệt này chưa hỗ trợ nhập giọng nói.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      if (transcript) {
        setPrompt((current) => `${current}${current.trim() ? ' ' : ''}${transcript}`);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      setAttachmentNotice('Không ghi âm được. Hãy kiểm tra quyền microphone của trình duyệt.');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setAttachmentNotice('');
    setIsListening(true);
  }

  async function submitPrompt() {
    const trimmedPrompt = prompt.trim();
    if (isDemoMode) {
      setAttachmentNotice('Chế độ demo không gửi nội dung. Hãy đăng nhập để dùng chức năng này.');
      return;
    }
    if (!canSubmit) return;

    const currentAttachments = readyAttachments;
    const attachmentPrompt = buildAttachmentPrompt(currentAttachments);
    const requestPrompt = [trimmedPrompt, attachmentPrompt].filter(Boolean).join('\n\n');
    const displayPrompt =
      trimmedPrompt ||
      (currentAttachments.length
        ? `Đã gửi ${currentAttachments.length} tệp đính kèm để xử lý.`
        : '');

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayPrompt,
      modelContent: requestPrompt,
      createdAt: new Date().toISOString(),
      meta: `${activeSkillCommand} ${activeTask.title}`,
      attachments: currentAttachments,
    };

    setIsSending(true);
    setMessages((current) => [...current, userMessage]);

    try {
      setPrompt('');
      setAttachments([]);

      if (composerMode === 'image') {
        const response = await generateImageRequest({ prompt: trimmedPrompt });
        const imageArtifact = createImageArtifact({
          dataUrl: response.imageUrl,
          prompt: trimmedPrompt,
        });

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Đã tạo ảnh theo mô tả của bạn. Bấm **Tải ảnh PNG** để lưu về máy.`,
            createdAt: new Date().toISOString(),
            meta: response.source === 'api' ? response.model : `${imageGenerationModelLabel} demo`,
            artifacts: [imageArtifact],
          },
        ]);
        return;
      }

      const skillForRequest = await loadTaskSkill(activeTask.skillId, activeTask.skillLabel);
      const response = await sendAssistantRequest({
        prompt: requestPrompt,
        messages: [...messages, userMessage],
        attachments: currentAttachments,
        settings,
        taskInstruction: buildAssistantTaskInstruction(activeTask, skillForRequest),
        userKey: activeUser?.username ?? undefined,
      });
      const requestedArtifacts = [
        createDocxArtifactFromRequest(trimmedPrompt, response.text, currentAttachments),
        createPdfArtifactFromRequest(trimmedPrompt, response.text, currentAttachments),
      ].filter((artifact): artifact is MessageArtifact => Boolean(artifact));
      const artifactNotice =
        requestedArtifacts.length > 0
          ? `\n\nMình đã tạo file ${requestedArtifacts
              .map((artifact) => `**${artifact.filename}**`)
              .join(', ')}. Bấm nút tải bên dưới để lưu file.`
          : '';

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${response.text}${artifactNotice}`,
          createdAt: new Date().toISOString(),
          meta: response.source === 'api' ? activeModel.label : 'Bản demo',
          artifacts: requestedArtifacts.length ? requestedArtifacts : undefined,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            error instanceof Error
              ? `Mình chưa gửi được yêu cầu. Chi tiết: ${error.message}\n\nNội dung của bạn vẫn còn trong ô chat để thử lại.`
              : 'Mình chưa gửi được yêu cầu. Nội dung của bạn vẫn còn trong ô chat để thử lại.',
          createdAt: new Date().toISOString(),
          meta: 'Có thể thử lại',
        },
      ]);
      setPrompt(trimmedPrompt);
      setAttachments(currentAttachments);
    } finally {
      setIsSending(false);
    }
  }

  function buildAssistantTaskInstruction(task: TaskTemplate, skill: LoadedTaskSkill) {
    const fallbackSkill = getTaskSkillInstruction(task.skillId);
    const localSkillReference =
      skill.source === 'local-skill-md'
        ? [
            '',
            'Tham khảo skill local, chỉ dùng các phần liên quan trực tiếp đến cách trả lời người dùng:',
            limitPromptSection(skill.instruction, maxSkillReferenceChars),
          ].join('\n')
        : '';

    return [
      `Tác vụ: ${task.title}`,
      `Mục tiêu tác vụ: ${task.description}`,
      `Skill áp dụng: ${skill.label} (${skill.id})`,
      `Nguồn skill: ${skill.source === 'local-skill-md' ? 'SKILL.md local, đã lọc theo ngữ cảnh web chat' : 'fallback rút gọn'}`,
      '',
      'Playbook trả lời ưu tiên:',
      fallbackSkill.instruction,
      '',
      `Mẫu định dạng người dùng mong đợi: ${task.prompt}`,
      localSkillReference,
      '',
      'Lưu ý khi dùng skill local:',
      '- Chỉ lấy nguyên tắc chuyên môn phù hợp với câu hỏi.',
      '- Bỏ qua các bước dành cho Codex/CLI/dev như đọc workspace, chạy shell, tạo thư mục, gọi script hoặc dùng công cụ ngoài web chat.',
      '- Nếu skill local mâu thuẫn với playbook ưu tiên hoặc ràng buộc web app, dùng playbook ưu tiên.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function copyLastAnswer() {
    if (isDemoMode) return;
    if (!lastAssistant) return;
    await navigator.clipboard.writeText(lastAssistant.content);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 1400);
  }

  async function downloadArtifact(artifact: MessageArtifact) {
    if (isDemoMode) return;
    if (artifact.kind === 'image') {
      await downloadImageArtifact(artifact);
      return;
    }

    if (artifact.kind === 'docx') {
      await downloadDocxArtifact(artifact);
      return;
    }

    if (artifact.kind === 'txt') {
      downloadTextArtifact(artifact);
      return;
    }

    if (artifact.kind === 'pdf') {
      await downloadPdfArtifact(artifact);
    }
  }

  async function downloadLastAnswerAsTxt() {
    if (isDemoMode) return;
    if (!lastAssistant) return;
    await downloadArtifact(createTextArtifact(lastAssistant.content));
  }

  async function downloadLastAnswerAsDocx() {
    if (isDemoMode) return;
    if (!lastAssistant) return;
    await downloadArtifact(createDocxArtifact(lastAssistant.content));
  }

  async function downloadLastAnswerAsPdf() {
    if (isDemoMode) return;
    if (!lastAssistant) return;
    await downloadArtifact(createPdfArtifact(lastAssistant.content));
  }

  function newChat() {
    if (isDemoMode) {
      setAttachmentNotice('Chế độ demo không tạo phiên chat mới. Hãy đăng nhập để dùng chức năng này.');
      return;
    }
    setMessages(initialMessages);
    setPrompt('');
    setAttachments([]);
    setAttachmentNotice('');
    setComposerMode('chat');
    recognitionRef.current?.stop();
    setIsListening(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  if (!activeUser) {
    return <LoginPage onLogin={handleLogin} onDemoPreview={handleDemoPreview} />;
  }

  return (
    <div className={`app-shell ${isDemoMode ? 'is-demo-mode' : ''}`}>
      <main className="workspace">
        <header className="topbar">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </div>
            <div>
              <strong>Trợ lý OpenAI</strong>
              <span>Soạn, tóm tắt, dịch và học trong một phiên làm việc</span>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="user-chip" aria-label={`Đang đăng nhập: ${activeUser.displayName}`}>
              <span>{activeUser.displayName.slice(0, 1).toUpperCase()}</span>
              <strong>{activeUser.displayName}</strong>
            </div>
            <button className="toolbar-button" type="button" disabled={isDemoMode} onClick={newChat}>
              <Plus size={17} />
              <span className="toolbar-label">Chat mới</span>
            </button>
            <ModelSelect
              value={settings.model}
              disabled={isDemoMode}
              onChange={(model) => updateSettings({ model })}
            />
            <button
              className="toolbar-button"
              type="button"
              disabled={isDemoMode}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={17} />
              <span className="toolbar-label">Thiết lập</span>
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setRightPanelOpen((value) => !value)}
            >
              {rightPanelOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
              <span className="sr-only">Bật tắt bảng tác vụ</span>
            </button>
            <button className="icon-button" type="button" onClick={handleLogout}>
              <LogOut size={18} />
              <span className="sr-only">Đăng xuất</span>
            </button>
          </div>
        </header>

        {isDemoMode && (
          <div className="demo-banner" role="status">
            <Eye size={17} />
            <div>
              <strong>Đang xem demo</strong>
              <span>Chỉ tham quan giao diện. Đăng nhập để gửi chat, tải tệp, dùng microphone hoặc tải kết quả.</span>
            </div>
          </div>
        )}

        <div className="chat-layout">
          <section className="chat-panel" aria-label="Cuộc trò chuyện" aria-labelledby="active-task-title">
            <div className="chat-panel-header">
              <div className="task-focus">
                <div className="task-focus-header">
                  <span>{activeTask.category}</span>
                  <h1 id="active-task-title">{activeTask.title}</h1>
                  <p>{activeTask.description}</p>
                </div>

                <div className="prompt-preview" aria-label="Khung prompt đang dùng">
                  <Target size={17} />
                  <div>
                    <strong>{effectiveSkill.label}</strong>
                    <p>{activeTask.description}</p>
                  </div>
                </div>
              </div>

              <div className="quick-start" aria-label="Tác vụ phổ biến">
                <div className="quick-start-label">
                  <ListChecks size={17} />
                  <span>Tác vụ phổ biến</span>
                </div>
                {featuredTasks.map((task) => (
                  <button
                    className={settings.taskId === task.id ? 'is-selected' : ''}
                    key={task.id}
                    type="button"
                    onClick={() => selectTask(task)}
                  >
                    <task.icon size={16} />
                    {task.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="chat-utility-row">
              <div className="model-context">
                <div>
                  <Bot size={18} />
                  <strong className="skill-command">{activeSkillCommand}</strong>
                  <span>{activeTask.title}</span>
                </div>
                <div>
                  <Clock3 size={18} />
                  <strong>{reasoningLabels[settings.reasoningEffort]}</strong>
                  <span>độ sâu suy luận</span>
                </div>
                <div>
                  <MessageSquareText size={18} />
                  <strong>{visibleMessages.length}</strong>
                  <span>tin trong phiên</span>
                </div>
                <div>
                  <Image size={18} />
                  <strong>{composerMode === 'image' ? imageGenerationModelLabel : activeModel.label}</strong>
                  <span>{composerMode === 'image' ? 'model tạo ảnh' : 'model chat'}</span>
                </div>
              </div>

              <section className="control-strip" aria-label="Cấu hình nhanh">
                <details className="quick-settings">
                  <summary>Tùy chỉnh đầu ra</summary>
                  <div className="quick-settings-body">
                    <div className="segmented" aria-label="Giọng văn">
                      {toneOptions.map((tone) => (
                        <button
                          className={settings.tone === tone ? 'is-selected' : ''}
                          key={tone}
                          type="button"
                          disabled={isDemoMode}
                          onClick={() => updateSettings({ tone })}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>

                    <div className="quick-controls">
                      <label className="select-label">
                        Độ dài
                        <select
                          value={settings.outputLength}
                          disabled={isDemoMode}
                          onChange={(event) => updateSettings({ outputLength: event.target.value })}
                        >
                          {lengthOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>

                      <Toggle
                        checked={settings.useWeb}
                        label="Tìm web"
                        hint="Sẽ dùng khi backend hỗ trợ"
                        disabled={isDemoMode}
                        onChange={(checked) => updateSettings({ useWeb: checked })}
                      />
                      <Toggle
                        checked={settings.citations}
                        label="Trích dẫn"
                        hint="Nguồn sẽ hiện trong câu trả lời khi API hỗ trợ"
                        disabled={isDemoMode}
                        onChange={(checked) => updateSettings({ citations: checked })}
                      />
                    </div>
                  </div>
                </details>
              </section>
            </div>

            <div className="active-skill-banner" aria-label="Skill đang áp dụng trong chat">
              <span className="skill-command">{activeSkillCommand}</span>
              <strong>{activeTask.title}</strong>
              <span>{effectiveSkill.label}</span>
              <em>{skillSourceLabel}</em>
            </div>

            <div className="messages">
              {!hasConversation && (
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">
                    <WandSparkles size={19} />
                  </div>
                  <div>
                    <h2>Bắt đầu bằng một yêu cầu cụ thể</h2>
                    <p>
                      Dán nội dung, mô tả việc cần làm hoặc chọn một tác vụ. Mình sẽ giữ câu trả lời
                      theo đúng khung đang chọn.
                    </p>
                  </div>
                  <div className="example-prompts" aria-label="Gợi ý prompt">
                    {[
                      `Giúp mình ${activeTask.title.toLowerCase()} cho nội dung này:`,
                      'Viết ngắn gọn hơn và giữ giọng tự nhiên.',
                      'Trả kết quả theo gạch đầu dòng dễ dùng lại.',
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        disabled={isDemoMode}
                        onClick={() => {
                          setPrompt(example);
                          window.setTimeout(() => composerRef.current?.focus(), 0);
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibleMessages.map((message) => (
                <article className={`message ${message.role}`} key={message.id}>
                  <div className="avatar" aria-hidden="true">
                    {message.role === 'assistant' ? <WandSparkles size={17} /> : 'B'}
                  </div>
                  <div className="bubble">
                    <div className="message-meta">
                      <strong>{message.role === 'assistant' ? 'Trợ lý' : 'Bạn'}</strong>
                      {message.meta?.startsWith('$') ? (
                        <>
                          <span className="skill-command">{message.meta.split(' ')[0]}</span>
                          <span>{message.meta.replace(/^\S+\s*/, '')}</span>
                        </>
                      ) : (
                        <span>{message.meta}</span>
                      )}
                    </div>
                    {message.content && <MarkdownMessage content={message.content} />}
                    {message.attachments && message.attachments.length > 0 && (
                      <AttachmentPreviewList attachments={message.attachments} />
                    )}
                    {message.artifacts && message.artifacts.length > 0 && (
                      <ArtifactList artifacts={message.artifacts} onDownload={downloadArtifact} />
                    )}
                  </div>
                </article>
              ))}

              {isSending && (
                <article className="message assistant">
                  <div className="avatar" aria-hidden="true">
                    <WandSparkles size={17} />
                  </div>
                  <div className="bubble skeleton-bubble">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              )}
            </div>

            {lastAssistant && (
              <div className="answer-actions" aria-label="Tác vụ với câu trả lời">
                <button type="button" onClick={copyLastAnswer}>
                  {isCopied ? <Check size={16} /> : <Clipboard size={16} />}
                  {isCopied ? 'Đã copy' : 'Copy câu trả lời'}
                </button>
                {!lastAssistantHasImage && (
                  <>
                    <button type="button" onClick={() => void downloadLastAnswerAsTxt()}>
                      <FileUp size={16} />
                      Tải TXT
                    </button>
                    <button type="button" onClick={() => void downloadLastAnswerAsDocx()}>
                      <FileUp size={16} />
                      Tải DOCX
                    </button>
                    <button type="button" onClick={() => void downloadLastAnswerAsPdf()}>
                      <FileUp size={16} />
                      Tải PDF
                    </button>
                  </>
                )}
              </div>
            )}

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt();
              }}
            >
              <input
                ref={documentInputRef}
                className="sr-only"
                type="file"
                multiple
                accept={documentAccept}
                disabled={isDemoMode}
                onChange={(event) => {
                  const { files } = event.currentTarget;
                  void addFiles(files, 'document');
                  event.currentTarget.value = '';
                }}
              />
              <input
                ref={imageInputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/*"
                disabled={isDemoMode}
                onChange={(event) => {
                  const { files } = event.currentTarget;
                  void addFiles(files, 'image');
                  event.currentTarget.value = '';
                }}
              />
              <div className="composer-mode" aria-label="Chọn chế độ gửi">
                <button
                  className={composerMode === 'chat' ? 'is-selected' : ''}
                  type="button"
                  aria-pressed={composerMode === 'chat'}
                  disabled={isDemoMode}
                  onClick={() => setComposerMode('chat')}
                >
                  <MessageSquareText size={16} />
                  Chat
                </button>
                <button
                  className={composerMode === 'image' ? 'is-selected' : ''}
                  type="button"
                  aria-pressed={composerMode === 'image'}
                  disabled={isDemoMode}
                  onClick={() => {
                    setComposerMode('image');
                    setAttachmentNotice('');
                    window.setTimeout(() => composerRef.current?.focus(), 0);
                  }}
                >
                  <Image size={16} />
                  Tạo ảnh
                </button>
                <span>{composerMode === 'image' ? `Tự dùng ${imageGenerationModelLabel}` : activeModel.label}</span>
              </div>
              <textarea
                ref={composerRef}
                value={prompt}
                disabled={isDemoMode}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    void submitPrompt();
                  }
                }}
                placeholder={
                  composerMode === 'image'
                    ? 'Mô tả ảnh muốn tạo, ví dụ: poster sản phẩm phong cách tối giản, nền sáng...'
                    : 'Nhập yêu cầu của bạn...'
                }
                rows={4}
              />
              {attachments.length > 0 && (
                <AttachmentPreviewList attachments={attachments} onRemove={removeAttachment} />
              )}
              {attachmentNotice && <div className="composer-notice">{attachmentNotice}</div>}
              <div className="composer-footer">
                <div className="composer-tools">
                  <button
                    type="button"
                    title="Thêm tệp"
                    aria-label="Thêm tệp"
                    disabled={isDemoMode}
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <FileUp size={17} />
                    <span className="sr-only">Thêm tệp</span>
                  </button>
                  <button
                    type="button"
                    title="Thêm ảnh"
                    aria-label="Thêm ảnh"
                    disabled={isDemoMode}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Image size={17} />
                    <span className="sr-only">Thêm ảnh</span>
                  </button>
                  <button
                    className={isListening ? 'is-active' : ''}
                    type="button"
                    title={isListening ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
                    aria-label={isListening ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
                    aria-pressed={isListening}
                    disabled={isDemoMode}
                    onClick={toggleSpeechInput}
                  >
                    <Mic size={17} />
                    <span className="sr-only">
                      {browserSupportsSpeechRecognition ? 'Nhập bằng giọng nói' : 'Trình duyệt chưa hỗ trợ nhập giọng nói'}
                    </span>
                  </button>
                  <span>
                    {prompt.length} ký tự
                    {attachments.length > 0 ? ` · ${attachments.length} tệp` : ''}
                  </span>
                </div>
                <button className="send-button" type="submit" disabled={!canSubmit}>
                  <Send size={17} />
                  Gửi
                </button>
              </div>
            </form>
          </section>

          {rightPanelOpen && (
            <aside className="task-panel" aria-label="Thư viện tác vụ">
              <div className="panel-heading">
                <div>
                  <span>Tất cả tác vụ</span>
                  <h2>Duyệt theo nhóm việc</h2>
                </div>
                <ListChecks size={20} />
              </div>

              <div className="task-groups">
                {groupedTasks.map((group) => (
                  <section className="task-group" key={group.category} aria-labelledby={group.labelId}>
                    <h3 id={group.labelId}>{group.category}</h3>
                    <div className="task-list">
                      {group.tasks.map((task) => (
                        <button
                          className={`task-item ${settings.taskId === task.id ? 'is-active' : ''}`}
                          key={task.id}
                          type="button"
                          onClick={() => selectTask(task)}
                        >
                          <task.icon size={19} />
                          <span>
                            <strong>{task.title}</strong>
                            <small>{task.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="prompt-card">
                <h3>Skill đang áp dụng</h3>
                <p>
                  <strong>{effectiveSkill.label}</strong>
                </p>
                <p>{effectiveSkill.instruction}</p>
                <h3>Mô tả ngắn</h3>
                <p>{activeTask.description}</p>
              </div>
            </aside>
          )}
        </div>
      </main>

      {settingsOpen && (
        <SettingsDrawer
          activeModel={activeModel}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onUpdate={updateSettings}
        />
      )}
    </div>
  );
}

function LoginPage({
  onLogin,
  onDemoPreview,
}: {
  onLogin: (username: string, password: string) => boolean;
  onDemoPreview: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    usernameInputRef.current?.focus();
  }, []);

  function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = onLogin(username, password);
    if (!ok) {
      setError('Tài khoản hoặc mật khẩu không đúng.');
      return;
    }
    setError('');
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Trợ lý OpenAI</strong>
            <span>Đăng nhập để tiếp tục phiên làm việc</span>
          </div>
        </div>

        <div className="login-copy">
          <h1 id="login-title">Đăng nhập</h1>
          <p>Chọn đúng tài khoản đã cấp để mở không gian chat và các skill tác vụ.</p>
        </div>

        <form className="login-form" onSubmit={submitLogin}>
          <label htmlFor="username">Tài khoản</label>
          <div className="login-field">
            <Bot size={17} />
            <input
              ref={usernameInputRef}
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setError('');
              }}
              placeholder="Nhập tài khoản"
            />
          </div>

          <label htmlFor="password">Mật khẩu</label>
          <div className="login-field">
            <LockKeyhole size={17} />
            <input
              id="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              placeholder="Nhập mật khẩu"
            />
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button className="login-button" type="submit">
            <Sparkles size={17} />
            Đăng nhập
          </button>
        </form>

        <button className="login-demo-button" type="button" onClick={onDemoPreview}>
          <Eye size={17} />
          Xem demo trang web
        </button>

      </section>
    </main>
  );
}

function ModelSelect({
  value,
  disabled = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = modelOptions.find((model) => model.id === value) ?? modelOptions[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="model-select" ref={containerRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <Bot size={17} />
        <span>Tự động: {selected.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="model-menu" role="listbox" aria-label="Chọn model">
          {modelOptions.map((model) => (
            <button
              className={model.id === value ? 'is-selected' : ''}
              key={model.id}
              role="option"
              aria-selected={model.id === value}
              type="button"
              onClick={() => {
                onChange(model.id);
                setOpen(false);
              }}
            >
              <span>
                <strong>{model.label}</strong>
                <small>{model.description}</small>
              </span>
              <em>{model.cost}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  label,
  hint,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-control" aria-hidden="true" />
      <span className="toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function SettingsDrawer({
  activeModel,
  settings,
  onClose,
  onUpdate,
}: {
  activeModel: ModelOption;
  settings: AssistantSettings;
  onClose: () => void;
  onUpdate: (patch: Partial<AssistantSettings>) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const drawer = closeButtonRef.current?.closest('.settings-drawer');
      if (!drawer) return;

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), summary, [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <span>Cài đặt trợ lý</span>
            <h2 id="settings-title">Model và cách trả lời</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose}>
            <X size={19} />
            <span className="sr-only">Đóng thiết lập</span>
          </button>
        </div>

        <div className="setting-block">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={settings.model}
            onChange={(event) => onUpdate({ model: event.target.value })}
          >
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <p>Đang để app tự chọn theo tác vụ. Bạn vẫn có thể ghim model nếu cần kiểm soát chi phí hoặc chất lượng.</p>
          <p>{activeModel.description}</p>
        </div>

        <div className="setting-block">
          <label htmlFor="reasoning">Mức suy luận</label>
          <select
            id="reasoning"
            value={settings.reasoningEffort}
            disabled={!activeModel.supportsReasoning}
            onChange={(event) =>
              onUpdate({ reasoningEffort: event.target.value as AssistantSettings['reasoningEffort'] })
            }
          >
            <option value="none">Không dùng</option>
            <option value="low">Nhanh</option>
            <option value="medium">Cân bằng</option>
            <option value="high">Kỹ</option>
            <option value="xhigh">Rất kỹ</option>
          </select>
          <p>
            Dùng mức cao cho bài khó, phân tích dài hoặc lập kế hoạch nhiều bước.
          </p>
        </div>

        <details className="api-instructions">
          <summary>Dành cho người triển khai API</summary>
          <p>
            Tạo backend route <code>/api/openai/responses</code> và <code>/api/openai/images</code>, giữ API key ở server, rồi đặt{' '}
            <code>VITE_USE_MOCK_RESPONSES=false</code>. UI sẽ gọi payload từ{' '}
            <code>src/lib/openaiClient.ts</code>.
          </p>
        </details>
      </aside>
    </div>
  );
}

function AttachmentPreviewList({
  attachments,
  onRemove,
}: {
  attachments: MessageAttachment[];
  onRemove?: (attachmentId: string) => void;
}) {
  return (
    <div className="attachment-list" aria-label="Tệp đính kèm">
      {attachments.map((attachment) => (
        <div className={`attachment-chip ${attachment.status}`} key={attachment.id}>
          {attachment.kind === 'image' && attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" />
          ) : attachment.kind === 'image' ? (
            <Image size={18} />
          ) : (
            <FileUp size={18} />
          )}
          <span>
            <strong>{attachment.name}</strong>
            <small>
              {attachment.status === 'processing'
                ? 'Đang đọc...'
                : attachment.status === 'error'
                  ? attachment.error
                  : `${attachment.kind === 'image' ? 'Ảnh' : 'Tệp'} · ${formatFileSize(attachment.size)}`}
            </small>
          </span>
          {onRemove && (
            <button type="button" aria-label={`Gỡ ${attachment.name}`} onClick={() => onRemove(attachment.id)}>
              <X size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ArtifactList({
  artifacts,
  onDownload,
}: {
  artifacts: MessageArtifact[];
  onDownload: (artifact: MessageArtifact) => void;
}) {
  return (
    <div className="artifact-list" aria-label="File đã tạo">
      {artifacts.map((artifact) => (
        <div className={`artifact-item ${artifact.kind}`} key={artifact.id}>
          {artifact.kind === 'image' && (
            <img className="generated-image" src={artifact.content} alt={artifact.prompt || 'Ảnh tạo bởi AI'} />
          )}
          <button type="button" onClick={() => void onDownload(artifact)}>
            <FileUp size={16} />
            {artifact.kind === 'image' ? 'Tải ảnh PNG' : `Tải ${artifact.filename}`}
          </button>
        </div>
      ))}
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default App;
