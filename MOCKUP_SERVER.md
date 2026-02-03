# Zecom3D - Chạy cả Web App và Mockup Server

## Cách 1: Chạy riêng từng terminal

### Terminal 1 - Web App:
```bash
npm run dev
```

### Terminal 2 - Mockup Server:
```bash
cd server
npm start
```

## Cách 2: Chạy cả hai cùng lúc (Windows)

```powershell
# Chạy server ở background
Start-Process -NoNewWindow powershell -ArgumentList "-Command", "cd server; npm start"

# Chạy web app
npm run dev
```

## Workflow sử dụng:

1. **Tạo pattern** trong web app (Generate hoặc Clone)
2. **Click "SHOW 3D"** để xem pattern trên áo 3D
3. **Click "Edit"** mở Edit Panel
4. **Click "Export Mockup"** → Server tự động:
   - Lưu pattern → `temp.png`
   - Chạy `Print_Scripts.jsx` → Tạo `PRINT.png`
   - Chạy `Mockup_Scripts.jsx` → Tạo `Mockup.png`
5. **Kết quả** được lưu tại: `3D T shirt/3D T shirt/Mockup/`

## Lưu ý:
- Đảm bảo Photoshop đã được cài đặt
- Đường dẫn Photoshop mặc định: `C:/Program Files/Adobe/Adobe Photoshop 2025/Photoshop.exe`
- Nếu khác, sửa trong `server/index.js` dòng `PHOTOSHOP_PATH`
