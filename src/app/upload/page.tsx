"use client";

import { useState } from "react";
import * as tus from "tus-js-client";

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
    setProgress(3);
    setStatusText("Creating episode record...");

    try {
      // Step 1 — Create episode record and get storage path
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
      if (!urlRes.ok) throw new Error(urlData.error || "Failed to create episode record");

      setEpisodeId(urlData.episodeId);
      setProgress(5);
      setStatusText("Starting resumable upload...");

      // Step 2 — TUS resumable upload directly to Supabase
      // Supabase TUS endpoint
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const bucketName = "episode-videos";
      const tusEndpoint = `${supabaseUrl}/storage/v1/upload/resumable`;

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: tusEndpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 50 * 1024 * 1024, // 50MB chunks — handles 12GB files
          headers: {
            authorization: `Bearer ${supabaseAnonKey}`,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName,
            objectName: urlData.storagePath,
            contentType: "video/mp4",
            cacheControl: "3600",
          },
          onError: (err) => {
            console.error("TUS upload error:", err);
            reject(new Error(`Upload failed: ${err.message}`));
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const pct = Math.round((bytesUploaded / bytesTotal) * 92) + 5;
            setProgress(pct);
            const mb = Math.round(bytesUploaded / (1024 * 1024));
            const totalMb = Math.round(bytesTotal / (1024 * 1024));
            setStatusText(`Uploading ${mb} MB of ${totalMb} MB...`);
          },
          onSuccess: () => {
            resolve();
          },
        });

        // Check for previous incomplete upload and resume if found
        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
            setStatusText("Resuming previous upload...");
          }
          upload.start();
        });
      });

      setProgress(100);
      setStatusText("Upload complete");
      setUploading(false);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      setProgress(0);
      setStatusText("");
    }
  };

  if (episodeId && progress === 100) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090b", color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: "560px", width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>✓</div>
          <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "12px", color: "#d4ff00" }}>Episode Uploaded</h1>
          <p style={{ color: "#a1a1aa", marginBottom: "8px", fontSize: "18px" }}>{metadata.title}</p>
          <p style={{ color: "#52525b", marginBottom: "32px", fontSize: "14px" }}>Episode {metadata.episode_number} — {metadata.episode_type} — {metadata.topic_category}</p>
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "10px", padding: "24px", marginBottom: "24px", textAlign: "left" }}>
            <p style={{ fontSize: "11px", color: "#71717a", fontFamily: "monospace", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>Episode ID — Copy This Now</p>
            <p style={{ fontFamily: "monospace", fontSize: "15px", color: "#d4ff00", wordBreak: "break-all", lineHeight: "1.6" }}>{episodeId}</p>
          </div>
          <p style={{ color: "#71717a", fontSize: "14px", lineHeight: "1.6" }}>This Episode ID triggers transcription and analysis. Save it before leaving this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "white", padding: "2rem" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>

        <div style={{ marginBottom: "40px" }}>
          <p style={{ fontSize: "11px", fontFamily: "monospace", color: "#71717a", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>TNBT Intelligence Engine — Module 01</p>
          <h1 style={{ fontSize: "40px", fontWeight: "800", letterSpacing: "-0.5px", marginBottom: "8px" }}>Upload Episode</h1>
          <p style={{ color: "#71717a", fontSize: "15px" }}>Resumable upload — handles files up to 12GB. Picks up where it left off if connection drops.</p>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "14px 16px", marginBottom: "24px", color: "#f87171", fontSize: "14px" }}>
            {error}
          </div>
        )}

        <div
          onClick={() => !uploading && document.getElementById("fileInput")?.click()}
          style={{ border: `2px dashed ${file ? "#d4ff00" : "#3f3f46"}`, borderRadius: "12px", padding: "48px 40px", textAlign: "center", cursor: uploading ? "not-allowed" : "pointer", marginBottom: "28px", background: file ? "rgba(212,255,0,0.03)" : "transparent", transition: "all 0.2s" }}
        >
          <input id="fileInput" type="file" accept="video/mp4" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file ? (
            <>
              <p style={{ fontSize: "28px", marginBottom: "10px" }}>🎬</p>
              <p style={{ color: "#d4ff00", fontWeight: "600", fontSize: "17px", marginBottom: "6px" }}>{file.name}</p>
              <p style={{ color: "#71717a", fontSize: "14px" }}>{(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB — ready to upload</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "36px", marginBottom: "14px" }}>📁</p>
              <p style={{ color: "#a1a1aa", fontWeight: "600", fontSize: "16px", marginBottom: "6px" }}>Click to select MP4</p>
              <p style={{ color: "#52525b", fontSize: "13px" }}>Any size up to 12GB — resumable if interrupted</p>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "32px" }}>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#a1a1aa", marginBottom: "7px" }}>Episode Title <span style={{ color: "#d4ff00" }}>*</span></label>
            <input type="text" value={metadata.title} onChange={(e) => setMetadata({ ...metadata, title: e.target.value })} placeholder="Young Men and the Masculinity Crisis" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "13px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#a1a1aa", marginBottom: "7px" }}>Episode Number</label>
              <input type="number" value={metadata.episode_number} onChange={(e) => setMetadata({ ...metadata, episode_number: e.target.value })} placeholder="49" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "13px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#a1a1aa", marginBottom: "7px" }}>Episode Type <span style={{ color: "#d4ff00" }}>*</span></label>
              <select value={metadata.episode_type} onChange={(e) => setMetadata({ ...metadata, episode_type: e.target.value })} style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "13px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }}>
                <option value="solo">Solo</option>
                <option value="interview">Interview</option>
                <option value="panel">Panel</option>
                <option value="short">Short</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#a1a1aa", marginBottom: "7px" }}>Topic Category <span style={{ color: "#d4ff00" }}>*</span></label>
            <select value={metadata.topic_category} onChange={(e) => setMetadata({ ...metadata, topic_category: e.target.value })} style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "13px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }}>
              <option value="">Select a category</option>
              {topicCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#a1a1aa", marginBottom: "7px" }}>Guest Name <span style={{ color: "#52525b", fontWeight: "400" }}>(leave blank for solo)</span></label>
            <input type="text" value={metadata.guest_name} onChange={(e) => setMetadata({ ...metadata, guest_name: e.target.value })} placeholder="Dr. Michael Eric Dyson" style={{ width: "100%", background: "#18181b", border: "1px solid #3f3f46", borderRadius: "8px", padding: "13px 14px", color: "white", fontSize: "15px", outline: "none", boxSizing: "border-box" }} />
          </div>

        </div>

        {uploading && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "14px", color: "#a1a1aa" }}>{statusText}</span>
              <span style={{ fontSize: "14px", fontFamily: "monospace", color: "#d4ff00", fontWeight: "700" }}>{progress}%</span>
            </div>
            <div style={{ height: "8px", background: "#27272a", borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #d4ff00, #a8cc00)", borderRadius: "4px", transition: "width 0.4s ease" }} />
            </div>
            <p style={{ fontSize: "12px", color: "#52525b", marginTop: "8px" }}>Do not close this tab — upload will resume automatically if interrupted</p>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !file || !metadata.title || !metadata.topic_category}
          style={{ width: "100%", padding: "18px", background: uploading || !file || !metadata.title || !metadata.topic_category ? "#18181b" : "#d4ff00", color: uploading || !file || !metadata.title || !metadata.topic_category ? "#3f3f46" : "#000", fontWeight: "700", fontSize: "17px", borderRadius: "10px", border: uploading || !file || !metadata.title || !metadata.topic_category ? "1px solid #27272a" : "none", cursor: uploading || !file || !metadata.title || !metadata.topic_category ? "not-allowed" : "pointer", transition: "all 0.2s" }}
        >
          {uploading ? `Uploading... ${progress}%` : "Upload Episode to TNBT Engine"}
        </button>

      </div>
    </div>
  );
}
