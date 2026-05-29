import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const episodeType = formData.get("episode_type") as string;
    const guestName = formData.get("guest_name") as string;
    const topicCategory = formData.get("topic_category") as string;
    const episodeNumber = formData.get("episode_number") as string;
    const description = formData.get("description") as string;

    if (!file || !title || !episodeType || !topicCategory) {
      return NextResponse.json(
        { error: "Missing required fields: file, title, episode_type, topic_category" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const epPrefix = episodeNumber ? `ep${episodeNumber.padStart(3, "0")}-` : "";
    const fileName = `${epPrefix}${slug}-${timestamp}.mp4`;
    const storagePath = `episodes/${fileName}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const { error: storageError } = await supabase.storage
      .from("episode-videos")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: false,
      });

    if (storageError) {
      console.error("Storage upload error:", storageError);
      return NextResponse.json(
        { error: `Storage upload failed: ${storageError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("episode-videos")
      .getPublicUrl(storagePath);

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
        video_url: urlData?.publicUrl || null,
        file_size_bytes: file.size,
        status: "uploaded",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database insert error:", dbError);
      await supabase.storage.from("episode-videos").remove([storagePath]);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      episode,
      storagePath,
      message: `Episode "${title}" uploaded successfully`,
    });
  } catch (error) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: "Internal server error during upload" },
      { status: 500 }
    );
  }
}
