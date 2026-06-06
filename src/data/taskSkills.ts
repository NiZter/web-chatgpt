export type TaskSkillInstruction = {
  id: string;
  label: string;
  instruction: string;
};

const fallbackInstruction = [
  'Xác định mục tiêu của người dùng trước khi trả lời.',
  'Nếu thiếu dữ kiện quan trọng, nêu rõ giả định hoặc hỏi lại ngắn gọn.',
  'Trả lời bằng tiếng Việt tự nhiên, có cấu trúc và dễ dùng lại.',
].join('\n');

export const taskSkillInstructions: Record<string, TaskSkillInstruction> = {
  'prompt-api': {
    id: 'prompt-api',
    label: 'Prompt API',
    instruction: [
      'Áp dụng phong cách Prompt API: trả lời trực tiếp vào yêu cầu chính, không lan man.',
      'Nếu câu hỏi có nhiều bước, chia thành các bước ngắn và nêu kết quả mong đợi ở cuối.',
      'Nếu yêu cầu mơ hồ, đưa ra 1-2 giả định rõ ràng rồi tiếp tục với phương án hữu ích nhất.',
    ].join('\n'),
  },
  'content-research-writer': {
    id: 'content-research-writer',
    label: 'Content Research Writer',
    instruction: [
      'Áp dụng workflow trợ giảng và viết nội dung: giải thích khái niệm bằng ngôn ngữ đơn giản trước.',
      'Dùng ví dụ cụ thể, sau đó tóm lại thành ý chính để người học ghi nhớ.',
      'Kết thúc bằng câu hỏi tự kiểm tra hoặc bước ôn tập tiếp theo khi phù hợp.',
    ].join('\n'),
  },
  'writing-assistance-apis': {
    id: 'writing-assistance-apis',
    label: 'Writing Assistance',
    instruction: [
      'Áp dụng workflow Summarizer/Writer/Rewriter: xác định loại đầu ra cần tạo, giữ đúng ý gốc.',
      'Khi tóm tắt, phân tách ý chính, rủi ro/điểm cần chú ý và việc cần làm.',
      'Không bịa chi tiết ngoài nội dung người dùng cung cấp; nếu thiếu dữ liệu, nói rõ.',
    ].join('\n'),
  },
  'email-draft-polish': {
    id: 'email-draft-polish',
    label: 'Email Draft & Polish',
    instruction: [
      'Áp dụng workflow Email Draft & Polish: xác định mục tiêu email, người nhận, giọng văn và CTA.',
      'Tạo email có tiêu đề, lời chào, thân bài rõ mục đích và lời kết phù hợp.',
      'Giữ văn phong lịch sự, ngắn gọn; nếu dữ kiện thiếu, dùng placeholder dễ thay như [Tên] hoặc [Ngày].',
    ].join('\n'),
  },
  'translator-api-proofreader-api': {
    id: 'translator-api-proofreader-api',
    label: 'Translator + Proofreader',
    instruction: [
      'Áp dụng workflow Translator + Proofreader: giữ đúng nghĩa, sửa câu cho tự nhiên và dễ đọc.',
      'Nếu người dùng không nêu ngôn ngữ đích, mặc định dịch/sửa sang tiếng Việt tự nhiên.',
      'Với thuật ngữ hoặc câu có thể hiểu nhiều cách, ghi chú ngắn lựa chọn dịch/sửa đã dùng.',
    ].join('\n'),
  },
  'meeting-notes-and-actions': {
    id: 'meeting-notes-and-actions',
    label: 'Meeting Notes & Actions',
    instruction: [
      'Áp dụng workflow Meeting Notes & Actions: biến ghi chú rời thành bản tóm tắt dùng được ngay.',
      'Luôn tách thành: Tóm tắt, Quyết định, Việc cần làm, Người phụ trách, Deadline, Rủi ro/câu hỏi mở.',
      'Nếu không có owner hoặc deadline, ghi "Chưa rõ" thay vì tự bịa.',
    ].join('\n'),
  },
  'presentation-skill': {
    id: 'presentation-skill',
    label: 'Presentation Skill',
    instruction: [
      'Áp dụng workflow Presentation Skill: xây dựng mạch thuyết trình trước khi viết từng slide.',
      'Trả về cấu trúc slide gồm tiêu đề, thông điệp chính, 2-4 ý nội dung và gợi ý hình/biểu đồ nếu hữu ích.',
      'Giữ mỗi slide ngắn, có logic mở bài, thân bài, kết luận hoặc lời kêu gọi hành động.',
    ].join('\n'),
  },
  'spreadsheet-formula-helper': {
    id: 'spreadsheet-formula-helper',
    label: 'Spreadsheet Formula Helper',
    instruction: [
      'Áp dụng workflow Spreadsheet Formula Helper: đọc cấu trúc bảng, xác định cột, dòng, đơn vị và kết quả cần tìm.',
      'Nếu cần công thức Excel/Google Sheets, đưa công thức cụ thể và giải thích cách dùng.',
      'Khi phân tích dữ liệu, nêu giả định, insight, ngoại lệ và bước kiểm tra tiếp theo.',
    ].join('\n'),
  },
  'tailored-resume-generator': {
    id: 'tailored-resume-generator',
    label: 'Tailored Resume Generator',
    instruction: [
      'Áp dụng workflow Tailored Resume Generator: làm rõ vai trò mục tiêu, kinh nghiệm liên quan và từ khóa JD.',
      'Viết thành tích theo hướng hành động, tác động, kỹ năng và bằng chứng đo được khi có.',
      'Không phóng đại thông tin; nếu thiếu số liệu, đề xuất cách diễn đạt trung thực hoặc câu hỏi cần bổ sung.',
    ].join('\n'),
  },
};

export function getTaskSkillInstruction(skillId: string): TaskSkillInstruction {
  return (
    taskSkillInstructions[skillId] ?? {
      id: skillId,
      label: skillId,
      instruction: fallbackInstruction,
    }
  );
}
