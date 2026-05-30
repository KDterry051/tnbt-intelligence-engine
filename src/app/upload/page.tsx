"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [metadata, setMetadata] = useState({
    title: "",
    episode_number: "",
    episode_type: "solo",
    guest_name: "",
    topic_category: "",
  });

  const topicCategories = [
    "AI & Technology", "Faith & Culture", "Masculinity", "Race & Identity",
    "Economics & Wealth", "Leadership", "Institutional Distrust", "Grief & Reinvention",
    "Power & Politics", "Societal Transformation",
  ];

  const handleUpload = async () => {
    if (!file || !metadata.title || !metadata.topic_category) {
      setError("Title and topic category are required.");
      return;
    }
    setUploading(true);
    setError(null);
    setProgress(5);
    setStatusText("Creating episode record...");

    try {
      const res = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title,
          episodeNumber: metadata.episode_number,
          episodeType: metadata.episode_type,
          guestName: metadata.guest_name,
          topicCategory: metadata.topic_category,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create episode");

      setEpisodeId(data.episodeId);
      setProgress(10);
      setStatusText("Uploading to Supabase...");

      // Upload directly using the signed URL — service role signed so no auth needed
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 88) + 10;
            setProgress(pct);
            const mb = Math.round(e.loaded / 1024 / 1024);
            const total = Math.round(e.total / 1024 / 1024);
            setStatusText(`Uploading ${mb} MB of ${total} MB...`);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status} — ${xhr.responseText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", data.signedUrl);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.send(file);
      });

      setProgress(100);
      setStatusText("Complete");
      setUploading(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setProgress(0);
    }
  };

  if (episodeId && progress === 100) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090b", color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: "560px", width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>✓</div>
          <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "12px", color: "#d4ff00" }}>Episode Uploaded</h1>
          <p style={{ color: "#a1a1aa", marginBottom: "32px", fontSize: "18px" }}>{metadata.title}</p>
          <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: "10px", padding: "24px", marginBottom: "24px", textAlign: "left" }}>
            <p style={{ fontSize: "11px", color: "#71717a", fontFamily: "monospace", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>Episode ID — Copy This Now</p>
            <p style={{ fontFamily: "monospace", fontSize: "15px", color: "#d4ff00", wordBreak: "break-all", lineHeight: "1.6" }}>{episodeId}</p>
          </div>
          <p style={{ color: "#71717a", fontSize: "14px" }}>Save this ID. You will use it to trigger transcription.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "white", padding: "2rem" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <div style={{ marginBottom: "40px" }}>
          <p style={{ fontSize: "11px", fontFamily: "monospace", color: "#71717a", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>TNBT Intelligence Engine — Module 01</p>
          <h1 style={{ fontSize: "40px", fontWeight: "800", marginBottom: "8px" }}>Upload Episode</h1>
          <p style={{ color: "#71717a", fontSize: "15px" }}>Direct upload to Supabase Storage. Any size.</p>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "14px 16px", marginBottom: "24px", color: "#f87171" }}>{error}</div>
        )}

        <div onClick={() => !uploading && document.getElementById("fi")?.click()}
          style={{ border: `2px dashed ${file ? "#d4ff00" : "#3f3f46"}`, borderRadius: "12px", padding: "48px", textAlign: "center", cursor: "pointer", marginBottom: "28px", background: file ? "rgba(212,255,0,0.03)" : "transparent" }}>
          <input id="fi" type="file" accept="video/mp4" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file ? (
            <>
              <p style={{ fontSize: "28px", marginBottom: "10px" }}>🎬</p>
              <p style={{ color: "#d4ff00", fontWeight: "600", fontSize: "17px", marginBottom: "6px" }}>{file.name}</p>
              <p style={{ color: "#71717a" }}>{(file.size / 1024 / 1024 / 1024).toFixed(2)} GB</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "36px", marginBottom: "12px" }}>📁</p>
              <p style={{ color: "#a1a1aa", fontWeight: "600" }}>Click to select MP4</p>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#a1a1aa", marginBottom: "6px" }}>Episode Title *</label>
            <input type="text" value={metadata.title} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
              style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "#a1a1aa", marginBottom: "6px" }}>Episode Number</label>
              <input type="number" value={metadata.episode_number} onChange={(e) => setMetadata({ ...metadata, episode_number: e.target.value })}
                style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", color: "#a1a1aa", marginBottom: "6px" }}>Episode Type *</label>
              <select value={metadata.episode_type} onChange={(e) => setMetadata({ ...metadata, episode_type: e.target.value })}
                style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }}>
                <option value="solo">Solo</option>
                <option value="interview">Interview</option>
                <option value="panel">Panel</option>
                <option value="short">Short</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#a1a1aa", marginBottom: "6px" }}>Topic Category *</label>
            <select value={metadata.topic_category} onChange={(e) => setMetadata({ ...metadata, topic_category: e.target.value })}
              style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }}>
              <option value="">Select a category</option>
              {topicCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "#a1a1aa", marginBottom: "6px" }}>Guest Name (leave blank for solo)</label>
            <input type="text" value={metadata.guest_name} onChange={(e) => setMetadata({ ...metadata, guest_name: e.target.value })}
              style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        {uploading && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "14px", color: "#a1a1aa" }}>{statusText}</span>
              <span style={{ fontSize: "14px", fontFamily: "monospace", color: "#d4ff00" }}>{progress}%</span>
            </div>
            <div style={{ height: "8px", background: "#27272a", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#d4ff00", borderRadius: "4px", transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}

        <button onClick={handleUpload}
          disabled={uploading || !file || !metadata.title || !metadata.topic_category}
          style={{ width: "100%", padding: "18px", background: !file || !metadata.title || !metadata.topic_category ? "#18181b" : "#d4ff00", color: !file || !metadata.title || !metadata.topic_category ? "#3f3f46" : "#000", fontWeight: "700", fontSize: "17px", borderRadius: "10px", border: "1px solid #27272a", cursor: "pointer" }}>
          {uploading ? `${statusText} — ${progress}%` : "Upload Episode to TNBT Engine"}
        </button>
      </div>
    </div>
  );
}
