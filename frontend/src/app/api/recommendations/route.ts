import { NextResponse } from "next/server";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!GROQ_API_KEY) {
    return NextResponse.json(
      { detail: "GROQ_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let payload: { label?: string; confidence?: number };
  try {
    payload = (await request.json()) as { label?: string; confidence?: number };
  } catch {
    return NextResponse.json(
      { detail: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const { label, confidence } = payload;

  if (!label || typeof confidence !== "number") {
    return NextResponse.json(
      { detail: "Both label and confidence are required." },
      { status: 400 },
    );
  }

  const prompt = `You are DermaSense's clinical concierge. Based on the latest AI assessment for a skin lesion, craft concise product guidance for clinicians to share with patients.
Prediction label: ${label}
Confidence: ${(confidence * 100).toFixed(1)}%

Please provide:
- Three evidence-backed product or treatment recommendations tailored to the above result
- One lifestyle or monitoring suggestion
- Keep the tone professional, empathetic, and under 130 words total.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-oss-llama3-8b",
        temperature: 0.5,
        max_tokens: 320,
        messages: [
          {
            role: "system",
            content:
              "You are DermaSense, an AI dermatology assistant providing concise, clinically responsible product recommendations. Always emphasise that final decisions rest with licensed clinicians.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({ detail: "Unknown Groq error" }));
      return NextResponse.json(errorPayload, { status: response.status });
    }

    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { detail: "Groq response did not contain any recommendations." },
        { status: 502 },
      );
    }

    return NextResponse.json({ recommendations: content });
  } catch (error) {
    console.error("Failed to fetch Groq recommendations", error);
    return NextResponse.json(
      { detail: "Unable to generate recommendations at this time." },
      { status: 503 },
    );
  }
}
