import { NextResponse } from "next/server";
import { getPusher } from "@/lib/pusher";

export async function GET() {
  try {
    const pusher = getPusher();
    return NextResponse.json({ 
      success: true, 
      message: "Pusher configured correctly",
      hasAppId: !!process.env.PUSHER_APP_ID,
      hasKey: !!process.env.PUSHER_KEY,
      hasSecret: !!process.env.PUSHER_SECRET,
      hasCluster: !!process.env.PUSHER_CLUSTER,
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
      hasAppId: !!process.env.PUSHER_APP_ID,
      hasKey: !!process.env.PUSHER_KEY,
      hasSecret: !!process.env.PUSHER_SECRET,
      hasCluster: !!process.env.PUSHER_CLUSTER,
    }, { status: 500 });
  }
}
