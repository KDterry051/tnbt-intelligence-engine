cat > /Users/keithterry/tnbt-intelligence-engine/src/app/upload/page.tsx << 'ENDOFFILE'
"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    title: "",
    episode_number: "",
    episode_type: "interview",
    guest_name: "",
    topic_category: "",
    description: "",
  });

  const topicCategories = [
    "AI & Technology", "Faith & Culture", "Masculinity", "Race & Identity",
    "Economics & Wealth", "Leadership", "Institutional Distrust", "Grief & Reinvention",
    "Power & Politics", "Societal Transformation",
  ];

  const handleUpload = async () => {
    if (!file || !metadata.title || !metadata.episode_type || !metadata.topic_category) {
      setError("Title, episode type, and topic category are required.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(5);

    try {
      // Step 1 — Get signed upload URL from our API
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title,
          episodeNumber: metadata.episode_number,
          episodeType: metadata.episode_type,
          guestName: metadata.guest_name,
          topicCategory: metadata.topic_category,
          description: metadata.description,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error || "Failed to get upload URL");

      setProgress(15);
      setEpisodeId(urlData.episodeId);

      // Step 2 — Upload MP4 directly to Supabase Storage
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 80) + 15;
          setProgress(pct);
        }
      };

      await new Promise<void>((resolve, reject) => {
        xhr.open("PUT", urlData.signedUrl);
        xhr.setRequestHeader("Content-Type", "video/mp4");
        xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setProgress(100);
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
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>✓</div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", marginBottom: "12px", color: "#d4ff00" }}>Episode Uploaded</h1>
          <p style={{ color: "#a1a1aa", marginBottom: "24px" }}>{metadata.title}</p>
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", padding: "20px", marginBottom: "24px", textAlign: "left" }}>
            <p style={{ fontSize: "12px", color: "#71717a", fontFamily: "monospace", marginBottom: "8px" }}>EPISODE ID</p>
            <p style={{ fontFamily: "monospace", fontSize: "14px", color: "#d4ff00", wordBreak: "break-all" }}>{episodeId}</p>
          </div>
          <p style={{ color: "#71717a", fontSize: "14px" }}>Copy that Episode ID — you will need it to trigger transcription.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "white", padding: "2rem" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>

        <div style={{ marginBottom: "40px" }}>
          <p style={{ fontSize: "12px", fontFamily: "monospace", color: "#71717a", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>TNBT Intelligence Engine</p>
          <h1 style={{ fontSize: "36px", fontWeight: "800", letterSpacing: "-0.5px" }}>Upload Episode</h1>
          <p style={{ color: "#71717a", marginTop: "8px" }}>MP4 uploads directly to Supabase Storage. No size limit.</p>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "14px 16px", marginBottom: "24px", color: "#f87171" }}>
            {error}
          </div>
        )}

        {/* File selector */}
        <div
          onClick={() => !uploading && document.getElementById("fileInput")?.click()}
          style={{ border: `2px dashed ${file ? "#d4ff00" : "#3f3f46"}`, borderRadius: "12px", padding: "40px", textAlign: "center", cursor: uploading ? "not-allowed" : "pointer", marginBottom: "24px", background: file ? "rgba(212,255,0,0.03)" : "transparent", transition: "all 0.2s" }}
        >
          <input id="fileInput" type="file" accept="video/mp4" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file ? (
            <>
              <p style={{ color: "#d4ff00", fontWeight: "600", fontSize: "16px", marginBottom: "4px" }}>{file.name}</p>
              <p style={{ color: "#71717a", fontSize: "14px" }}>{(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "32px", marginBottom: "12px" }}>📁</p>
              <p style={{ color: "#a1a1aa", fontWeight: "500" }}>Click to select MP4</p>
              <p style={{ color: "#52525b", fontSize: "13px", marginTop: "4px" }}>Any size — uploads directly to Supabase</p>
            </>
          )}
        </div>

        {/* Metadata fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>Episode Title <span style={{ color: "#d4ff00" }}>*</span></label>
            <input type="text" value={metadata.title} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} placeholder="Why the Black Church Lost the Culture War" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>Episode Number</label>
              <input type="number" value={metadata.episode_number} onChange={(e) => setMetadata({ ...metadata, episode_number: e.target.value })} placeholder="47" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>Episode Type <span style={{ color: "#d4ff00" }}>*</span></label>
              <select value={metadata.episode_type} onChange={(e) => setMetadata({ ...metadata, episode_type: e.target.value })} style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none" }}>
                <option value="interview">Interview</option>
                <option value="solo">Solo</option>
                <option value="panel">Panel</option>
                <option value="short">Short</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>Topic Category <span style={{ color: "#d4ff00" }}>*</span></label>
            <select value={metadata.topic_category} onChange={(e) => setMetadata({ ...metadata, topic_category: e.target.value })} style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none" }}>
              <option value="">Select a category</option>
              {topicCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#a1a1aa", marginBottom: "6px" }}>Guest Name</label>
            <input type="text" value={metadata.guest_name} onChange={(e) => setMetadata({ ...metadata, guest_name: e.target.value })} placeholder="Dr. Michael Eric Dyson" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "12px 14px", color: "white", fontSize: "15px", outline: "none" }} />
          </div>

        </div>

        {/* Progress bar */}
        {uploading && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "#a1a1aa" }}>{progress < 15 ? "Creating episode record..." : progress < 95 ? "Uploading to Supabase..." : "Finalizing..."}</span>
              <span style={{ fontSize: "13px", fontFamily: "monospace", color: "#d4ff00" }}>{progress}%</span>
            </div>
            <div style={{ height: "6px", background: "#27272a", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#d4ff00", borderRadius: "3px", transition: "width 0.3s ease" }} />
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !file || !metadata.title || !metadata.topic_category}
          style={{ width: "100%", padding: "16px", background: uploading || !file || !metadata.title || !metadata.topic_category ? "#27272a" : "#d4ff00", color: uploading || !file || !metadata.title || !metadata.topic_category ? "#52525b" : "#000", fontWeight: "700", fontSize: "16px", borderRadius: "10px", border: "none", cursor: uploading || !file || !metadata.title || !metadata.topic_category ? "not-allowed" : "pointer", transition: "all 0.2s" }}
        >
          {uploading ? `Uploading... ${progress}%` : "Upload Episode to TNBT Engine"}
        </button>

      </div>
    </div>
  );
}
