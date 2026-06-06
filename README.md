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
VITE_OPENAI_IMAGE_PROXY_URL=/api/openai/images
```

UI gọi adapter trong `src/lib/openaiClient.ts`. Endpoint proxy local nằm ở `server/proxy.mjs`, đọc `OPENAI_API_KEY`, `OPENAI_API_URL`, `OPENAI_IMAGE_API_URL` và `OPENAI_IMAGE_MODEL` từ `.env`, rồi forward request lên API thật. Nếu không đặt `OPENAI_IMAGE_API_URL`, proxy sẽ tự đổi endpoint `/v1/responses` thành `/v1/images/generations`. Nếu không đặt `OPENAI_IMAGE_MODEL`, proxy sẽ dùng `gpt-image-2`.

Chạy frontend:

```bash
npm run dev
```

Chạy proxy API trong terminal khác:

```bash
npm run api
```

Danh sách model hiện tại đang đặt trong `src/data/models.ts`. Hãy kiểm tra lại tài liệu OpenAI khi nối API thật vì model availability có thể thay đổi.
