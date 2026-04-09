import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";

// Lightweight health check used by Railway deploy gating and external
// uptime monitors. Returns 200 only when the server can reach the database.
// Any 5xx response tells Railway not to promote a new deploy over the
// currently-healthy one.
export async function GET(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");

  try {
    const supabase = supabaseServer();
    const { error } = await supabase.from("churches").select("id").limit(1);

    if (error) {
      return res.status(503).json({
        status: "unhealthy",
        db: "error",
        error: error.message,
      });
    }

    return res.status(200).json({
      status: "ok",
      db: "ok",
      uptime: process.uptime(),
    });
  } catch (err) {
    return res.status(503).json({
      status: "unhealthy",
      db: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
