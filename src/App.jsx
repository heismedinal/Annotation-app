import { useState, useRef } from "react";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

const fmt = (s) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${m}:${sec}`;
};

const sentimentColor = (s) =>
  s === "POSITIVE" ? "#2ea043" : s === "NEGATIVE" ? "#f85149" : "#8b949e";

const speakerColor = (sp) => {
  const colors = ["#388bfd","#f78166","#ffa657","#7ee787","#d2a8ff","#79c0ff","#56d364","#ff7b72"];
  if (!sp) return "#8b949e";
  const idx = sp.charCodeAt(sp.length - 1) % colors.length;
  return colors[idx];
};

export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("aai_key") || "");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyForm, setShowKeyForm] = useState(!localStorage.getItem("aai_key"));
  const [file, setFile] = useState(null);
  const [fileURL, setFileURL] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [exportMsg, setExportMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const mediaRef = useRef();
  const fileInputRef = useRef();

  const saveKey = () => {
    if (!apiKeyInput.trim()) return;
    localStorage.setItem("aai_key", apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setShowKeyForm(false);
  };

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith("audio/") && !f.type.startsWith("video/")) {
      setError("Please upload an audio or video file."); return;
    }
    setFile(f);
    setFileURL(URL.createObjectURL(f));
    setResult(null);
    setError("");
    setStatus("idle");
  };

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const runAnnotation = async () => {
    if (!file || !apiKey) return;
    setStatus("uploading");
    setProgress("Uploading audio to AssemblyAI...");
    setError("");
    setResult(null);

    try {
      // 1. Upload
      const uploadRes = await fetch(`${ASSEMBLYAI_BASE}/upload`, {
        method: "POST",
        headers: { authorization: apiKey, "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload failed — check your API key.");
      const { upload_url } = await uploadRes.json();

      // 2. Submit job
      setStatus("processing");
      setProgress("Submitting annotation job...");
      const jobRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
        method: "POST",
        headers: { authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: upload_url,
          speaker_labels: true,
          sentiment_analysis: true,
          auto_highlights: true,
          disfluencies: true,
          punctuate: true,
          format_text: false,
        }),
      });
      if (!jobRes.ok) throw new Error("Failed to submit job.");
      const { id } = await jobRes.json();

      // 3. Poll
      setProgress("Processing audio — this may take 1–3 minutes...");
      let transcript;
      while (true) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${id}`, {
          headers: { authorization: apiKey },
        });
        transcript = await pollRes.json();
        if (transcript.status === "completed") break;
        if (transcript.status === "error") throw new Error(transcript.error);
        setProgress(`Processing... (${transcript.status})`);
      }

      const segments = buildSegments(transcript);
      setResult({ transcript, segments });
      setStatus("done");

    } catch (e) {
      setError(e.message || "Something went wrong.");
      setStatus("error");
    }
  };

  const buildSegments = (t) => {
    if (!t.utterances) return [];
    const highlights = new Set(
      (t.auto_highlights_result?.results || []).flatMap(h => h.text.toLowerCase().split(" "))
    );
    return t.utterances.map((u, i) => {
      const words = u.words || [];
      const emphasizedWords = words
        .filter(w => highlights.has(w.text.toLowerCase().replace(/[^a-z]/g, "")))
        .map(w => w.text);
      const next = t.utterances[i + 1];
      const overlaps = next && u.end > next.start && u.speaker !== next.speaker;
      const sentiments = t.sentiment_analysis_results?.filter(
        s => s.start >= u.start && s.end <= u.end
      ) || [];
      const dominant = sentiments.reduce((acc, s) => {
        acc[s.sentiment] = (acc[s.sentiment] || 0) + 1; return acc;
      }, {});
      const emotion = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0]?.[0] || "NEUTRAL";
      const accent = t.language_code ? t.language_code.replace("_", "-").toUpperCase() : "en-US";
      return {
        id: i,
        speaker: `Speaker ${u.speaker}`,
        startTime: (u.start / 1000).toFixed(2),
        endTime: (u.end / 1000).toFixed(2),
        duration: ((u.end - u.start) / 1000).toFixed(2),
        transcript: u.text,
        words,
        emotion,
        emphasizedWords,
        overlaps,
        accent,
        confidence: u.confidence,
      };
    });
  };

  const exportJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.segments, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `annotation_${file?.name || "output"}.json`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("✓ Exported!"); setTimeout(() => setExportMsg(""), 2000);
  };

  const seekTo = (secs) => { if (mediaRef.current) mediaRef.current.currentTime = parseFloat(secs); };

  const filteredSegments = result?.segments?.filter(s => {
    if (activeFilter === "all") return true;
    if (activeFilter === "overlap") return s.overlaps;
    if (activeFilter === "emotion") return s.emotion !== "NEUTRAL";
    if (activeFilter === "emphasis") return s.emphasizedWords.length > 0;
    return true;
  }) || [];

  const speakers = [...new Set(result?.segments?.map(s => s.speaker) || [])];

  return (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", background: "#0a0c10", minHeight: "100vh", color: "#cdd9e5" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(90deg,#0d1117,#161b22)",
        borderBottom: "1px solid #21262d",
        padding: "16px 20px 12px",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20 }}>🎙</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#e6edf3", letterSpacing: "0.05em" }}>AUTO ANNOTATION AI</div>
            <div style={{ fontSize: 9, color: "#6e7681", letterSpacing: "0.1em" }}>UBER AI SOLUTIONS · ULABEL GUIDELINES</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            {result && (
              <>
                <span style={{ fontSize: 10, color: "#8b949e" }}>{result.segments.length} segs · {speakers.length} speakers</span>
                <button onClick={exportJSON} style={smallBtn(exportMsg ? "#2ea043" : "#388bfd")}>{exportMsg || "⬇ JSON"}</button>
              </>
            )}
            <button onClick={() => setShowKeyForm(v => !v)} style={smallBtn("#6e7681")}>🔑 API Key</button>
          </div>
        </div>

        {showKeyForm && (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input type="password" placeholder="Paste your AssemblyAI API key..."
              value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
              style={{ ...inputSt(), flex: 1, fontSize: 11 }} />
            <button onClick={saveKey} style={smallBtn("#2ea043")}>Save</button>
            <a href="https://www.assemblyai.com" target="_blank" rel="noreferrer"
              style={{ fontSize: 10, color: "#388bfd", alignSelf: "center" }}>Get free →</a>
          </div>
        )}
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 820, margin: "0 auto" }}>

        {/* API key warning */}
        {!apiKey && (
          <div style={{ background: "#2d1b00", border: "1px solid #bb8009", borderRadius: 10, padding: "14px", marginBottom: 16, fontSize: 12, color: "#e3b341" }}>
            ⚠ You need a free <strong>AssemblyAI API key</strong>.{" "}
            <a href="https://www.assemblyai.com" target="_blank" rel="noreferrer" style={{ color: "#388bfd" }}>Get one free at assemblyai.com</a>
            {" "}— then tap 🔑 API Key above.
          </div>
        )}

        {/* Upload zone */}
        {status !== "done" && (
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#388bfd" : file ? "#2ea043" : "#30363d"}`,
              borderRadius: 14, padding: "36px 20px", textAlign: "center",
              background: isDragging ? "#1f6feb0d" : file ? "#0d21190d" : "#161b22",
              cursor: "pointer", marginBottom: 16, transition: "all 0.2s",
            }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>{file ? "🎵" : "📂"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3", marginBottom: 6 }}>
              {file ? file.name : "Drop your audio or video file here"}
            </div>
            <div style={{ fontSize: 11, color: "#6e7681" }}>
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Click to change` : "MP3 · WAV · M4A · MP4 · MOV · WEBM"}
            </div>
            <input ref={fileInputRef} type="file" accept="audio/*,video/*"
              onChange={e => handleFile(e.target.files[0])} style={{ display: "none" }} />
          </div>
        )}

        {/* Player */}
        {fileURL && status !== "done" && (
          <audio ref={mediaRef} src={fileURL} controls style={{ width: "100%", marginBottom: 16, borderRadius: 8 }} />
        )}

        {/* Annotate button */}
        {file && status === "idle" && (
          <button onClick={runAnnotation} disabled={!apiKey} style={{
            width: "100%",
            background: apiKey ? "linear-gradient(135deg,#1f6feb,#388bfd)" : "#21262d",
            border: "none", borderRadius: 10, color: apiKey ? "#fff" : "#6e7681",
            padding: "16px", fontSize: 14, fontWeight: 800,
            cursor: apiKey ? "pointer" : "not-allowed",
            letterSpacing: "0.06em", marginBottom: 20,
            boxShadow: apiKey ? "0 4px 20px rgba(31,111,235,0.3)" : "none",
          }}>
            🤖 ANNOTATE AUTOMATICALLY
          </button>
        )}

        {/* Processing */}
        {(status === "uploading" || status === "processing") && (
          <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 12, padding: "28px", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
            <div style={{ fontSize: 13, color: "#f0f6fc", fontWeight: 700, marginBottom: 6 }}>{progress}</div>
            <div style={{ fontSize: 11, color: "#6e7681", marginBottom: 16 }}>
              AI is detecting speakers, emotions, emphasis, overlaps...
            </div>
            <div style={{ height: 4, background: "#21262d", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", background: "linear-gradient(90deg,#1f6feb,#388bfd)",
                width: status === "uploading" ? "30%" : "75%",
                borderRadius: 2, transition: "width 1s ease",
              }} />
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div style={{ background: "#2d1014", border: "1px solid #da3633", borderRadius: 10, padding: "14px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#f85149", fontWeight: 700, marginBottom: 4 }}>⚠ Error</div>
            <div style={{ fontSize: 11, color: "#f85149", marginBottom: 10 }}>{error}</div>
            <button onClick={() => setStatus("idle")} style={smallBtn("#da3633")}>Try Again</button>
          </div>
        )}

        {/* Results */}
        {status === "done" && result && (
          <div>
            {/* Summary */}
            <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 12, padding: "16px", marginBottom: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Stat icon="🎤" label="Speakers" value={speakers.length} />
              <Stat icon="📋" label="Segments" value={result.segments.length} />
              <Stat icon="↔" label="Overlaps" value={result.segments.filter(s => s.overlaps).length} />
              <Stat icon="😶" label="Emotions" value={result.segments.filter(s => s.emotion !== "NEUTRAL").length} />
              <Stat icon="‼" label="Emphasis" value={result.segments.filter(s => s.emphasizedWords.length > 0).length} />
            </div>

            {/* Speaker legend */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {speakers.map(sp => (
                <div key={sp} style={{
                  background: speakerColor(sp) + "22", border: `1px solid ${speakerColor(sp)}`,
                  borderRadius: 6, padding: "3px 10px", fontSize: 10,
                  color: speakerColor(sp), fontWeight: 700,
                }}>{sp}</div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { id: "all", label: `All (${result.segments.length})` },
                { id: "overlap", label: `↔ Overlaps` },
                { id: "emotion", label: `😶 Emotion` },
                { id: "emphasis", label: `‼ Emphasis` },
              ].map(f => (
                <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
                  background: activeFilter === f.id ? "#1f6feb22" : "transparent",
                  border: `1px solid ${activeFilter === f.id ? "#1f6feb" : "#30363d"}`,
                  borderRadius: 6, color: activeFilter === f.id ? "#388bfd" : "#6e7681",
                  padding: "4px 10px", fontSize: 10, cursor: "pointer",
                  fontFamily: "inherit", fontWeight: activeFilter === f.id ? 700 : 400,
                }}>{f.label}</button>
              ))}
            </div>

            {/* Segments */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredSegments.map(seg => (
                <SegmentCard key={seg.id} seg={seg} onSeek={seekTo} mediaRef={mediaRef} fileURL={fileURL} />
              ))}
            </div>

            <button onClick={() => { setStatus("idle"); setResult(null); setFile(null); setFileURL(null); }} style={{
              width: "100%", marginTop: 20,
              background: "transparent", border: "1px solid #30363d",
              borderRadius: 8, color: "#8b949e", padding: "12px",
              fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>↩ Annotate a Different File</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentCard({ seg, onSeek, mediaRef, fileURL }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const color = speakerColor(seg.speaker);

  const playSegment = () => {
    if (!mediaRef?.current) return;
    mediaRef.current.currentTime = parseFloat(seg.startTime);
    mediaRef.current.play();
    setPlaying(true);
    const dur = (parseFloat(seg.endTime) - parseFloat(seg.startTime)) * 1000;
    setTimeout(() => { mediaRef.current?.pause(); setPlaying(false); }, dur);
  };

  return (
    <div style={{
      background: "#161b22",
      border: `1px solid ${seg.overlaps ? "#bb8009" : "#21262d"}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10, padding: "12px 14px",
    }}>
      {/* Speaker + time row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ background: color + "22", color, padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
          {seg.speaker}
        </span>
        <span style={{ fontSize: 10, color: "#8b949e" }}>
          {fmt(parseFloat(seg.startTime))} → {fmt(parseFloat(seg.endTime))}
        </span>
        <span style={{ fontSize: 9, color: "#6e7681" }}>({seg.duration}s)</span>

        {/* Badges */}
        {seg.overlaps && <Badge color="#bb8009" text="↔ OVERLAP" />}
        {seg.emotion === "POSITIVE" && <Badge color="#2ea043" text="😊 POSITIVE" />}
        {seg.emotion === "NEGATIVE" && <Badge color="#f85149" text="😠 NEGATIVE" />}
        {seg.emphasizedWords.length > 0 && <Badge color="#ffa657" text="‼ EMPHASIS" />}

        <span style={{ marginLeft: "auto", fontSize: 9, color: "#6e7681" }}>🌍 {seg.accent}</span>
      </div>

      {/* Transcript */}
      <div style={{ fontSize: 13, color: "#e6edf3", lineHeight: 1.9, marginBottom: 8 }}>
        {seg.words.length > 0
          ? seg.words.map((w, i) => {
              const isEm = seg.emphasizedWords.includes(w.text);
              return (
                <span key={i}
                  onClick={() => onSeek(w.start / 1000)}
                  title={`${(w.start / 1000).toFixed(2)}s`}
                  style={{
                    color: isEm ? "#ffa657" : "#e6edf3",
                    fontWeight: isEm ? 800 : 400,
                    textDecoration: isEm ? "underline" : "none",
                    cursor: "pointer",
                  }}>
                  {w.text}{" "}
                </span>
              );
            })
          : seg.transcript}
      </div>

      {/* Bottom actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {seg.emphasizedWords.length > 0 && (
          <span style={{ fontSize: 10, color: "#ffa657" }}>‼ {seg.emphasizedWords.join(", ")}</span>
        )}
        <button onClick={() => setExpanded(v => !v)} style={{
          marginLeft: "auto", background: "transparent", border: "none",
          color: "#6e7681", fontSize: 10, cursor: "pointer", fontFamily: "inherit",
        }}>{expanded ? "▲ less" : "▼ details"}</button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #21262d", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Detail label="Confidence" value={`${Math.round((seg.confidence || 0) * 100)}%`} />
          <Detail label="Locale" value={seg.accent} />
          <Detail label="Duration" value={`${seg.duration}s`} />
          <Detail label="Overlap" value={seg.overlaps ? "Yes ↔" : "No"} />
          <Detail label="Word count" value={seg.words.length} />
        </div>
      )}
    </div>
  );
}

function Badge({ color, text }) {
  return (
    <span style={{
      background: color + "22", border: `1px solid ${color}`,
      borderRadius: 4, padding: "1px 7px", fontSize: 9, color,
    }}>{text}</span>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#f0f6fc" }}>{value}</div>
      <div style={{ fontSize: 9, color: "#6e7681" }}>{label}</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#6e7681", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#e6edf3" }}>{value}</div>
    </div>
  );
}

function smallBtn(color) {
  return {
    background: color + "22", border: `1px solid ${color}`,
    borderRadius: 6, color, padding: "4px 12px",
    fontSize: 10, cursor: "pointer", fontFamily: "inherit", fontWeight: 700,
  };
}

function inputSt() {
  return {
    background: "#0d1117", border: "1px solid #30363d",
    borderRadius: 6, color: "#e6edf3", padding: "8px 12px",
    fontSize: 12, fontFamily: "inherit", outline: "none",
    width: "100%", boxSizing: "border-box",
  };
}
