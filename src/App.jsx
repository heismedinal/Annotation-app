import { useState, useRef, useCallback } from "react";

const EMOTIONS = ["happy", "sad", "angry", "confused", "surprised", "relieved", "disgusted", "furious", "very angry", "excited"];
const NON_SPEECH = ["(laughs)", "(sighs)", "(clears throat)", "(chuckles)", "(gasps)", "(giggles)", "(snorts)", "(upbeat music)", "(door creaking)"];
const LOCALES = ["en_US", "en_GB", "fr_FR", "it_IT", "de_DE", "es_LATAM"];

const emptySegment = () => ({
  id: Date.now(),
  startTime: "",
  endTime: "",
  speaker: "",
  transcript: "",
  emotion: "",
  customEmotion: "",
  nonSpeech: [],
  customNonSpeech: "",
  emphasis: "",
  accent: "",
  customAccent: "",
  dialect: "",
});

export default function App() {
  const [segments, setSegments] = useState([]);
  const [form, setForm] = useState(emptySegment());
  const [errors, setErrors] = useState({});
  const [exportMsg, setExportMsg] = useState("");
  const [activeTab, setActiveTab] = useState("media");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaURL, setMediaURL] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const mediaRef = useRef();
  const transcriptRef = useRef();
  const fileInputRef = useRef();

  // ── Media handlers ──
  const handleFileSelect = (file) => {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    const isAudio = file.type.startsWith("audio/");
    if (!isVideo && !isAudio) return alert("Please upload an audio or video file.");
    const url = URL.createObjectURL(file);
    setMediaFile(file);
    setMediaURL(url);
    setMediaType(isVideo ? "video" : "audio");
    setActiveTab("form");
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files[0]);
  }, []);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const stampStart = () => {
    if (!mediaRef.current) return;
    setForm(f => ({ ...f, startTime: mediaRef.current.currentTime.toFixed(2) }));
  };

  const stampEnd = () => {
    if (!mediaRef.current) return;
    setForm(f => ({ ...f, endTime: mediaRef.current.currentTime.toFixed(2) }));
  };

  const seekTo = (seconds) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = seconds;
  };

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) mediaRef.current.pause();
    else mediaRef.current.play();
  };

  const skipBy = (secs) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = Math.max(0, Math.min(duration, mediaRef.current.currentTime + secs));
  };

  const changeRate = (rate) => {
    setPlaybackRate(rate);
    if (mediaRef.current) mediaRef.current.playbackRate = rate;
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toFixed(1).padStart(4, "0");
    return `${m}:${sec}`;
  };

  // ── Annotation handlers ──
  const validate = () => {
    const e = {};
    if (!form.startTime) e.startTime = "Required";
    else if (isNaN(parseFloat(form.startTime))) e.startTime = "Must be a number";
    if (!form.endTime) e.endTime = "Required";
    else if (isNaN(parseFloat(form.endTime))) e.endTime = "Must be a number";
    else if (parseFloat(form.endTime) <= parseFloat(form.startTime)) e.endTime = "Must be after start time";
    if (parseFloat(form.endTime) - parseFloat(form.startTime) > 30) e.endTime = "⚠ Segment >30s — split it";
    if (!form.speaker.trim()) e.speaker = "Required";
    if (!form.transcript.trim()) e.transcript = "Required";
    if (!form.accent.trim() && !form.customAccent.trim()) e.accent = "Required (best guess)";
    return e;
  };

  const handleAdd = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    const seg = {
      ...form,
      emotion: form.customEmotion || form.emotion,
      nonSpeech: [...form.nonSpeech, ...(form.customNonSpeech ? [form.customNonSpeech] : [])],
      accent: form.customAccent || form.accent,
    };
    setSegments(prev => [...prev, seg].sort((a, b) => parseFloat(a.startTime) - parseFloat(b.startTime)));
    setForm(emptySegment());
    setActiveTab("segments");
  };

  const handleDelete = (id) => setSegments(prev => prev.filter(s => s.id !== id));

  const handleNonSpeechToggle = (tag) => {
    setForm(f => ({
      ...f,
      nonSpeech: f.nonSpeech.includes(tag) ? f.nonSpeech.filter(t => t !== tag) : [...f.nonSpeech, tag],
    }));
  };

  const insertTag = (tag) => {
    const el = transcriptRef.current;
    if (!el) return;
    const s = el.selectionStart, end = el.selectionEnd;
    const newVal = form.transcript.slice(0, s) + tag + form.transcript.slice(end);
    setForm(f => ({ ...f, transcript: newVal }));
    setTimeout(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); }, 0);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(segments, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `annotation_${mediaFile?.name || "output"}.json`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("✓ Exported!"); setTimeout(() => setExportMsg(""), 2000);
  };

  const durationWarning = form.startTime && form.endTime &&
    !isNaN(parseFloat(form.startTime)) && !isNaN(parseFloat(form.endTime)) &&
    parseFloat(form.endTime) - parseFloat(form.startTime) > 25;

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ fontFamily: "'DM Mono','Fira Code',monospace", background: "#0d1117", minHeight: "100vh", color: "#e6edf3" }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg,#161b22,#1a2332)",
        borderBottom: "1px solid #21262d",
        padding: "16px 20px 12px",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "linear-gradient(135deg,#1f6feb,#388bfd)", borderRadius: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🎙</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: "#f0f6fc" }}>AUDIO ANNOTATION WORKBENCH</div>
            <div style={{ fontSize: 9, color: "#8b949e", letterSpacing: "0.08em" }}>UBER AI SOLUTIONS · ULABEL COMPLIANT</div>
          </div>
          <div style={{ marginLeft: "auto", background: "#21262d", borderRadius: 6, padding: "3px 10px", fontSize: 10, color: "#8b949e" }}>
            {segments.length} SEGS
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 12, overflowX: "auto" }}>
          {[
            { id: "media", label: mediaFile ? "🎬 " + mediaFile.name.slice(0, 14) + "…" : "🎬 Media" },
            { id: "form", label: "➕ Annotate" },
            { id: "segments", label: `📋 Review (${segments.length})` },
            { id: "guide", label: "📖 Guide" },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              background: activeTab === t.id ? "#1f6feb" : "transparent",
              border: activeTab === t.id ? "none" : "1px solid #30363d",
              borderRadius: 6, color: activeTab === t.id ? "#fff" : "#8b949e",
              padding: "4px 12px", fontSize: 10, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.05em",
              whiteSpace: "nowrap", flexShrink: 0,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Sticky Media Player ── */}
      {mediaURL && (
        <div style={{
          background: "#161b22", borderBottom: "1px solid #21262d",
          padding: "12px 16px", position: "sticky", top: 110, zIndex: 90,
        }}>
          {/* Hidden media element */}
          {mediaType === "video" ? (
            <video ref={mediaRef} src={mediaURL} style={{ width: "100%", borderRadius: 8, maxHeight: 180, background: "#000", display: activeTab === "media" ? "block" : "none" }}
              onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={e => setDuration(e.target.duration)}
              onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
          ) : (
            <audio ref={mediaRef} src={mediaURL}
              onTimeUpdate={e => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={e => setDuration(e.target.duration)}
              onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
          )}

          {/* Waveform-style progress bar */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b949e", marginBottom: 4 }}>
              <span>{formatTime(currentTime)}</span>
              <span style={{ color: "#6e7681" }}>{mediaFile?.name?.slice(0, 30)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seekTo(pct * duration);
              }}
              style={{ height: 6, background: "#21262d", borderRadius: 3, cursor: "pointer", position: "relative" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#1f6feb,#388bfd)", borderRadius: 3, transition: "width 0.1s" }} />
              {/* Segment markers */}
              {segments.map(seg => (
                <div key={seg.id} style={{
                  position: "absolute", top: -2, height: 10,
                  left: `${(parseFloat(seg.startTime) / duration) * 100}%`,
                  width: `${((parseFloat(seg.endTime) - parseFloat(seg.startTime)) / duration) * 100}%`,
                  background: "#2ea04340", borderRadius: 2,
                  borderLeft: "2px solid #2ea043",
                }} />
              ))}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => skipBy(-5)} style={ctrlBtn()}>-5s</button>
            <button onClick={togglePlay} style={{
              ...ctrlBtn(),
              background: "#1f6feb", color: "#fff", border: "none",
              width: 36, height: 36, borderRadius: "50%", fontSize: 14,
            }}>{isPlaying ? "⏸" : "▶"}</button>
            <button onClick={() => skipBy(5)} style={ctrlBtn()}>+5s</button>

            <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
              {[0.5, 0.75, 1, 1.25, 1.5].map(r => (
                <button key={r} onClick={() => changeRate(r)} style={{
                  ...ctrlBtn(),
                  background: playbackRate === r ? "#1f6feb22" : "transparent",
                  color: playbackRate === r ? "#388bfd" : "#6e7681",
                  border: `1px solid ${playbackRate === r ? "#1f6feb" : "#21262d"}`,
                  padding: "2px 6px", fontSize: 9,
                }}>{r}x</button>
              ))}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={stampStart} style={{
                ...ctrlBtn(), background: "#0d2119", border: "1px solid #2ea043",
                color: "#2ea043", fontSize: 9, padding: "4px 8px",
              }}>▶ STAMP START</button>
              <button onClick={stampEnd} style={{
                ...ctrlBtn(), background: "#2d1b00", border: "1px solid #bb8009",
                color: "#e3b341", fontSize: 9, padding: "4px 8px",
              }}>■ STAMP END</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "16px", maxWidth: 780, margin: "0 auto" }}>

        {/* ── MEDIA TAB ── */}
        {activeTab === "media" && (
          <div>
            {!mediaURL ? (
              <div
                onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "#388bfd" : "#30363d"}`,
                  borderRadius: 16, padding: "60px 20px",
                  textAlign: "center", cursor: "pointer",
                  background: isDragging ? "#1f6feb11" : "#161b22",
                  transition: "all 0.2s",
                }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 8 }}>
                  Drop your audio or video file here
                </div>
                <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 20 }}>
                  Supports MP3, WAV, M4A, MP4, MOV, WEBM · up to any size
                </div>
                <div style={{
                  display: "inline-block", background: "#1f6feb",
                  borderRadius: 8, padding: "10px 24px",
                  fontSize: 12, fontWeight: 700, color: "#fff",
                }}>📂 Browse Files</div>
                <input ref={fileInputRef} type="file"
                  accept="audio/*,video/*"
                  onChange={e => handleFileSelect(e.target.files[0])}
                  style={{ display: "none" }} />
              </div>
            ) : (
              <div>
                {mediaType === "video" && (
                  <video ref={mediaRef} src={mediaURL}
                    style={{ width: "100%", borderRadius: 10, background: "#000", marginBottom: 12 }}
                    controls={false} />
                )}
                <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8 }}>
                    ✅ {mediaType === "video" ? "Video" : "Audio"} loaded: <span style={{ color: "#f0f6fc" }}>{mediaFile.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6e7681", marginBottom: 12 }}>
                    Duration: {formatTime(duration)} · {(mediaFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                  <button onClick={() => { setMediaFile(null); setMediaURL(null); setMediaType(null); }} style={{
                    background: "#2d1014", border: "1px solid #da3633",
                    borderRadius: 6, color: "#f85149", padding: "6px 14px",
                    fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}>🗑 Remove & Upload Different File</button>
                </div>
              </div>
            )}

            {!mediaURL && (
              <div style={{ marginTop: 16, background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#8b949e", marginBottom: 8 }}>💡 HOW IT WORKS</div>
                <div style={{ fontSize: 11, color: "#6e7681", lineHeight: 1.8 }}>
                  1. Upload your audio/video file<br />
                  2. Use the player to listen<br />
                  3. Hit <span style={{ color: "#2ea043" }}>▶ STAMP START</span> when a segment begins<br />
                  4. Hit <span style={{ color: "#e3b341" }}>■ STAMP END</span> when it ends<br />
                  5. Fill in speaker, transcript, and tags<br />
                  6. Export as JSON when done
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FORM TAB ── */}
        {activeTab === "form" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {!mediaURL && (
              <div style={{ background: "#2d1b00", border: "1px solid #bb8009", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#e3b341" }}>
                ⚠ No media loaded — <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setActiveTab("media")}>upload a file first</span> to use STAMP buttons
              </div>
            )}

            <Section title="⏱ TIMESTAMPS" subtitle="seconds — use STAMP buttons above or type manually">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="START TIME" error={errors.startTime}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" step="0.01" placeholder="e.g. 41.45"
                      value={form.startTime}
                      onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      style={{ ...inputStyle(errors.startTime), flex: 1 }} />
                    {mediaURL && (
                      <button onClick={stampStart} style={{ ...ctrlBtn(), background: "#0d2119", border: "1px solid #2ea043", color: "#2ea043", fontSize: 10, padding: "0 8px", borderRadius: 6 }}>▶</button>
                    )}
                  </div>
                </Field>
                <Field label="END TIME" error={errors.endTime}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" step="0.01" placeholder="e.g. 48.63"
                      value={form.endTime}
                      onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      style={{ ...inputStyle(errors.endTime), flex: 1 }} />
                    {mediaURL && (
                      <button onClick={stampEnd} style={{ ...ctrlBtn(), background: "#2d1b00", border: "1px solid #bb8009", color: "#e3b341", fontSize: 10, padding: "0 8px", borderRadius: 6 }}>■</button>
                    )}
                  </div>
                </Field>
              </div>
              {durationWarning && (
                <div style={{ background: "#2d1b00", border: "1px solid #bb8009", borderRadius: 6, padding: "7px 10px", fontSize: 11, color: "#e3b341", marginTop: 6 }}>
                  ⚠ Approaching 30s — consider splitting
                </div>
              )}
              {form.startTime && form.endTime && !isNaN(parseFloat(form.startTime)) && !isNaN(parseFloat(form.endTime)) && parseFloat(form.endTime) > parseFloat(form.startTime) && (
                <div style={{ fontSize: 10, color: "#8b949e", marginTop: 4 }}>
                  Duration: {(parseFloat(form.endTime) - parseFloat(form.startTime)).toFixed(2)}s
                  {mediaURL && (
                    <span style={{ marginLeft: 10, cursor: "pointer", color: "#388bfd" }}
                      onClick={() => { seekTo(parseFloat(form.startTime)); }}>
                      ▶ Play from start
                    </span>
                  )}
                </div>
              )}
            </Section>

            <Section title="👤 SPEAKER ID" subtitle="consistent across full podcast">
              <Field label="SPEAKER IDENTIFIER" error={errors.speaker}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {["A", "B", "C", "0", "1", "2"].map(s => (
                    <button key={s} onClick={() => setForm(f => ({ ...f, speaker: s }))}
                      style={{ background: form.speaker === s ? "#1f6feb" : "#21262d", border: `1px solid ${form.speaker === s ? "#1f6feb" : "#30363d"}`, borderRadius: 6, color: form.speaker === s ? "#fff" : "#8b949e", padding: "4px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
                  ))}
                </div>
                <input placeholder="Or type custom ID..."
                  value={form.speaker}
                  onChange={e => setForm(f => ({ ...f, speaker: e.target.value }))}
                  style={inputStyle(errors.speaker)} />
              </Field>
            </Section>

            <Section title="📝 TRANSCRIPT" subtitle="verbatim — include disfluencies, partial words">
              <Field label="SPOKEN CONTENT" error={errors.transcript}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  {NON_SPEECH.map(tag => (
                    <button key={tag} onClick={() => insertTag(tag)}
                      style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 4, color: "#8b949e", padding: "2px 7px", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>{tag}</button>
                  ))}
                </div>
                <textarea ref={transcriptRef} rows={4}
                  placeholder={`"d- d- did you see the game? (laughs) Um, I- I think..."`}
                  value={form.transcript}
                  onChange={e => setForm(f => ({ ...f, transcript: e.target.value }))}
                  style={{ ...inputStyle(errors.transcript), resize: "vertical", lineHeight: 1.6 }} />
              </Field>
            </Section>

            <Section title="😶 EMOTION TAG" subtitle="only if clearly non-neutral delivery">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                <button onClick={() => setForm(f => ({ ...f, emotion: "", customEmotion: "" }))} style={chipStyle(!form.emotion && !form.customEmotion)}>neutral (none)</button>
                {EMOTIONS.map(em => (
                  <button key={em} onClick={() => setForm(f => ({ ...f, emotion: em, customEmotion: "" }))} style={chipStyle(form.emotion === em && !form.customEmotion)}>{em}</button>
                ))}
              </div>
              <input placeholder="Or describe: e.g. 'laughing nervously'..."
                value={form.customEmotion}
                onChange={e => setForm(f => ({ ...f, emotion: "", customEmotion: e.target.value }))}
                style={inputStyle(false)} />
            </Section>

            <Section title="🔊 NON-SPEECH EVENTS" subtitle="audible non-verbal cues">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                {NON_SPEECH.map(tag => (
                  <button key={tag} onClick={() => handleNonSpeechToggle(tag)} style={chipStyle(form.nonSpeech.includes(tag))}>{tag}</button>
                ))}
              </div>
              <input placeholder="Custom: (laughs hysterically), (frustrated sigh)..."
                value={form.customNonSpeech}
                onChange={e => setForm(f => ({ ...f, customNonSpeech: e.target.value }))}
                style={inputStyle(false)} />
            </Section>

            <Section title="‼ EMPHASIS" subtitle="exaggerated stress or prolonged vowels only">
              <input placeholder={`e.g. "I cannot BELIEVE it" or "G*O*A*L"`}
                value={form.emphasis}
                onChange={e => setForm(f => ({ ...f, emphasis: e.target.value }))}
                style={inputStyle(false)} />
            </Section>

            <Section title="🌍 ACCENT / LOCALE" subtitle="required — best guess if unsure">
              <Field label="LOCALE" error={errors.accent}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                  {LOCALES.map(loc => (
                    <button key={loc} onClick={() => setForm(f => ({ ...f, accent: loc, customAccent: "" }))} style={chipStyle(form.accent === loc && !form.customAccent)}>{loc}</button>
                  ))}
                </div>
                <input placeholder="Custom: en_AU, pt_BR, yo_NG..."
                  value={form.customAccent}
                  onChange={e => setForm(f => ({ ...f, accent: "", customAccent: e.target.value }))}
                  style={inputStyle(errors.accent)} />
              </Field>
              <input placeholder="Dialect / Region: e.g. Liverpool, Lagos, Midwest..."
                value={form.dialect}
                onChange={e => setForm(f => ({ ...f, dialect: e.target.value }))}
                style={inputStyle(false)} />
            </Section>

            {Object.keys(errors).length > 0 && (
              <div style={{ background: "#2d1014", border: "1px solid #da3633", borderRadius: 8, padding: "10px 14px" }}>
                {Object.entries(errors).map(([k, v]) => (
                  <div key={k} style={{ fontSize: 11, color: "#f85149" }}>• {k}: {v}</div>
                ))}
              </div>
            )}

            <button onClick={handleAdd} style={{
              background: "linear-gradient(135deg,#238636,#2ea043)",
              border: "none", borderRadius: 8, color: "#fff",
              padding: "14px", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.06em", boxShadow: "0 4px 12px rgba(35,134,54,0.3)",
            }}>✓ ADD SEGMENT</button>
          </div>
        )}

        {/* ── SEGMENTS TAB ── */}
        {activeTab === "segments" && (
          <div>
            {segments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#6e7681" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 12 }}>No segments yet</div>
                <button onClick={() => setActiveTab("form")} style={{ marginTop: 14, background: "#1f6feb", border: "none", borderRadius: 6, color: "#fff", padding: "8px 20px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>➕ Add First Segment</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#8b949e" }}>{segments.length} SEGMENTS · sorted by time</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setActiveTab("form")} style={{ background: "#238636", border: "none", borderRadius: 6, color: "#fff", padding: "5px 12px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>➕ Add</button>
                    <button onClick={exportJSON} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: exportMsg ? "#2ea043" : "#e6edf3", padding: "5px 12px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                      {exportMsg || "⬇ JSON"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {segments.map(seg => (
                    <div key={seg.id} style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #1f6feb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ background: "#1f6feb22", color: "#388bfd", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>SPK {seg.speaker}</span>
                          <span style={{ color: "#8b949e", fontSize: 10 }}>{seg.startTime}s → {seg.endTime}s</span>
                          <span style={{ color: "#6e7681", fontSize: 9 }}>({(parseFloat(seg.endTime) - parseFloat(seg.startTime)).toFixed(2)}s)</span>
                          {mediaURL && (
                            <span style={{ color: "#388bfd", fontSize: 9, cursor: "pointer" }} onClick={() => seekTo(parseFloat(seg.startTime))}>▶ play</span>
                          )}
                        </div>
                        <button onClick={() => handleDelete(seg.id)} style={{ background: "transparent", border: "none", color: "#6e7681", cursor: "pointer", fontSize: 13 }}>✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: "#e6edf3", lineHeight: 1.6, marginBottom: 8 }}>{seg.transcript}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {seg.emotion && <Tag color="#553098" text={`😶 ${seg.emotion}`} />}
                        {seg.nonSpeech?.map(ns => <Tag key={ns} color="#2d333b" text={ns} />)}
                        {seg.emphasis && <Tag color="#3d2b00" text={`‼ ${seg.emphasis}`} />}
                        {seg.accent && <Tag color="#012b1d" text={`🌍 ${seg.accent}${seg.dialect ? ` · ${seg.dialect}` : ""}`} />}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── GUIDE TAB ── */}
        {activeTab === "guide" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["⏱", "Timestamps", "Use STAMP START/END buttons while audio plays to auto-capture times. Values are in seconds (e.g. 41.45). Keep segments under 25–30s."],
              ["👤", "Speaker ID", "Use consistent IDs (A, B, 0, 1) throughout. Add a new ID when speaker changes."],
              ["📝", "Verbatim", "Transcribe exactly as spoken — partial words (d- d- did), disfluencies (um, uh), repetitions included."],
              ["😶", "Emotion", "Only tag clearly non-neutral delivery. Focus on tone, not word content. Most segments = no emotion."],
              ["🔊", "Non-Speech", "(laughs), (sighs), (gasps) etc. Can be descriptive: 'laughs hysterically'. Lowercase parentheses."],
              ["‼", "Emphasis", "Only for exaggerated stress. CAPS for words, G*O*A*L for prolonged vowels."],
              ["🌍", "Accent", "Required. Use locale codes: en_GB, fr_FR. Add region if confident. Never leave blank."],
              ["↔", "Overlap", "Different speakers CAN overlap. Same speaker NEVER overlaps."],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>{icon} {title.toUpperCase()}</div>
                <div style={{ fontSize: 11, color: "#8b949e", lineHeight: 1.7 }}>{desc}</div>
              </div>
            ))}
            <div style={{ background: "#0d2119", border: "1px solid #2ea043", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#2ea043", marginBottom: 4 }}>📧 SUPPORT</div>
              <div style={{ fontSize: 11, color: "#8b949e" }}>support@scaled-solutions.ai — 24hr</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──
function Section({ title, subtitle, children }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: "14px" }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#f0f6fc", letterSpacing: "0.08em" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 9, color: "#6e7681", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {label && <div style={{ fontSize: 9, color: "#8b949e", marginBottom: 5, letterSpacing: "0.06em" }}>{label}</div>}
      {children}
      {error && <div style={{ fontSize: 10, color: "#f85149", marginTop: 3 }}>⚠ {error}</div>}
    </div>
  );
}

function Tag({ color, text }) {
  return <span style={{ background: color, borderRadius: 4, padding: "2px 7px", fontSize: 9, color: "#e6edf3" }}>{text}</span>;
}

function inputStyle(hasError) {
  return {
    width: "100%", boxSizing: "border-box", background: "#0d1117",
    border: `1px solid ${hasError ? "#da3633" : "#30363d"}`,
    borderRadius: 6, color: "#e6edf3", padding: "8px 10px",
    fontSize: 12, fontFamily: "inherit", outline: "none",
  };
}

function chipStyle(active) {
  return {
    background: active ? "#1f6feb22" : "#21262d",
    border: `1px solid ${active ? "#1f6feb" : "#30363d"}`,
    borderRadius: 6, color: active ? "#388bfd" : "#8b949e",
    padding: "3px 9px", fontSize: 9, cursor: "pointer",
    fontFamily: "inherit", fontWeight: active ? 700 : 400,
  };
}

function ctrlBtn() {
  return {
    background: "#21262d", border: "1px solid #30363d",
    borderRadius: 6, color: "#8b949e",
    padding: "5px 10px", fontSize: 11, cursor: "pointer",
    fontFamily: "inherit",
  };
}
