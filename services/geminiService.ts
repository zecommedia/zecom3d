
import { GoogleGenAI } from "@google/genai";
import { ImageFile } from "../types";

// Hàm chuẩn hóa MIME type để đảm bảo Gemini API chấp nhận
const getSupportedMimeType = (type: string): string => {
  const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
  const lowerType = type.toLowerCase();
  
  if (supported.includes(lowerType)) return lowerType;
  if (lowerType.includes('png')) return 'image/png';
  if (lowerType.includes('webp')) return 'image/webp';
  return 'image/jpeg';
};

export const generatePodImage = async (
  images: ImageFile[], 
  customPrompt?: string, 
  sourceImageBase64?: string,
  mode: 'normal' | 'pro' | 'white' | 'pattern' = 'pro',
  themeName: string = "abstract design",
  backgroundColor: string = "#000000",
  isSticker: boolean = false
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const isPro = mode === 'pro';
  const isWhite = mode === 'white';
  const isPattern = mode === 'pattern';
  
  // Nâng cấp: white mode giờ đây cũng sử dụng model Pro để có chất lượng 2K
  const model = (isPro || isPattern || isWhite) ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  let parts: any[] = [];

  if (sourceImageBase64) {
    parts.push({
      inlineData: {
        data: sourceImageBase64.split(',')[1],
        mimeType: 'image/png',
      },
    });
  } else if (images.length > 0) {
    parts = images.map(img => ({
      inlineData: {
        data: img.base64.split(',')[1],
        mimeType: getSupportedMimeType(img.file.type || 'image/jpeg'),
      },
    }));
  }

  let bgStyle = "";
  if (isSticker) {
    bgStyle = "NỀN TRẮNG TINH KHIẾT (#FFFFFF) TUYỆT ĐỐI. Thiết kế phải có viền trắng dày (white die-cut border) bao quanh toàn bộ đối tượng để tạo hiệu ứng Sticker chuyên nghiệp, dễ cắt.";
  } else if (isWhite) {
    bgStyle = "NỀN TRẮNG TINH KHIẾT (#FFFFFF) TUYỆT ĐỐI. Họa tiết phải nổi bật và sạch sẽ trên nền trắng.";
  } else if (isPro) {
    const colorDesc = backgroundColor.toLowerCase() === "#000000" ? "ĐEN TUYỀN (#000000)" : 
                    backgroundColor.toLowerCase() === "#ffffff" ? "TRẮNG (#FFFFFF)" :
                    backgroundColor.toLowerCase() === "#f2c3d5" ? "HỒNG (#F2C3D5)" :
                    backgroundColor.toLowerCase() === "#bb1120" ? "ĐỎ (#BB1120)" : backgroundColor;
    bgStyle = `NỀN MÀU ${colorDesc} TUYỆT ĐỐI. Họa tiết phải nổi bật và hòa hợp hoàn hảo trên nền màu này.`;
  } else {
    bgStyle = "NỀN ĐEN TUYỀN (#000000) HOÀN TOÀN. Điều này giúp tách lớp họa tiết dễ dàng cho in ấn.";
  }

  const defaultPrompt = `
    Nhiệm vụ: Bạn là một chuyên gia thiết kế đồ họa đỉnh cao cho thị trường Print on Demand (POD).
    Hãy tạo ra một tác phẩm nghệ thuật (Asset Design) dựa trên các hình ảnh tham khảo.

    YÊU CẦU KỸ THUẬT & THẨM MỸ:
    - ${bgStyle}
    - PHONG CÁCH: Digital Art chuyên nghiệp, Illustration chi tiết.
    - KHÔNG Mockup, KHÔNG có người mẫu, KHÔNG có vật dụng thừa. Chỉ tập trung vào đối tượng chính.
    - ĐỘ CHI TIẾT: Cực kỳ cao. Các đường nét sắc sảo.
    - MÀU SẮC: Hài hòa, sang trọng. Hạn chế hiệu ứng neon quá mức.
    - CỐ CỤC: Cân đối, phù hợp để in ngay.
  `;

  const whiteBrgPrompt = `
    Dựa trên thiết kế này, hãy vẽ lại một phiên bản TƯƠNG TỰ nhưng nằm trên NỀN TRẮNG TINH (#FFFFFF). 
    Yêu cầu:
    - Giữ nguyên các chi tiết chính.
    - Tối ưu màu sắc để nổi bật trên nền trắng.
    - Tuyệt đối không có mockup hay người mẫu.
  `;

  const patternPrompt = `Create ONE single finished illustrated artwork for cut-and-sew / all-over print apparel. Theme ${themeName}. Create a full-bleed, fabric-style continuous artwork without borders, margins, or padding, ensuring the design touches all four edges and fills the top and bottom completely without centering vertically or leaving safe margins. The composition must be ONE continuous artwork visually organized into THREE EQUAL VERTICAL AREAS (LEFT / CENTER / RIGHT) of equal width with no background color changes, lines, panels, frames, or visible separations between them. The CENTER area must contain a main action or focal moment on a solid uninterrupted background field where the central subject and integrated small one-line lettering are intentionally SMALL and RESTRAINED, occupying approximately 10% of the total canvas area and positioned exclusively in the center while the upper portion remains visually open but fully filled by the background. The LEFT third must feature a subject close-up or expressive pose with strong visual presence and background texture filling the full height, while the RIGHT third includes themed secondary elements with balanced density filling the full height. The style must be a bold illustrated mascot or graphic style with clean thick outlines and exaggerated expressions, strictly non-photorealistic and non-stock-photo, with background elements flowing vertically or organically in one consistent color palette across the entire canvas. Highlights are allowed only inside illustrated elements. Forbidden elements include technical text, labels, notes, dimensions, diagrams, guides, mockups, unequal thirds, variable gaps, letterbox bars, visible separations, standalone letters, or decorative words unless fully integrated without creating empty space. Output ONE image.`;

  let finalPrompt = "";
  if (isPattern) {
    finalPrompt = patternPrompt;
  } else if (isWhite) {
    finalPrompt = whiteBrgPrompt;
  } else {
    finalPrompt = sourceImageBase64 
      ? `Hãy tinh chỉnh thiết kế này trở nên chân thực, sắc nét hơn. Hạn chế neon. ${customPrompt || ''}` 
      : (customPrompt || defaultPrompt);
  }

  try {
    const imageConfig: any = {
      aspectRatio: isPattern ? "16:9" : "1:1"
    };
    
    // Cập nhật imageSize - pattern dùng 1K, pro và white dùng 2K
    if (isPro || isWhite) {
      imageConfig.imageSize = "1K";
    } else if (isPattern) {
      imageConfig.imageSize = "1K";
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [...parts, { text: finalPrompt }],
      },
      config: {
        imageConfig
      }
    });

    let base64Image = "";
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      if (response.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error("Nội dung ảnh bị AI từ chối vì lý do an toàn. Hãy thử ảnh khác.");
      }
      throw new Error("AI không trả về kết quả ảnh.");
    }
    return base64Image;
  } catch (error: any) {
    if (error.message.includes("Requested entity was not found")) {
      throw new Error("PRO_KEY_REQUIRED: Vui lòng kết nối API Key trả phí để sử dụng model này.");
    }
    if (error.message.includes("400")) {
      throw new Error("Lỗi định dạng ảnh: Một trong các ảnh không được AI hỗ trợ. Hãy thử ảnh chụp màn hình.");
    }
    throw new Error("Lỗi Generation: " + error.message);
  }
};

export const analyzeInsights = async (keyword: string, images: ImageFile[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.base64.split(',')[1],
      mimeType: getSupportedMimeType(img.file.type || 'image/jpeg'),
    },
  }));

  const prompt = `
    Nhiệm vụ: Phân tích insight khách hàng và thiết kế cho sản phẩm POD dựa trên keyword "${keyword}" và các hình ảnh tham khảo đính kèm.
    Yêu cầu: 
    - Viết bằng tiếng Việt, súc tích, chuyên nghiệp. 
    - Giới hạn 3000 ký tự.
    - TUYỆT ĐỐI KHÔNG sử dụng các ký tự định dạng Markdown như dấu thăng (#) cho tiêu đề hoặc dấu sao (*) cho in đậm/liệt kê. Hãy dùng văn bản thuần túy hoặc các ký tự gạch đầu dòng "-" đơn giản.
    
    Cấu trúc đầu ra bắt buộc:
    Keyword sản phẩm: ${keyword}

    🖌 Phần thiết kế (thông tin chi tiết)
    (Sử dụng các dòng gạch đầu dòng "-" để phân tích các yếu tố thị giác, phong cách, màu sắc từ hình ảnh tham khảo)

    💡 Phần lý do mua hàng (động lực và nhu cầu)
    (Sử dụng các dòng gạch đầu dòng "-" để nêu các lý do tâm lý hoặc thực tế khiến khách hàng chọn mẫu này)

    🧍 Chân dung khách hàng
    - Độ tuổi: 
    - Giới tính: 
    - Trình độ giáo dục: 
    - Nghề nghiệp: 
    - Mức thu nhập: 
    - Khu vực sống: 
    - Tình trạng gia đình / Sở hữu thú nuôi hay không: 
    - Chủng tộc hoặc tôn giáo (nếu có): 

    Kết luận: (Tóm tắt ngắn gọn cơ hội kinh doanh hoặc lưu ý quan trọng)
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [...imageParts, { text: prompt }],
      },
    });

    return response.text || "Không thể tạo phân tích vào lúc này.";
  } catch (error: any) {
    throw new Error("Lỗi phân tích: " + error.message);
  }
};

// Base pattern prompt template - used by all pattern generation functions
const getPatternPromptTemplate = () => `
CRITICAL LAYOUT REQUIREMENTS FOR 3D T-SHIRT PATTERN:
Create a full-bleed, fabric-style continuous artwork in 16:9 aspect ratio without borders, margins, or padding.
The design must touch all four edges and fill completely without centering or leaving safe margins.

The composition must be ONE continuous artwork visually organized into THREE EQUAL VERTICAL AREAS:
- LEFT third (33%): Design for BACK of the shirt - feature a subject close-up or expressive pose with strong visual presence
- CENTER third (33%): Design for FRONT of the shirt - main focal point, intentionally SMALL and RESTRAINED (~10% of canvas area)
- RIGHT third (33%): Design for SLEEVES (both arms) - themed secondary elements with balanced density

MANDATORY RULES:
- NO background color changes, lines, panels, frames, or visible separations between sections
- ONE consistent color palette across the entire canvas
- Bold illustrated mascot/graphic style with clean thick outlines
- Strictly non-photorealistic and non-stock-photo
- Background elements must flow vertically or organically
- Highlights allowed only inside illustrated elements

FORBIDDEN ELEMENTS:
- Technical text, labels, notes, dimensions, diagrams, guides
- Mockups, unequal thirds, variable gaps, letterbox bars
- Visible separations, standalone letters, decorative words (unless fully integrated)
`;

// Redesign pattern - chỉnh sửa pattern hiện tại dựa trên prompt
export const redesignPattern = async (
  currentPatternBase64: string,
  editPrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts = [{
    inlineData: {
      data: currentPatternBase64.split(',')[1],
      mimeType: 'image/png',
    },
  }];

  const prompt = `
    You are an expert apparel pattern designer. 
    
    CURRENT PATTERN is attached. Please EDIT this pattern based on the following request:
    "${editPrompt}"
    
    IMPORTANT: Apply the edit while MAINTAINING the correct pattern structure:
    ${getPatternPromptTemplate()}
    
    - Keep the overall style and color palette consistent with the original
    - Only modify elements mentioned in the edit request
    - Output ONE edited pattern image
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [...parts, { text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    let base64Image = "";
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      throw new Error("AI không trả về kết quả ảnh.");
    }
    return base64Image;
  } catch (error: any) {
    throw new Error("Lỗi Redesign: " + error.message);
  }
};

// Creative mode - tạo prompt mới từ prompt cũ và yêu cầu chỉnh sửa
export const creativePattern = async (
  originalTheme: string,
  editPrompt: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const combinedPrompt = `
    Create ONE single finished illustrated artwork for cut-and-sew / all-over print apparel.
    
    ORIGINAL THEME: ${originalTheme}
    USER MODIFICATION REQUEST: ${editPrompt}
    
    Combine the original theme with the user's modification to create a NEW, CREATIVE pattern.
    
    ${getPatternPromptTemplate()}
    
    Output ONE image.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: combinedPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    let base64Image = "";
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      throw new Error("AI không trả về kết quả ảnh.");
    }
    return base64Image;
  } catch (error: any) {
    throw new Error("Lỗi Creative: " + error.message);
  }
};

// Clone mockup to pattern - chuyển từ mockup 3D sang pattern
export const cloneMockupToPattern = async (
  mockupImageBase64: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts = [{
    inlineData: {
      data: mockupImageBase64.split(',')[1],
      mimeType: 'image/png',
    },
  }];

  const prompt = `
    Analyze this T-shirt mockup/design image and RECREATE it as a FLAT PATTERN for cut-and-sew / all-over print production.
    
    YOUR TASK:
    1. Extract the design/artwork/style from the input image
    2. Recreate it following the EXACT pattern structure below
    
    ${getPatternPromptTemplate()}
    
    ADDITIONAL REQUIREMENTS:
    - Match the style, colors, and theme from the input image as closely as possible
    - If input is a mockup, extract only the design elements (ignore the shirt/model)
    - If input is already a pattern/design, adapt it to fit the 3-section layout
    
    Output ONE 16:9 pattern image.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [...parts, { text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    let base64Image = "";
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!base64Image) {
      throw new Error("AI không trả về kết quả ảnh.");
    }
    return base64Image;
  } catch (error: any) {
    throw new Error("Lỗi Clone: " + error.message);
  }
};
