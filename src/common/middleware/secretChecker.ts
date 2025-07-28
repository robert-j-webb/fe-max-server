import { type NextFunction, type Request, type Response } from "express";
import { readFile } from "node:fs/promises";

export async function secretChecker(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const maxSecret = await readFile("/tmp/max-secret", "utf-8");
  if (
    (req.headers["max-secret"] as string | undefined)?.trim() !==
    maxSecret.trim()
  ) {
    res.status(401).json({ error: "Unauthorized" });
    throw new Error("Unauthorized");
  }
  next();
}
