import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { productUrl, platform, postText, metadata = {}, imageUrl = null, title = null } = await req.json();

    console.log(imageUrl)

    if (!postText || typeof postText !== "string") {
      return NextResponse.json({ error: "postText wymagany" }, { status: 400 });
    }
    const webhook = process.env.MAKE_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json({ error: "Brak MAKE_WEBHOOK_URL w .env.local" }, { status: 500 });
    }

    // Payload do Make.com (przechodzi przez Webhook → scenariusz z akcją publikacji na FB)
    const payload = {
      platform: platform ?? "facebook",
      productUrl,
      postText,
      title,
      imageUrl,
      metadata,
      // Możesz dodać pola routingowe dla scenariusza
      source: "post-generator",
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Make.com webhook error: ${text}` }, { status: 502 });
    }

    const data = await res.json().catch(()=>({}));
    return NextResponse.json({ status: "OK", makeResponse: data });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
