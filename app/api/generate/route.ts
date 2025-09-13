import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

async function fetchProductContent(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    const html = await response.text();

    const textMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = textMatch ? textMatch[1] : html;

    const cleanText = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleanText.substring(0, 2000);
  } catch (error) {
    console.error("Error fetching product content:", error);
    return "";
  }
}

async function generatePostContent(
  productContent: string,
  tone: string,
  platform: string,
  apiKey: string
): Promise<{ text: string; title: string; hashtags: string[] }> {
  const toneDescriptions: Record<string, string> = {
    promo: "promocyjny i zachęcający do zakupu",
    neutral: "informacyjny i obiektywny",
    playful: "lekki i zabawny",
  };

  const platformDescriptions: Record<string, string> = {
    facebook: "Facebook - dłuższy post, bardziej osobisty",
    instagram: "Instagram - krótszy, wizualny, z emoji",
    linkedin: "LinkedIn - profesjonalny, biznesowy",
  };

  const prompt = `
    Na podstawie poniższej treści produktu, stwórz post na ${platformDescriptions[platform]} w tonie ${toneDescriptions[tone]}.

    Treść produktu: ${productContent}

    Post powinien zawierać:
    1. Chwytliwy tytuł
    2. Główną treść posta (2-4 zdania)
    3. 3-5 relevantnych hashtagów

    Format odpowiedzi (JSON):
    {
      "title": "Tytuł posta",
      "text": "Treść posta",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
    }
  `;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const generatedText = data.candidates[0].content.parts[0].text;

  try {
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.text || generatedText,
        title: parsed.title || "",
        hashtags: parsed.hashtags || [],
      };
    }
    return { text: generatedText, title: "", hashtags: [] };
  } catch {
    return { text: generatedText, title: "", hashtags: [] };
  }
}

async function fetchFirstProductImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch product page");

    const html = await response.text();

    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"'>]+)["']/gi)].map(
      (m) => m[1]
    );

    if (imgMatches.length === 0) return null;

    const absoluteUrls = imgMatches.map((src) => new URL(src, url).toString());

    const filtered = absoluteUrls.filter((src) => {
      const lower = src.toLowerCase();
      return !(
        lower.includes("logo") ||
        lower.includes("icon") ||
        lower.includes("sprite") ||
        lower.includes("banner") ||
        lower.includes("avatar")
      );
    });

    if (filtered.length === 0) return null;

    const candidates = filtered.sort((a, b) => {
      const score = (link: string) => {
        const lower = link.toLowerCase();
        let s = 0;
        if (lower.includes("product")) s += 5;
        if (lower.includes("item")) s += 3;
        if (lower.includes("photo") || lower.includes("image")) s += 2;
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) s += 2;
        if (lower.endsWith(".png") || lower.endsWith(".webp")) s += 1;
        return s;
      };
      return score(b) - score(a);
    });

    const selectedUrl = candidates[0];

    const imgResp = await fetch(selectedUrl);
    if (!imgResp.ok) return null;

    const buffer = Buffer.from(await imgResp.arrayBuffer());
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("Error fetching product image:", err);
    return null;
  }
}

async function generateImage(
  productContent: string,
  title: string,
  apiKey: string,
  productUrl: string
): Promise<string | null> {
  try {
    const productImage = await fetchFirstProductImage(productUrl);

    const keywords = productContent
      .substring(0, 300)
      .replace(/[^\w\s]/gi, " ")
      .split(" ")
      .filter((word) => word.length > 3)
      .slice(0, 8)
      .join(", ");

    const basePrompt = `
      Create a professional marketing advertisement for this product.

      Product: ${title}
      Key features: ${keywords}

      Requirements:
      - Modern and elegant ad style
      - High quality, square (1:1)
      - Clean layout with focus on the product
      - Add short catchy promo text overlay (e.g. "Komfort w podróży", "Nowość!")
      - Suitable for social media
    `;

    const prompt = productImage
      ? `${basePrompt}\nUse this product photo as strong reference: ${productUrl}`
      : basePrompt;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model: "imagen-4.0-generate-001",
      prompt: prompt.trim(),
      config: {
        numberOfImages: 1,
        aspectRatio: "1:1",
      },
    });

    const images = response.generatedImages ?? [];
    if (images.length > 0) {
      const generatedImage = images[0];
      if (generatedImage.image?.imageBytes) {
        const base64 = `data:image/png;base64,${generatedImage.image.imageBytes}`;
        const publicUrl = await uploadToImgBB(base64);
        if (publicUrl) return publicUrl;
        return base64;
      }
    }
    return productImage;
  } catch (error) {
    console.error("Error generating image with Google Imagen:", error);
    return null;
  }
}

async function uploadToImgBB(base64Data: string): Promise<string | null> {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) throw new Error("Brak IMGBB_API_KEY w .env.local");

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

    const formData = new FormData();
    formData.append("image", cleanBase64);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      console.error("ImgBB upload failed:", await res.text());
      return null;
    }

    const data = await res.json();
    return data.data?.url ?? null;
  } catch (err) {
    console.error("Error uploading to ImgBB:", err);
    return null;
  }
}


export async function POST(req: NextRequest) {
  try {
    const { productUrl, tone = "promo", platform = "facebook" } =
      await req.json();

    if (!productUrl || typeof productUrl !== "string") {
      return NextResponse.json(
        { error: "productUrl wymagany" },
        { status: 400 }
      );
    }

    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    const imagenApiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!geminiApiKey || !imagenApiKey) {
      return NextResponse.json(
        { error: "Brak GOOGLE_GEMINI_API_KEY w .env.local" },
        { status: 500 }
      );
    }

    const productContent = await fetchProductContent(productUrl);
    if (!productContent) {
      return NextResponse.json(
        { error: "Nie udało się pobrać treści produktu" },
        { status: 400 }
      );
    }

    const postContent = await generatePostContent(
      productContent,
      tone,
      platform,
      geminiApiKey
    );

    const imageUrl = await generateImage(
      productContent,
      postContent.title || productUrl,
      imagenApiKey,
      productUrl
    );

    const normalized = {
      postText: postContent.text,
      title: postContent.title,
      hashtags: postContent.hashtags,
      imageUrl,
      meta: {
        source: "google",
        imageUrl,
        tone,
        platform,
        generatedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(normalized);
  } catch (e: any) {
    console.error("Generation error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}