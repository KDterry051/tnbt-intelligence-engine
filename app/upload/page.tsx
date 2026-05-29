"use client";
import { useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

type EpisodeType = "solo" | "interview" | "panel" | "short";
type TopicCategory = "ai_and_future" | "masculinity" | "race" | "economics" | "leadership" | "faith" | "grief" | "reinvention" | "power" | "identity" | "institutional_distrust" | "societal_transformation";

interface EpisodeMetadata {
  title: string;
  episode_type: EpisodeType | "";
  guest_name: string;
  topic_category: TopicCategory | "";
  episode_number: string;
  description: string;
}

type UploadStage = "idle" | "file_selected" | "uploading" | "creating_record" | "complete" | "error";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function EpisodeUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [metadata, setMetadata] = useState<EpisodeMetadata>({
    title: "", episode_type: "", guest_name: "", topic_category: "", episode_number: "", description: "",
  });

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "video/mp4") { processFile(dropped); }
    else { setErrorMessage("Only MP4 files are accepted."); setStage("error"); }
  }, []);

  const processFile = (selectedFile: File) => {
    setFile(selectedFile); setStage("file_selected"); setErrorMessage("");
    const url = URL.createObjectURL(selectedFile);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { setVideoDuration(video.duration); URL.revokeObjectURL(url); };
    video.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "video/mp4") { setErrorMessage("Only MP4 files are accepted."); setStage("error"); return; }
    processFile(selected);
  };

  const handleMetadataChange = (field: keyof EpisodeMetadata, value: string) => {
    setMetadata((prev) => ({ ...prev, [field]: value }));
  };

  const isFormValid = (): boolean => {
    return !!file && metadata.title.trim().length > 0 && metadata.episode_type !== "" && metadata.topic_category !== "";
  };

  const handleSubmit = async () => {
    if (!file || !isFormValid()) return;
    try {
      setStage("uploading"); setUploadProgress(0);
      const timestamp = Date.now();
      const safeTitle = metadata.title.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40);
      const storagePath = `episodes/${timestamp}_${safeTitle}.mp4`;
      let fakeProgress = 0;
      const progressInterval = setInterval(() => {
        fakeProgress += Math.random() * 8;
        if (fakeProgress >= 90) fakeProgress = 90;
        setUploadProgress(Math.round(fakeProgress));
      }, 400);
      const { error: storageError } = await supabase.storage.from("episode-videos").upload(storagePath, file, { contentType: "video/mp4", upsert: false });
      clearInterval(progressInterval);
      if (storageError) throw new Error("Storage upload failed: " + storageError.message);
      setUploadProgress(100);
      setStage("creating_record");
      const { data: episode, error: dbError } = await supabase.from("episodes").insert([{
        title: metadata.title.trim(),
        episode_type: metadata.episode_type,
        guest_name: metadata.guest_name.trim() || null,
        topic_category: metadata.topic_category,
        episode_number: metadata.episode_number ? parseInt(metadata.episode_number) : null,
        description: metadata.description.trim() || null,
        video_storage_path: storagePath,
        video_file_size_bytes: file.size,
        video_duration_seconds: videoDuration ? Math.round(videoDuration) : null,
        status: "uploaded",
        created_at: new Date().toISOString(),
      }]).select().single();
      if (dbError) throw new Error("Database record creation failed: " + dbError.message);
      setEpisodeId(episode.id);
      setStage("complete");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(message); setStage("error");
    }
  };

  const handleReset = () => {
    setFile(null); setVideoDuration(null); setStage("idle"); setUploadProgress(0);
    setErrorMessage(""); setEpisodeId(null); setIsDragging(false);
    setMetadata({ title: "", episode_type: "", guest_name: "", topic_category: "", episode_number: "", description: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isUploading = stage === "uploading" || stage === "creating_record";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-6 md:p-10">
      <div className="max-w-3xl mx-auto mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs font-bold tracking-[0.25em] uppercase text-[#ff4d00] border border-[#ff4d00]/40 px-3 py-1 rounded-full">Module 1</span>
          <span className="text-xs text-zinc-500 tracking-widest uppercase">TNBT Intelligence Engine</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none mt-3" style={{ fontFamily: "Georgia, serif" }}>Episode Upload</h1>
        <p className="text-zinc-400 text-lg mt-3 leading-relaxed">Upload an MP4 file from your external drive and add episode metadata. The engine will process, transcribe, and analyze the content automatically.</p>
      </div>
      <div className="max-w-3xl mx-auto space-y-8">
        {stage === "complete" && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            </div>
            <h2 className="text-2xl font-bold text-emerald-300">Episode Uploaded Successfully</h2>
            <p className="text-zinc-400 mt-2 text-base">Record created in Supabase with status <span className="text-emerald-400 font-semibold">uploaded</span>.</p>
            {episodeId && <p className="text-zinc-500 text-sm mt-3 font-mono">Episode ID: {episodeId}</p>}
            <button onClick={handleReset} className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors text-base">Upload Another Episode</button>
          </div>
        )}
        {isUploading && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-8 space-y-6">
            <div className="flex items-center gap-4">
              <svg className="w-6 h-6 text-[#ff4d00] animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              <div>
                <p className="font-semibold text-white text-lg">{file?.name}</p>
                <p className="text-zinc-400 text-sm">{stage === "uploading" ? "Uploading to Supabase Storage -- " + uploadProgress + "%" : "Creating episode record..."}</p>
              </div>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#ff4d00] to-[#ff8c42] rounded-full transition-all duration-300" style={{ width: (stage === "creating_record" ? 100 : uploadProgress) + "%" }}/>
            </div>
          </div>
        )}
        {stage === "error" && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6">
            <p className="font-semibold text-red-300 text-base">Upload Failed</p>
            <p className="text-red-400 text-sm mt-1">{errorMessage}</p>
            <button onClick={handleReset} className="mt-3 text-sm text-red-300 underline">Start over</button>
          </div>
        )}
        {(stage === "idle" || stage === "file_selected") && (
          <>
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => !file && fileInputRef.current?.click()}
              className={"relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer " + (isDragging ? "border-[#ff4d00] bg-[#ff4d00]/5" : file ? "border-emerald-500/40 bg-emerald-950/10 cursor-default" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50")}>
              <input ref={fileInputRef} type="file" accept="video/mp4" onChange={handleFileChange} className="hidden"/>
              {!file ? (
                <div className="p-12 text-center space-y-4">
                  <div className="w-20 h-20 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto">
                    <svg className="w-10 h-10 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"/></svg>
                  </div>
                  <p className="text-xl font-semibold text-white">Drop your MP4 here</p>
                  <p className="text-zinc-500 text-base">or <span className="text-[#ff4d00] underline underline-offset-2">browse your external drive</span></p>
                  <p className="text-zinc-600 text-sm">MP4 files only</p>
                </div>
              ) : (
                <div className="p-6 flex items-center gap-5">
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.361a1 1 0 01-1.447.894L15 14M4 6h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-lg truncate">{file.name}</p>
                    <div className="flex gap-4 mt-1 text-sm text-zinc-400">
                      <span>{formatBytes(file.size)}</span>
                      {videoDuration !== null && <span>{formatDuration(videoDuration)}</span>}
                      <span className="text-emerald-400 font-medium">MP4 confirmed</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleReset(); }} className="text-zinc-500 hover:text-zinc-300 p-2 rounded-lg hover:bg-zinc-800 flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              )}
            </div>
            {file && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-800"/>
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500">Episode Metadata</span>
                  <div className="h-px flex-1 bg-zinc-800"/>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-zinc-300">Episode Title <span className="text-[#ff4d00]">*</span></label>
                  <input type="text" value={metadata.title} onChange={(e) => handleMetadataChange("title", e.target.value)} placeholder="e.g. The Death of the Black Church" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00]/60 transition-colors"/>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-zinc-300">Episode Number</label>
                  <input type="number" value={metadata.episode_number} onChange={(e) => handleMetadataChange("episode_number", e.target.value)} placeholder="e.g. 12" min={1} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00]/60 transition-colors"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-zinc-300">Episode Type <span className="text-[#ff4d00]">*</span></label>
                    <select value={metadata.episode_type} onChange={(e) => handleMetadataChange("episode_type", e.target.value as EpisodeType)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base focus:outline-none focus:border-[#ff4d00]/60 transition-colors appearance-none cursor-pointer">
                      <option value="" disabled>Select type</option>
                      <option value="solo">Solo</option>
                      <option value="interview">Interview</option>
                      <option value="panel">Panel</option>
                      <option value="short">Short</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-zinc-300">Topic Category <span className="text-[#ff4d00]">*</span></label>
                    <select value={metadata.topic_category} onChange={(e) => handleMetadataChange("topic_category", e.target.value as TopicCategory)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base focus:outline-none focus:border-[#ff4d00]/60 transition-colors appearance-none cursor-pointer">
                      <option value="" disabled>Select category</option>
                      <option value="ai_and_future">AI and the Future</option>
                      <option value="masculinity">Masculinity</option>
                      <option value="race">Race</option>
                      <option value="economics">Economics</option>
                      <option value="leadership">Leadership</option>
                      <option value="faith">Faith</option>
                      <option value="grief">Grief</option>
                      <option value="reinvention">Reinvention</option>
                      <option value="power">Power</option>
                      <option value="identity">Identity</option>
                      <option value="institutional_distrust">Institutional Distrust</option>
                      <option value="societal_transformation">Societal Transformation</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-zinc-300">Guest Name <span className="text-zinc-600 font-normal text-xs">(optional)</span></label>
                  <input type="text" value={metadata.guest_name} onChange={(e) => handleMetadataChange("guest_name", e.target.value)} placeholder="e.g. Dr. Michael Eric Dyson" className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00]/60 transition-colors"/>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-zinc-300">Description <span className="text-zinc-600 font-normal text-xs">(optional)</span></label>
                  <textarea value={metadata.description} onChange={(e) => handleMetadataChange("description", e.target.value)} placeholder="Notes about this episode, key timestamps, themes to prioritize..." rows={4} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3.5 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-[#ff4d00]/60 transition-colors resize-none leading-relaxed"/>
                </div>
                <p className="text-zinc-600 text-sm"><span className="text-[#ff4d00]">*</span> Required fields</p>
                <button onClick={handleSubmit} disabled={!isFormValid()} className={"w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all duration-200 " + (isFormValid() ? "bg-[#ff4d00] hover:bg-[#e63d00] text-white shadow-lg" : "bg-zinc-800 text-zinc-600 cursor-not-allowed")}>
                  Upload Episode to TNBT Engine
                </button>
                {!isFormValid() && <p className="text-center text-zinc-600 text-sm">Complete all required fields to enable upload</p>}
              </div>
            )}
          </>
        )}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-zinc-500 mb-4">What Happens After Upload</p>
          <div className="flex flex-wrap gap-2">
            {["uploaded","processing","audio extracted","transcribing","transcribed","analyzing","analyzed","reviewing","ready to publish"].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-2">
                <span className={"text-xs font-semibold px-3 py-1.5 rounded-full border " + (i === 0 ? "border-[#ff4d00]/40 text-[#ff4d00] bg-[#ff4d00]/5" : "border-zinc-700 text-zinc-500")}>{s}</span>
                {i < arr.length - 1 && <svg className="w-3 h-3 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
