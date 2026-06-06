# Web ChatGPT

Giao diện trợ lý OpenAI cho học tập và công việc. App chạy được ngay bằng phản hồi demo, sau đó có thể nối vào backend proxy để gọi OpenAI Responses API.

## Chạy local

```bash
npm install
npm run dev
```

## Nối API sau

Không đặt `OPENAI_API_KEY` trong browser. Hãy tạo một backend route, ví dụ `/api/openai/responses`, rồi đặt:

```bash
VITE_USE_MOCK_RESPONSES=false
VITE_OPENAI_PROXY_URL=/api/openai/responses
```

UI gọi adapter trong `src/lib/openaiClient.ts`. Endpoint proxy local nằm ở `server/proxy.mjs`, đọc `OPENAI_API_KEY` và `OPENAI_API_URL` từ `.env`, rồi forward request lên API thật.

Chạy frontend:

```bash
npm run dev
```

Chạy proxy API trong terminal khác:

```bash
npm run api
```

Danh sách model hiện tại đang đặt trong `src/data/models.ts`. Hãy kiểm tra lại tài liệu OpenAI khi nối API thật vì model availability có thể thay đổi.
