"use client";

import { useState } from "react";
import { z } from "zod";

const schema = z.object({
  productUrl: z.string().url("Podaj poprawny URL"),
  tone: z.enum(["neutral", "promo", "playful"]).default("promo"),
  platform: z.enum(["facebook", "instagram", "linkedin"]).default("facebook"),
});

type GenResp = {
  postText: string;
  title?: string;
  hashtags?: string[];
  imageUrl?: string | null;
  meta?: Record<string, any>;
};

const LoadingAnimation = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2">
    <div className="flex space-x-1">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
    </div>
    <span className="text-blue-400">{text}</span>
  </div>
);

export default function Page() {
  const [productUrl, setProductUrl] = useState("");
  const [tone, setTone] = useState<"neutral"|"promo"|"playful">("promo");
  const [platform, setPlatform] = useState<"facebook"|"instagram"|"linkedin">("facebook");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<GenResp | null>(null);
  const [postText, setPostText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [pubOk, setPubOk] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setGen(null);
    setPubOk(null);
    const parse = schema.safeParse({ productUrl, tone, platform });
    if (!parse.success) {
      setError(parse.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parse.data),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: GenResp = await res.json();
      setGen(data);
      setPostText(data.postText);
    } catch (e:any) {
      setError(e.message ?? "Błąd generowania");
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!postText) {
      setError("Brak treści posta do publikacji");
      return;
    }
    setPublishing(true);
    setError(null);
    setPubOk(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productUrl,
          platform,
          postText,
          metadata: gen?.meta ?? {},
          imageUrl: gen?.imageUrl ?? null,
          title: gen?.title ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPubOk(data?.status ?? "OK");
    } catch (e:any) {
      setError(e.message ?? "Błąd publikacji");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <h1 className="text-2xl font-semibold">Wygeneruj post z linku do produktu</h1>
        <div>
          <label className="label" htmlFor="productUrl">URL produktu</label>
          <input id="productUrl" className="input" placeholder="https://sklep.pl/produkt/xyz" value={productUrl} onChange={e=>setProductUrl(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Ton</label>
            <select className="input" value={tone} onChange={e=>setTone(e.target.value as any)}>
              <option value="promo">Promocyjny</option>
              <option value="neutral">Neutralny</option>
              <option value="playful">Lekki / zabawny</option>
            </select>
          </div>
          <div>
            <label className="label">Platforma</label>
            <select className="input" value={platform} onChange={e=>setPlatform(e.target.value as any)}>
              <option value="facebook">Facebook</option>
              <option value="instagram" disabled>Instagram</option>
              <option value="linkedin" disabled>LinkedIn</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? <LoadingAnimation text="Generuję..." /> : "Generuj post"}
          </button>
          {gen && (
            <button className="btn" onClick={()=>{setGen(null); setPostText(""); setPubOk(null);}}>Reset</button>
          )}
        </div>
        {error && <p className="text-red-400">{error}</p>}
      </section>

      {gen && (
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">Podgląd i edycja</h2>
          {gen.title && <p className="text-lg font-medium">{gen.title}</p>}
          <div>
            <label className="label">Treść posta</label>
            <textarea className="textarea min-h-[220px]" value={postText} onChange={e=>setPostText(e.target.value)} />
          </div>
          {gen.hashtags && gen.hashtags.length > 0 && (
            <div className="text-sm text-neutral-300">
              Sugestie hashtagów: {gen.hashtags.map(h=>`#${h}`).join(" ")}
            </div>
          )}
          {gen.imageUrl && (
            <div className="mt-2">
              <img src={gen.imageUrl} alt="Proponowana grafika" className="rounded-xl border border-neutral-800" />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? <LoadingAnimation text="Publikuję..." /> : "Zatwierdź i opublikuj (Make.com)"}
            </button>
            {pubOk && <span className="text-green-400 self-center">✓ Opublikowano: {pubOk}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
