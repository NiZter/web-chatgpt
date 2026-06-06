import type { LucideIcon } from 'lucide-react';

export type Role = 'user' | 'assistant' | 'system';

export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'document' | 'image';
  status: 'processing' | 'ready' | 'error';
  extractedText?: string;
  dataUrl?: string;
  base64?: string;
  previewUrl?: string;
  error?: string;
};

export type MessageArtifact = {
  id: string;
  kind: 'docx' | 'txt' | 'pdf';
  filename: string;
  content: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  modelContent?: string;
  createdAt: string;
  meta?: string;
  attachments?: MessageAttachment[];
  artifacts?: MessageArtifact[];
};

export type TaskTemplate = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: 'Học tập' | 'Công việc' | 'Viết' | 'Phân tích';
  icon: LucideIcon;
  skillId: string;
  skillLabel: string;
};

export type ModelOption = {
  id: string;
  label: string;
  description: string;
  bestFor: string;
  cost: 'Tiết kiệm' | 'Cân bằng' | 'Cao cấp';
  supportsReasoning: boolean;
};

export type AssistantSettings = {
  model: string;
  taskId: string;
  tone: string;
  outputLength: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  useWeb: boolean;
  citations: boolean;
};
