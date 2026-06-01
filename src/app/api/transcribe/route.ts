import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import OpenAI from "openai";

const execAsync = promisify(exec);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function updateEpisodeStatus(episodeId: string, status: string) {
  const { error } = await supabase
    .from("episodes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", episodeId);
  if (error) console.error(`Failed to update status to ${status}:`, error);
}

export async function POST(request: NextRequest) {
  const tmpVideoPath = join(tmpdir(), `tnbt-video-${Date.now()}.mp4`);
  const tmpAudioPath = join(tmpdir(), `tnbt-audio-${Date.now()}.mp3`);

  try {
    const { episodeId } = await request.json();

    if (!episodeId) {
      return NextResponse.json({ error: "episodeId is required" }, { status: 400 });
    }

    const { data: episode, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("id", episodeId)
      .single();

    if (fetchError || !episode) {
      return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    }

    if (!episode.video_file_path) {
      return NextResponse.json({ error: "Episode has no video_file_path — upload the MP4 first" }, { status: 400 });
    }

    await updateEpisodeStatus(episodeId, "processing");

    const { data: videoData, error: downloadError } = await supabase.storage
      .from("episode-videos")
      .download(episode.video_file_path);

    if (downloadError || !videoData) {
      await updateEpisodeStatus(episodeId, "transcription_failed");
      return NextResponse.json({ error: `Failed to download video: ${downloadError?.message}` }, { status: 500 });
    }

    const videoBuffer = Buffer.from(await videoData.arrayBuffer());
    await writeFile(tmpVideoPath, videoBuffer);

    await updateEpisodeStatus(episodeId, "audio_extracted");

    const ffmpegPath = require("ffmpeg-static") as string;
    const ffmpegCommand = `"${ffmpegPath}" -i "${tmpVideoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k "${tmpAudioPath}" -y`;

    try {
      await execAsync(ffmpegCommand);
    } catch (ffmpegError) {
      console.error("ffmpeg extraction failed:", ffmpegError);
      await updateEpisodeStatus(episodeId, "transcription_failed");
      return NextResponse.json({ error: "Audio extraction failed" }, { status: 500 });
    }

    const audioBuffer = await readFile(tmpAudioPath);
    const audioFileName = episode.video_file_path
      .replace("episodes/", "audio/")
      .replace(".mp4", ".mp3");

    const { error: audioUploadError } = await supabase.storage
      .from("episode-audio")
      .upload(audioFileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

    if (!audioUploadError) {
      const { data: audioUrlData } = supabase.storage
        .from("episode-audio")
        .getPublicUrl(audioFileName);
      await supabase.from("episodes").update({ audio_url: audioUrlData?.publicUrl }).eq("id", episodeId);
    }

    await updateEpisodeStatus(episodeId, "transcribing");

    const audioFile = await readFile(tmpAudioPath);
    const audioBlob = new Blob([audioFile], { type: "audio/mpeg" });
    const audioFileForWhisper = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });

    const transcriptResponse = await openai.audio.transcriptions.create({
      file: audioFileForWhisper,
      model: "whisper-1",
      response_format: "text",
    });

    const verboseResponse = await openai.audio.transcriptions.create({
      file: audioFileForWhisper,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const transcript = transcriptResponse as unknown as string;
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.round(verboseResponse.duration || 0);

    const timestampedLines = verboseResponse.segments?.map((seg) => {
      const startMin = Math.floor((seg.start || 0) / 60);
      const startSec = Math.floor((seg.start || 0) % 60).toString().padStart(2, "0");
      return `[${startMin}:${startSec}] ${seg.text.trim()}`;
    });
    const transcriptTimestamped = timestampedLines?.join("\n") || transcript;

    const { error: updateError } = await supabase
      .from("episodes")
      .update({
        transcript,
        transcript_timestamped: transcriptTimestamped,
        transcript_segments: verboseResponse.segments || [],
        duration_seconds: durationSeconds,
        word_count: wordCount,
        status: "transcribed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    if (updateError) {
      await updateEpisodeStatus(episodeId, "transcription_failed");
      return NextResponse.json({ error: `Failed to save transcript: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      episodeId,
      wordCount,
      durationSeconds,
      durationFormatted: `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`,
      message: `Transcription complete — ${wordCount} words, ${Math.floor(durationSeconds / 60)} minutes`,
    });

  } catch (error) {
    console.error("Transcription route error:", error);
    return NextResponse.json({ error: "Internal server error during transcription" }, { status: 500 });
  } finally {
    await unlink(tmpVideoPath).catch(() => {});
    await unlink(tmpAudioPath).catch(() => {});
  }
}

export const maxDuration = 300;
