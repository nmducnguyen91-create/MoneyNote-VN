# MoneyNote VN

Sổ quản lý thu chi cá nhân — PWA chạy trên điện thoại và trình duyệt máy tính.

- `moneynote.html` — bản điện thoại (mở mặc định từ `index.html`)
- `moneynote-desktop.html` + `moneynote-desktop.js` — bản màn hình lớn
- `sw.js` — chạy offline, mở tức thì. **Mỗi lần cập nhật code nhớ tăng `CACHE` trong sw.js.**
- `firestore.rules` — dán vào Firebase Console › Firestore › Rules › Publish

## Đăng lên GitHub Pages
1. Tạo repo mới, upload toàn bộ file trong thư mục này (giữ thư mục `splash/`).
2. Settings › Pages › Source: *Deploy from a branch* › `main` / `(root)`.
3. Firebase Console › Authentication › Settings › Authorized domains: thêm `<tên-bạn>.github.io`.
4. Mở `https://<tên-bạn>.github.io/<tên-repo>/` trên điện thoại › Chia sẻ › Thêm vào MH chính.

Dữ liệu đồng bộ qua Firebase, dùng chung với FinTrack khi đăng nhập cùng tài khoản.
