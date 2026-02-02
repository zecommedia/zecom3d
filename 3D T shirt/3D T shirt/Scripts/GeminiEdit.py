# ==========================================
# Gemini Image Edit Script (Updated 2025)
# Compatible with google-genai >= 0.2.0
# Author: Quỳnh Anh + ChatGPT
# ==========================================

import os
import sys
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import mimetypes
from google import genai
from google.genai import types


def save_binary_file(file_name, data: bytes):
    """Lưu file nhị phân ra ổ đĩa."""
    os.makedirs(os.path.dirname(file_name), exist_ok=True)
    with open(file_name, "wb") as f:
        f.write(data)
    print(f"File saved to: {file_name}")


def generate(prompt: str, image_path: str, output_path: str = None):
    """Sinh ảnh mới từ prompt và ảnh gốc bằng Gemini."""
    # Kiểm tra file ảnh
    if not os.path.exists(image_path):
        print(f"Image file not found: {image_path}")
        return

    # Lấy API key
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Missing GEMINI_API_KEY environment variable.")
        print("Please set it with: setx GEMINI_API_KEY 'your_api_key_here'")
        return

    # Khởi tạo client
    client = genai.Client(api_key=api_key)

    # Chọn model
    model = "gemini-2.5-flash-image"  # Hoặc "gemini-2.0-flash-exp" nếu bản của bạn chưa có model này

    # Đọc ảnh
    with open(image_path, "rb") as f:
        image_data = f.read()

    mime_type = mimetypes.guess_type(image_path)[0] or "image/png"

    # ⚙️ Cấu trúc nội dung gửi lên Gemini
    contents = [
        {
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": image_data}},
            ],
        }
    ]

    # ⚙️ Cấu hình sinh ảnh
    generate_content_config = types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
        image_config=types.ImageConfig(image_size="1K"),
    )

    output_dir = os.path.dirname(output_path or image_path)
    file_index = 0

    print("Generating image with Gemini, please wait...\n")

    # Streaming output
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if (
            not chunk.candidates
            or not chunk.candidates[0].content
            or not chunk.candidates[0].content.parts
        ):
            continue

        part = chunk.candidates[0].content.parts[0]

        # Nếu có dữ liệu hình ảnh
        if getattr(part, "inline_data", None) and part.inline_data.data:
            file_extension = mimetypes.guess_extension(part.inline_data.mime_type) or ".png"

            # Nếu người dùng chỉ định output thì dùng nó, ngược lại tự sinh tên
            if output_path:
                file_name = output_path
                if not os.path.splitext(file_name)[1]:
                    file_name += file_extension
            else:
                file_name = os.path.join(output_dir, f"gemini_edit_{file_index}{file_extension}")

            save_binary_file(file_name, part.inline_data.data)
            file_index += 1

        # Nếu có text (mô tả hoặc chú thích)
        elif getattr(chunk, "text", None):
            print("Gemini:", chunk.text)

    print("Done! All generated images have been saved.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:")
        print('python GeminiEdit.py "<prompt>" "<image_path>" [output_path]')
        print('\nExample:')
        print('python GeminiEdit.py "thay nền trắng" "D:/T-shirt/temp.png" "D:/T-shirt/output/white.png"')
        sys.exit(1)

    prompt = sys.argv[1]
    image_path = sys.argv[2]
    output_path = sys.argv[3] if len(sys.argv) > 3 else None

    generate(prompt, image_path, output_path)
