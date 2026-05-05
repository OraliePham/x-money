# Hướng Dẫn CMD - Playwright X Profile Launcher

Tài liệu này mô tả đầy đủ cách chạy lệnh với `src/profile-launcher.ts`, bao gồm luồng đọc comment, follow, like, reply.

## 1. Chuẩn bị

- Cài Node.js.
- Chạy `npm install` tại thư mục project.
- Đứng ở thư mục gốc project trước khi chạy lệnh.

Nếu PowerShell chặn `npx`, dùng fallback:

```powershell
node .\node_modules\tsx\dist\cli.mjs src/profile-launcher.ts ...
```

## 2. Cú pháp tổng quát

```powershell
npx tsx src/profile-launcher.ts <profileId> <targetUrl> [flags]
```

Ví dụ tối thiểu:

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home
```

## 3. Flags hiện có

### 3.1. Feed / Follow / Read

- `--feed-tab following|for-you`
- `--follow yes|no`
- `--follow-verified-users`
- `--read-comments`
- `--max-comments <number>`
- `--extract-detailed-info`
- `--max-users-to-process <number>`

### 3.2. Like / Reply

- `--like-current-tweet`
- `--reply-text "<noi dung reply>"`
- `--reply-like`
: Chỉ dùng khi bạn muốn reply xong thì like trong chính bước reply. Nếu đã có `--like-current-tweet` thì hệ thống ưu tiên luồng like chính để tránh like trùng.

- `--reply-stay`
: Reply xong sẽ ở lại trang tweet (không quay về home trong bước reply).

- `--reply-max-length <number>`
: Mặc định `280`.

- `--reply-timeout-ms <number>`
: Mặc định `15000`.

### 3.3. Khác

- `--demo-actions`
- `--demo-search`
- `--extract-tweet-info`
- `--click-random-text`
- `--screenshot`
- `--keep-open`
- `--dry-run`

## 4. Luồng chạy hiện tại (đã tích hợp reply)

Pipeline chính:

1. Chuyển tab feed (`for-you`/`following`).
2. Click tweet đầu tiên.
3. (Tùy chọn) Follow tác giả tweet đầu tiên.
4. (Tùy chọn) Read comments + follow verified users theo policy.
5. (Tùy chọn) Reply tweet theo `--reply-*`.
6. (Tùy chọn) Like tweet theo `--like-current-tweet`.

Ghi chú phối hợp `like` + `reply`:

- Nếu có `--reply-text` và không có `--reply-stay`, hệ thống sẽ ưu tiên xử lý like trước reply để tránh mất context tweet detail.
- Nếu có `--reply-text` và có `--reply-stay`, hệ thống reply trước rồi like sau trong cùng tweet page.

## 5. Ví dụ command chạy thực tế

### 5.1. Full flow chuẩn (read + follow + like)

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --read-comments --feed-tab following --follow yes --follow-verified-users --max-comments 10 --extract-detailed-info --max-users-to-process 1 --like-current-tweet
```

### 5.2. Full flow + reply, reply xong vẫn ở lại tweet rồi mới like

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --read-comments --feed-tab following --follow yes --follow-verified-users --max-comments 10 --extract-detailed-info --max-users-to-process 1 --reply-text "Nice post!" --reply-stay --like-current-tweet
```

### 5.3. Reply-only trên tweet đầu tiên (không read, không like)

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --feed-tab following --reply-text "Great thread, thanks for sharing"
```

### 5.4. Reply + like ngay trong bước reply (không bật like flow chính)

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --feed-tab following --reply-text "Useful information" --reply-like
```

### 5.5. Test cấu hình reply bằng dry-run

```powershell
npx tsx src/profile-launcher.ts profile_01_id https://x.com/home --reply-text "dry run test" --reply-stay --reply-max-length 280 --reply-timeout-ms 20000 --dry-run
```

## 6. Anti-bot policies đang bật

- Click tweet: hover + hesitation + miss-click nhẹ + retry mở tweet.
- Scroll comments: random distance + có xác suất scroll ngược.
- Follow verified users: tỉ lệ random 10-20%.
- Bỏ user đã follow trong DB (`verified_users.is_fl = 1`).
- Throttle follow: tối đa 10 user trong 5 phút, tính theo `verified_users.updated_at`.

## 7. Logs quan trọng

- `Running pipeline: ...`
- `[feed-nav] ...`
- `Following first tweet author: @...`
- `Skipping X user(s) already followed ...`
- `Follow throttle window(5m): used=A/10, remaining=B`
- `Reply flow completed` hoặc `Reply flow failed`
- `Like successful...` hoặc `Like failed or already liked`

## 8. Troubleshooting

### 8.1. PowerShell lỗi không chạy được npx

```powershell
node .\node_modules\tsx\dist\cli.mjs src/profile-launcher.ts profile_01_id https://x.com/home --read-comments --feed-tab following --follow yes --max-comments 10 --like-current-tweet
```

### 8.2. Reply không chạy

- Đảm bảo có `--reply-text`.
- Nếu text có khoảng trắng, bọc bằng dấu nháy kép.
- Kiểm tra đang mở tweet detail thành công trước khi reply.

### 8.3. Follow ít hơn kỳ vọng

Đây là đúng thiết kế vì có 3 lớp giới hạn:

- Random 10-20%.
- Bỏ user đã `is_fl=1`.
- Throttle 10 follow / 5 phút.
