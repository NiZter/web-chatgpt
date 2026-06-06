# Thiết Kế

## Chủ Đề
Giao diện sản phẩm sáng, gọn và dễ quét. Bối cảnh sử dụng là bàn học hoặc bàn làm việc ban ngày: người dùng cần hỏi nhanh, soạn nội dung, tóm tắt tài liệu và chuyển tác vụ liên tục.

## Bảng Màu
Sử dụng biến OKLCH trong CSS.

```css
--bg: oklch(1 0 0);
--surface: oklch(0.982 0.006 285);
--surface-strong: oklch(0.952 0.014 286);
--ink: oklch(0.18 0.016 282);
--muted: oklch(0.46 0.026 282);
--border: oklch(0.9 0.015 285);
--primary: oklch(0.56 0.18 286);
--primary-strong: oklch(0.48 0.19 286);
--primary-soft: oklch(0.94 0.035 286);
--accent: oklch(0.67 0.16 34);
--success: oklch(0.55 0.13 154);
--warning: oklch(0.7 0.15 74);
--danger: oklch(0.56 0.18 25);
```

## Typography
Dùng Inter hoặc system sans-serif. Giữ chữ gọn, dễ đọc, dùng cỡ chữ cố định cho UI sản phẩm.

## Thành Phần
Các thành phần chính: app shell, topbar, model selector, thư viện tác vụ, transcript chat, composer, nút hành động, toggle, segmented control, settings drawer và skeleton phản hồi.

## Layout
Desktop dùng một workspace chính gồm vùng chat và panel tác vụ bên phải. Tablet đưa panel tác vụ xuống dưới vùng chat. Mobile xếp nội dung một cột, giữ composer rõ ràng và tránh mọi cột lịch sử vì phiên chat không được lưu bền vững.

## Motion
Dùng transition ngắn 150-220ms cho hover, trạng thái chọn, panel và phản hồi. Tôn trọng `prefers-reduced-motion`.

## Tích Hợp API
App chạy bằng phản hồi demo cho đến khi người dùng thêm backend/proxy OpenAI. Browser code không chứa secret API key. Việc gọi API nằm trong adapter riêng để có thể thay model, instruction, reasoning effort và response parser mà không phải sửa UI.
