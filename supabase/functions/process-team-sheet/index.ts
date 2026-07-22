// =============================================================================
// process-team-sheet
// Reads an uploaded team sheet (image / PDF), extracts the players, and writes
// them to team_sheet_players so live notes can be attributed by shirt number.
//
// Body: { team_sheet_id: string }
// =============================================================================
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { callClaude, MODELS, serviceClient, userClient } from "../_shared/clients.ts";

interface ExtractedPlayer {
  shirt_number: number | null;
  player_name: string | null;
  position: string | null;
  team_name: string | null;
  is_starter: boolean;
  confidence_score: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { team_sheet_id } = await req.json();
    if (!team_sheet_id) return jsonResponse({ error: "Missing team_sheet_id" }, 400);

    // Confirm the caller can access this team sheet (RLS).
    const supa = userClient(req);
    const { data: sheet, error } = await supa
      .from("team_sheets").select("*").eq("id", team_sheet_id).single();
    if (error || !sheet) return jsonResponse({ error: "Not found or not permitted" }, 403);

    const admin = serviceClient();
    await admin.from("team_sheets").update({ processing_status: "processing" })
      .eq("id", team_sheet_id);

    // Build the source text. For images/PDFs you would OCR / vision-extract here;
    // for manual entry the extracted_text is supplied directly.
    let sourceText = sheet.extracted_text ?? "";
    if (!sourceText && sheet.file_path) {
      const { data: file } = await admin.storage.from("uploads").download(sheet.file_path);
      if (file) sourceText = await ocr(file); // implement OCR / vision per file type
    }

    // Ask the model to structure the roster as JSON.
    const raw = await callClaude({
      system:
        "You extract football team sheets into JSON. Return ONLY a JSON array of " +
        "players with keys: shirt_number (int|null), player_name (string|null), " +
        "position (string|null), team_name (string|null), is_starter (bool), " +
        "confidence_score (0-1). Do not invent players.",
      prompt: sourceText || "(no text supplied)",
      model: MODELS.teamSheet,
      feature: "process-team-sheet",
      log: { admin, userId: sheet.uploaded_by },
    });

    const players = safeParse(raw);

    if (players.length) {
      const rows = players.map((p) => ({ team_sheet_id, ...p }));
      await admin.from("team_sheet_players").insert(rows);
    }

    await admin.from("team_sheets")
      .update({ processing_status: "completed", extracted_text: sourceText })
      .eq("id", team_sheet_id);

    return jsonResponse({ ok: true, count: players.length, players });
  } catch (e) {
    // Best-effort mark the sheet failed.
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.team_sheet_id) {
        await serviceClient().from("team_sheets")
          .update({ processing_status: "failed" }).eq("id", body.team_sheet_id);
      }
    } catch (_) { /* ignore */ }
    return jsonResponse({ error: String(e) }, 500);
  }
});

function safeParse(raw: string): ExtractedPlayer[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

// Placeholder OCR. Replace with a vision model or OCR service.
async function ocr(_file: Blob): Promise<string> {
  return "";
}
