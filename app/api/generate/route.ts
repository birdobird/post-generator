import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

async function fetchProductContent(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const html = await res.text();
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    const clean = body
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return clean.substring(0, 2000);
  } catch (e) {
    console.error("fetchProductContent:", e);
    return "";
  }
}

async function generatePostContent(
  productContent: string,
  tone: string,
  platform: string,
  apiKey: string
): Promise<{ title: string; text: string; hashtags: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  const toneDesc = {
    promo: "promocyjny i zachęcający do zakupu",
    neutral: "informacyjny i obiektywny",
    playful: "lekki i zabawny",
  };
  const platformDesc = {
    facebook: "Facebook – dłuższy, bardziej osobisty post",
    instagram: "Instagram – krótki, wizualny, z emoji",
    linkedin: "LinkedIn – profesjonalny, biznesowy",
  };

  const prompt = `
Na podstawie poniższej treści produktu stwórz post na ${platformDesc[platform]} w tonie ${toneDesc[tone]}.

Treść produktu:
${productContent}

Odpowiedz w formacie JSON:
{
 "title": "Tytuł posta",
 "text": "Treść posta",
 "hashtags": ["hashtag1","hashtag2","hashtag3"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  // 👇 Nowe API — dane tekstowe są w candidates[0].content.parts
  const parts = response.candidates?.[0]?.content?.parts || [];
  const fullText = parts.map((p: any) => p.text || "").join("\n");

  try {
    const json = JSON.parse(fullText.match(/\{[\s\S]*\}/)?.[0] || "{}");
    return {
      title: json.title || "",
      text: json.text || fullText,
      hashtags: json.hashtags || [],
    };
  } catch {
    return { title: "", text: fullText, hashtags: [] };
  }
}

async function generateImage(
  productContent: string,
  title: string,
  apiKey: string
): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
Create a clean, professional 1:1 marketing image for this product:
Product: ${title}
Key features: ${productContent.slice(0, 200).replace(/\s+/g, " ")}
Style: modern, elegant, social-media ready.
`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const parts = result.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    return null;
  } catch (err) {
    console.error("generateImage:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { productUrl, tone = "promo", platform = "facebook" } =
      await req.json();

    if (!productUrl)
      return NextResponse.json({ error: "Brak productUrl" }, { status: 400 });

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        { error: "Brak GOOGLE_GEMINI_API_KEY w .env.local" },
        { status: 500 }
      );

    const productContent = await fetchProductContent(productUrl);
    if (!productContent)
      return NextResponse.json(
        { error: "Nie udało się pobrać treści produktu" },
        { status: 400 }
      );

    const post = await generatePostContent(productContent, tone, platform, apiKey);
    const imageUrl = await generateImage(productContent, post.title, apiKey);

    return NextResponse.json({
      title: post.title,
      postText: post.text,
      hashtags: post.hashtags,
      imageUrl,
      meta: {
        tone,
        platform,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    console.error("Generation error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
