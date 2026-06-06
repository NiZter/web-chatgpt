import {
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  Languages,
  Lightbulb,
  Mail,
  NotebookPen,
  Presentation,
  Table2,
} from 'lucide-react';
import type { TaskTemplate } from '../types';

export const taskTemplates: TaskTemplate[] = [
  {
    id: 'general-chat',
    title: 'Hỏi đáp nhanh',
    description: 'Trả lời dễ hiểu, có ví dụ khi cần.',
    category: 'Học tập',
    icon: Lightbulb,
    skillId: 'prompt-api',
    skillLabel: 'Prompt API',
    prompt: 'Trả lời ngắn gọn, dễ hiểu. Nếu có bước làm, hãy trình bày theo từng bước:',
  },
  {
    id: 'study-helper',
    title: 'Trợ giảng học tập',
    description: 'Giải thích bài, tạo dàn ý, đặt câu hỏi ôn tập.',
    category: 'Học tập',
    icon: GraduationCap,
    skillId: 'content-research-writer',
    skillLabel: 'Content Research Writer',
    prompt:
      'Hãy đóng vai trợ giảng. Giải thích dễ hiểu, có ví dụ, sau đó tạo 3 câu hỏi tự kiểm tra:',
  },
  {
    id: 'summary',
    title: 'Tóm tắt tài liệu',
    description: 'Rút gọn nội dung thành ý chính và việc cần làm.',
    category: 'Công việc',
    icon: FileText,
    skillId: 'writing-assistance-apis',
    skillLabel: 'Writing Assistance',
    prompt:
      'Tóm tắt nội dung sau thành: 5 ý chính, rủi ro hoặc điểm cần chú ý, và việc cần làm tiếp theo:',
  },
  {
    id: 'email',
    title: 'Viết email',
    description: 'Soạn email lịch sự, rõ mục đích, dùng ngữ điệu cân bằng.',
    category: 'Viết',
    icon: Mail,
    skillId: 'email-draft-polish',
    skillLabel: 'Email Draft & Polish',
    prompt:
      'Viết email bằng tiếng Việt, lịch sự và rõ ràng. Gồm tiêu đề, lời chào, nội dung chính và lời kết:',
  },
  {
    id: 'translate-edit',
    title: 'Dịch và sửa câu',
    description: 'Dịch tự nhiên, giữ đúng ý, sửa lỗi diễn đạt.',
    category: 'Viết',
    icon: Languages,
    skillId: 'translator-api-proofreader-api',
    skillLabel: 'Translator + Proofreader',
    prompt:
      'Dịch hoặc sửa đoạn sau cho tự nhiên. Giữ đúng ý, nếu có thuật ngữ thì giải thích ngắn:',
  },
  {
    id: 'meeting',
    title: 'Ghi chú họp',
    description: 'Biến ghi chú rời thành quyết định và việc cần làm.',
    category: 'Công việc',
    icon: NotebookPen,
    skillId: 'meeting-notes-and-actions',
    skillLabel: 'Meeting Notes & Actions',
    prompt:
      'Biến ghi chú sau thành tóm tắt họp: quyết định, việc cần làm, người phụ trách, deadline nếu có:',
  },
  {
    id: 'slides',
    title: 'Dàn ý thuyết trình',
    description: 'Tạo cấu trúc slide, thông điệp và mạch trình bày.',
    category: 'Công việc',
    icon: Presentation,
    skillId: 'presentation-skill',
    skillLabel: 'Presentation Skill',
    prompt:
      'Tạo dàn ý thuyết trình với các slide, thông điệp chính, nội dung ngắn cho từng slide:',
  },
  {
    id: 'data',
    title: 'Phân tích bảng',
    description: 'Đọc dữ liệu, tìm insight, đề xuất bước tiếp theo.',
    category: 'Phân tích',
    icon: Table2,
    skillId: 'spreadsheet-formula-helper',
    skillLabel: 'Spreadsheet Formula Helper',
    prompt:
      'Phân tích dữ liệu hoặc bảng sau. Nếu thiếu dữ liệu, nói rõ giả định. Trả về insight và đề xuất:',
  },
  {
    id: 'career',
    title: 'Công việc & CV',
    description: 'Sửa CV, mô tả kinh nghiệm, chuẩn bị phỏng vấn.',
    category: 'Công việc',
    icon: BriefcaseBusiness,
    skillId: 'tailored-resume-generator',
    skillLabel: 'Tailored Resume Generator',
    prompt:
      'Hỗ trợ công việc hoặc CV. Viết rõ thành tích, tác động, kỹ năng và đề xuất cách nói chuyên nghiệp:',
  },
];
