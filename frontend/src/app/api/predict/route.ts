import { NextResponse } from "next/server";

const BACKEND_BASE = process.env.DERMASENSE_API_BASE ?? "http://localhost:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!BACKEND_BASE) {
    return NextResponse.json(
      { detail: "DERMASENSE_API_BASE is not configured." },
      { status: 500 },
    );
  }

  const targetUrl = new URL("/predict", BACKEND_BASE);
  const formData = await request.formData();

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Unknown error" }));
      return NextResponse.json(payload, { status: response.status });
    }

    const json = await response.json();
    return NextResponse.json(json);
  } catch (error) {
    console.error("Failed to reach backend", error);
    return NextResponse.json(
      { detail: "Inference service unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
}
