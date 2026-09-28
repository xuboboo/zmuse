import { Hono } from "hono";
import type { DesktopService } from "./desktop.ts";

export function desktopRoutes(desktop: DesktopService): Hono<{ Variables: { owner: string } }> {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) => c.json(await desktop.snapshot(c.get("owner"))));
  app.post("/start", async (c) => c.json(await desktop.start(c.get("owner"))));
  app.post("/stop", async (c) => c.json(await desktop.stop(c.get("owner"))));
  return app;
}
