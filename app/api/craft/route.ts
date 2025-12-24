// app/api/craft/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { a, b } = await req.json();

  const prompt = `You are Infinite Craft. Combine "${a}" and "${b}". One noun only.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8,
    }),
  });

  const data = await res.json();
  return NextResponse.json({
    result: data.choices?.[0]?.message?.content?.trim() ?? "Unknown",
  });
}
