import Pusher from "pusher";

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
  if (pusherInstance) {
    return pusherInstance;
  }

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || "eu";

  if (!appId || !key || !secret) {
    const missing = [];
    if (!appId) missing.push("PUSHER_APP_ID");
    if (!key) missing.push("PUSHER_KEY");
    if (!secret) missing.push("PUSHER_SECRET");
    throw new Error(`Pusher credentials not configured. Missing: ${missing.join(", ")}`);
  }

  try {
    pusherInstance = new Pusher({
      appId: appId,
      key: key,
      secret: secret,
      cluster: cluster,
      useTLS: true,
    });

    return pusherInstance;
  } catch (error) {
    throw new Error(`Failed to initialize Pusher: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export function publishToChannel(
  channel: string,
  event: string,
  data: any
): void {
  try {
    const pusher = getPusher();
    pusher.trigger(channel, event, data);
  } catch (error) {
    console.error("[Pusher] Publish error:", error);
  }
}
