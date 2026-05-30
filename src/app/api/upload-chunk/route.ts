import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get("chunk") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const totalChunks = parseInt(formData.get("totalChunks") as string);
    const episodeId = formData.get("episodeId") as string;
    const storagePath = formData.get("storagePath") as string;
    const isLastChunk = formData.get("isLastChunk") === "true";

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    // Store chunk temporarily with index
    const chunkPath = `chunks/${episodeId}/chunk-${String(chunkIndex).padStart(5, "0")}`;

    const { error: chunkError } = await supabase.storage
      .from("episode-videos")
      .upload(chunkPath, chunkBuffer, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (chunkError) {
      return NextResponse.json({ error: `Chunk upload failed: ${chunkError.message}` }, { status: 500 });
    }

    // If this is the last chunk, assemble all chunks
    if (isLastChunk) {
      const allChunks: Buffer[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const cp = `chunks/${episodeId}/chunk-${String(i).padStart(5, "0")}`;
        const { data, error } = await supabase.storage
          .from("episode-videos")
          .download(cp);

        if (error || !data) {
          return NextResponse.json({ error: `Failed to read chunk ${i}: ${error?.message}` }, { status: 500 });
        }

        allChunks.push(Buffer.from(await data.arrayBuffer()));
      }

      // Combine all chunks into final file
      const finalBuffer = Buffer.concat(allChunks);

      // Upload final assembled file
      const { error: finalError } = await supabase.storage
        .from("episode-videos")
        .upload(storagePath, finalBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (finalError) {
        return NextResponse.json({ error: `Final assembly failed: ${finalError.message}` }, { status: 500 });
      }

      // Clean up chunk files
      const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
        `chunks/${episodeId}/chunk-${String(i).padStart(5, "0")}`
      );
      await supabase.storage.from("episode-videos").remove(chunkPaths);

      return NextResponse.json({ success: true, assembled: true, storagePath });
    }

    return NextResponse.json({ success: true, assembled: false, chunkIndex });

  } catch (error) {
    console.error("Chunk upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
