import { z } from "zod";
import { db } from "@/lib/supabase";

const schema = z.object({ requestId: z.string().uuid(), rating: z.union([z.literal(1), z.literal(-1)]) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid feedback." }, { status: 400 });

  const { error } = await db()
    .from("feedback")
    .upsert({ request_id: parsed.data.requestId, rating: parsed.data.rating }, { onConflict: "request_id" });
  if (error) return Response.json({ error: "Could not save feedback." }, { status: 500 });
  return Response.json({ ok: true });
}
