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
    throw new Error("Pusher credentials not configured");
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherInstance;
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
