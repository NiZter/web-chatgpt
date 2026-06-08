import type { ModelOption } from '../types';

export const modelOptions: ModelOption[] = [
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    description: 'Model mạnh nhất cho tác vụ khó, lập luận sâu, code, phân tích và quy trình dài.',
    bestFor: 'Bài khó, code, chiến lược, báo cáo',
    cost: 'Cao cấp',
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    description: 'Cân bằng giữa chất lượng, tốc độ và chi phí cho tác vụ hằng ngày.',
    bestFor: 'Chat, viết, học, email, tóm tắt',
    cost: 'Cân bằng',
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.4-nano',
    label: 'GPT-5.4 nano',
    description: 'Nhanh và tiết kiệm cho câu hỏi ngắn hoặc chỉnh sửa đơn giản.',
    bestFor: 'Dịch nhanh, sửa câu, ý tưởng ngắn',
    cost: 'Tiết kiệm',
    supportsReasoning: true,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description: 'Lựa chọn chất lượng cao hơn mini, phù hợp cho tác vụ chuyên nghiệp thường xuyên.',
    bestFor: 'Kế hoạch, phân tích, nội dung dài',
    cost: 'Cân bằng',
    supportsReasoning: true,
  },
];

export const defaultModelId = 'gpt-5.5';
