import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { title, episodeType, guestName, topicCategory, episodeNumber, description, fileName, fileSize } = await request.json();

    if (!title || !episodeType || !topicCategory || !fileName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const timestamp = Date.now();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const epPrefix = episodeNumber ? `ep${String(episodeNumber).padStart(3, "0")}-` : "";
    const storagePath = `episodes/${epPrefix}${slug}-${timestamp}.mp4`;

    const { data: signedData, error: signedError } = await supabase.storage
      .from("episode-videos")
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      return NextResponse.json({ error: `Failed to create upload URL: ${signedError?.message}` }, { status: 500 });
    }

    const { data: episode, error: dbError } = await supabase
      .from("episodes")
      .insert({
        title,
        episode_number: episodeNumber ? parseInt(episodeNumber) : null,
        episode_type: episodeType,
        guest_name: guestName || null,
        topic_category: topicCategory,
        description: description || null,
        video_file_path: storagePath,
        file_size_bytes: fileSize || null,
        status: "uploaded",
      })
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      episodeId: episode.id,
      signedUrl: signedData.signedUrl,
      storagePath,
      token: signedData.token,
    });

  } catch (error) {
    console.error("Upload URL route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const maxDuration = 60;
