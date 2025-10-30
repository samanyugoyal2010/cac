import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

function loadRootEnv() {
  const rootEnvPath = path.resolve(process.cwd(), "../.env");
  if (!fs.existsSync(rootEnvPath)) return;

  const content = fs.readFileSync(rootEnvPath, { encoding: "utf-8" });
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant"; // GPT-OSS default on Groq

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
- First, ONE short patient-facing line. If benign and confidence is very high, use reassuring language (e.g., "You're healthy; this looks benign."). Avoid absolute guarantees.
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
        model: GROQ_MODEL,
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
