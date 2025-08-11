import { type NextFunction, type Request, type Response } from "express";
import { readFile } from "node:fs/promises";

export async function secretChecker(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let maxSecret: string;
  try {
    maxSecret = await readFile("/tmp/max-secret", "utf-8");
  } catch (e) {
    res.status(500).json({ error: "No Secret Found" });
    throw new Error("No Secret Found");
  }
  const userSecret = req.headers["max-secret"] ?? req.query["max-secret"];
  if ((userSecret as string | undefined)?.trim() !== maxSecret.trim()) {
    res.status(401).json({ error: "Unauthorized" });
    throw new Error("Unauthorized");
  }
  next();
}
