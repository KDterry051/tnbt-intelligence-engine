import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function updateEpisodeStatus(episodeId: string, status: string) {
  await supabase
    .from("episodes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", episodeId);
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
      return NextResponse.json({ error: "No video_file_path on episode" }, { status: 400 });
    }

    await updateEpisodeStatus(episodeId, "processing");

    const { data: videoData, error: downloadError } = await supabase.storage
      .from("episode-videos")
      .download(episode.video_file_path);

    if (downloadError || !videoData) {
      await updateEpisodeStatus(episodeId, "transcription_failed");
      return NextResponse.json({ error: "Failed to download video" }, { status: 500 });
    }

    await writeFile(tmpVideoPath, Buffer.from(await videoData.arrayBuffer()));
    await updateEpisodeStatus(episodeId, "audio_extracted");

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpVideoPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioFrequency(16000)
        .audioChannels(1)
        .audioBitrate("64k")
        .output(tmpAudioPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

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
      await supabase
        .from("episodes")
        .update({ audio_url: audioUrlData?.publicUrl })
        .eq("id", episodeId);
    }

    await updateEpisodeStatus(episodeId, "transcribing");

    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    const audioFile = new File([audioBlob], "audio.mp3", { type: "audio/mpeg" });

    const transcriptResponse = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "text",
    });

    const verboseResponse = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const transcript = transcriptResponse as unknown as string;
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.round(verboseResponse.duration || 0);

    const timestampedLines = verboseResponse.segments?.map((seg) => {
      const m = Math.floor((seg.start || 0) / 60);
      const s = Math.floor((seg.start || 0) % 60).toString().padStart(2, "0");
      return `[${m}:${s}] ${seg.text.trim()}`;
    });

    const { error: updateError } = await supabase
      .from("episodes")
      .update({
        transcript,
        transcript_timestamped: timestampedLines?.join("\n") || transcript,
        transcript_segments: verboseResponse.segments || [],
        duration_seconds: durationSeconds,
        word_count: wordCount,
        status: "transcribed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    if (updateError) {
      await updateEpisodeStatus(episodeId, "transcription_failed");
      return NextResponse.json({ error: "Failed to save transcript" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      episodeId,
      wordCount,
      durationSeconds,
      message: `Transcription complete — ${wordCount} words, ${Math.floor(durationSeconds / 60)} minutes`,
    });

  } catch (error) {
    console.error("Transcription route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await unlink(tmpVideoPath).catch(() => {});
    await unlink(tmpAudioPath).catch(() => {});
  }
}

export const maxDuration = 300;
