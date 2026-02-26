import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/Button";
import { FileText, Sparkles, UploadCloud, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { buildDeckTitle, upsertDeck } from "@/features/flashcards/utils/flashcardDecks";

const LogoStreaks = () => {
    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none z-0">
            {/* Radial gradient backing for depth */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--accent))/5] to-transparent opacity-30 blur-3xl rounded-full" />

            {/* Rotating streaks */}
            {[...Array(6)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-[400px] h-[1px] origin-left bg-gradient-to-r from-transparent via-[hsl(var(--accent))/40] to-transparent"
                    initial={{ rotate: i * 60, opacity: 0, scale: 0.5 }}
                    animate={{
                        rotate: i * 60 + 360,
                        opacity: [0, 0.5, 0],
                        scale: [0.8, 1.2, 0.8]
                    }}
                    transition={{
                        duration: 8 + i,
                        repeat: Infinity,
                        ease: "linear",
                        delay: i * 0.5
                    }}
                />
            ))}

            {/* Outward particles/glow */}
            {[...Array(8)].map((_, i) => (
                <motion.div
                    key={`p-${i}`}
                    className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-[hsl(var(--accent))]"
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{
                        x: Math.cos(i * 45) * 300,
                        y: Math.sin(i * 45) * 300,
                        opacity: [0, 1, 0]
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: i * 0.2
                    }}
                />
            ))}
        </div>
    );
};

export function HeroSection() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
    const [pulseComplete, setPulseComplete] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isHoveringToast, setIsHoveringToast] = useState(false);
    const pulseTimeoutRef = useRef<number | null>(null);
    const closeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const sessionKey = "session_id";
        if (localStorage.getItem(sessionKey)) {
            setIsSessionLoading(false);
            return;
        }
        console.log("Fetching new session id");
        const fetchSessionId = async () => {
            setIsSessionLoading(true);
            try {
                const response = await fetch(`${import.meta.env.SERVER_URL}/session-id`);
                if (!response.ok) {
                    console.error("Failed to fetch session id:", response.statusText);
                    return;
                }

                const data = await response.json();
                const sessionId = data?.["session_id"];
                console.log(sessionId);
                if (sessionId && !localStorage.getItem(sessionKey)) {
                    localStorage.setItem(sessionKey, sessionId);
                }
            } catch (error) {
                console.error("Error fetching session id:", error);
            } finally {
                setIsSessionLoading(false);
            }
        };
        fetchSessionId();
    }, []);

    const closeToast = () => {
        setIsClosing(true);
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
            setShowToast(false);
            setIsClosing(false);
        }, 320);
    };

    const scheduleAutoClose = () => {
        if (closeTimeoutRef.current) {
            window.clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
            if (!isHoveringToast) {
                closeToast();
            }
        }, 3000);
    };

    useEffect(() => {
        
        if (
            showToast &&
            !isUploading &&
            !isGeneratingFlashcards &&
            totalFiles > 0 &&
            completedFiles >= totalFiles
        ) {
            if (!isHoveringToast) {
                scheduleAutoClose();
            }
        }
        return () => {
            if (closeTimeoutRef.current) {
                window.clearTimeout(closeTimeoutRef.current);
            }
        };
    }, [showToast, isUploading, completedFiles, totalFiles, isHoveringToast]);

    useEffect(() => {
        if (!showToast) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeToast();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [showToast]);

    const handleUploadClick = () => {
        if (isUploading || isGeneratingFlashcards || isSessionLoading) {
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (isSessionLoading || isGeneratingFlashcards) {
            return;
        }
        const files = event.target.files;
        if (files && files.length > 0) {
            const sessionId = localStorage.getItem("session_id");
            const uploadUrlBase = `${import.meta.env.SERVER_URL}/upload-files`;
            const uploadUrl = sessionId
                ? `${uploadUrlBase}?session_id=${encodeURIComponent(sessionId)}`
                : uploadUrlBase;
            const fileList = Array.from(files);
            const fileNames = fileList.map((file) => file.name);
            const embeddedFilenames: string[] = [];
            const formData = new FormData();

            fileList.forEach((file) => {
                formData.append("files", file);
            });

            setIsUploading(true);
            setShowToast(true);
            setIsClosing(false);
            setCompletedFiles(0);
            setTotalFiles(fileList.length);
            setLoadingMessage(`Embedding ${fileList.length} document${fileList.length > 1 ? "s" : ""}...`);

            try {
                const response = await fetch(uploadUrl, {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    let detail = "Upload failed. Please try again.";
                    try {
                        const data = await response.json();
                        if (data?.detail) {
                            detail = data.detail;
                        }
                    } catch {
                        // ignore parse errors
                    }
                    setLoadingMessage(detail);
                    setIsUploading(false);
                    return;
                }
                if (!response.body) {
                    setLoadingMessage("Upload failed. Please try again.");
                    setIsUploading(false);
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
            let completed = 0;
            let embeddedCount = 0;
            let sawFatalError = false;
            let fatalErrorDetail = "";
            let errorCount = 0;
            let lastErrorDetail = "";

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.startsWith("data: ")) {
                            continue;
                        }

                        const payloadText = line.replace("data: ", "").trim();
                        if (!payloadText) {
                            continue;
                        }
                        if (payloadText === "[DONE]") {
                            continue;
                        }

                        try {
                            const payload = JSON.parse(payloadText);
                            if (payload?.status === "session" && payload?.session_id) {
                                localStorage.setItem("session_id", String(payload.session_id));
                                continue;
                            }
                            if (payload?.status === "embedded" || payload?.status === "skipped") {
                                completed += 1;
                                setCompletedFiles(completed);
                                const verb = payload.status === "embedded" ? "Embedded" : "Skipped";
                                setLoadingMessage(
                                    `${verb} ${payload.filename} (${completed}/${fileList.length})`
                                );
                                if (payload.status === "embedded") {
                                    if (payload.filename) {
                                        embeddedFilenames.push(payload.filename);
                                    }
                                    embeddedCount += 1;
                                    setPulseComplete(true);
                                    if (pulseTimeoutRef.current) {
                                        window.clearTimeout(pulseTimeoutRef.current);
                                    }
                                    pulseTimeoutRef.current = window.setTimeout(() => {
                                        setPulseComplete(false);
                                    }, 900);
                                }
                                continue;
                            }
                            if (payload?.status === "error") {
                                const detail = payload?.detail || "Upload failed. Please try again.";
                                if (payload?.filename) {
                                    errorCount += 1;
                                    completed += 1;
                                    setCompletedFiles(completed);
                                    lastErrorDetail = `Failed ${payload.filename}: ${detail}`;
                                    setLoadingMessage(lastErrorDetail);
                                    continue;
                                }
                                sawFatalError = true;
                                fatalErrorDetail = detail;
                                setLoadingMessage(detail);
                                break;
                            }
                        } catch {
                            // Ignore malformed payloads
                        }
                    }
                    if (sawFatalError) {
                        await reader.cancel();
                        break;
                    }
                }

                if (sawFatalError) {
                    setLoadingMessage(fatalErrorDetail || "Upload failed. Please try again.");
                } else if (errorCount > 0) {
                    setLoadingMessage(
                        `Processed ${completed}/${fileList.length} files with ${errorCount} error${errorCount > 1 ? "s" : ""}.`
                    );
                } else if (completed === 0) {
                    setLoadingMessage("No documents were embedded.");
                } else if (completed < fileList.length) {
                    setLoadingMessage(`Processed ${completed}/${fileList.length} files.`);
                } else {
                    setLoadingMessage("All documents embedded.");
                }

                setIsUploading(false);

                const canGenerate = !sawFatalError && embeddedCount > 0;
                if (canGenerate) {
                    setIsGeneratingFlashcards(true);
                    setLoadingMessage("Generating flashcards...");
                    try {
                        const activeSessionId = sessionId || localStorage.getItem("session_id");
                        if (!activeSessionId) {
                            throw new Error("Missing session id for flashcard generation.");
                        }
                        const llmUrl = `${import.meta.env.SERVER_URL}/llm?session_id=${encodeURIComponent(activeSessionId)}`;
                        const response = await fetch(llmUrl);
                        if (!response.ok) {
                            const detail = await response.text();
                            throw new Error(detail || "Flashcard generation failed.");
                        }
                        const data = await response.json();
                        const savedCount = typeof data?.saved_count === "number" ? data.saved_count : null;
                        const deckCardCount = savedCount ?? 0;
                        setLoadingMessage(
                            savedCount !== null
                                ? `Flashcards generated (${savedCount} saved).`
                                : "Flashcards generated."
                        );
                        const deckSessionId = String(activeSessionId);
                        const sourceFiles = embeddedFilenames.length > 0 ? embeddedFilenames : fileNames;
                        const uniqueFiles = Array.from(new Set(sourceFiles)).filter(
                            (name) => typeof name === "string" && name.trim().length > 0
                        );
                        upsertDeck({
                            id: `deck-${deckSessionId}`,
                            sessionId: deckSessionId,
                            title: buildDeckTitle(uniqueFiles),
                            cardCount: deckCardCount,
                            noteCount: uniqueFiles.length,
                            notes: uniqueFiles,
                            createdAt: new Date().toISOString(),
                        });
                    } catch (error) {
                        const message =
                            error instanceof Error ? error.message : "Flashcard generation failed.";
                        setLoadingMessage(message);
                    } finally {
                        setIsGeneratingFlashcards(false);
                    }
                }
            } catch (error) {
                console.error("Error uploading files:", error);
                setLoadingMessage("Upload failed. Please try again.");
            } finally {
                setIsUploading(false);
            }
        }
    };

    return (
        <section className="relative z-10 flex flex-col items-center justify-center min-h-screen min-w-screen px-4 pt-20 pb-16 text-center bg-[#09090b] overflow-hidden">
            <style>
                {`
                .loading-border {
                    border: 1px solid hsl(var(--accent) / 0.45);
                    box-shadow: 0 0 0 0 hsl(var(--accent) / 0.2);
                    animation: borderPulse 2.2s ease-in-out infinite;
                }

                .completion-pulse {
                    animation: completionPulse 0.9s ease-out;
                }

                .status-shell {
                    background: linear-gradient(120deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)) padding-box,
                        linear-gradient(135deg, hsl(var(--accent) / 0.45), transparent 60%, hsl(var(--accent) / 0.2)) border-box;
                    border: 1px solid transparent;
                }

                .status-glow {
                    animation: glowPulse 3s ease-in-out infinite;
                }

                .status-sheen {
                    background: linear-gradient(
                        120deg,
                        transparent 0%,
                        rgba(255,255,255,0.12) 45%,
                        rgba(255,255,255,0.03) 55%,
                        transparent 100%
                    );
                    animation: sheenSweep 2.8s ease-in-out infinite;
                }

                .status-card {
                    background: radial-gradient(circle at top left, rgba(255,255,255,0.06), transparent 45%),
                        #18181b;
                    border: 1px solid rgba(255,255,255,0.08);
                }

                .accent-strip {
                    background: linear-gradient(180deg, hsl(var(--accent) / 0.9), transparent 90%);
                }

                .progress-flow {
                    background: linear-gradient(
                        90deg,
                        hsl(var(--accent) / 0.15),
                        hsl(var(--accent) / 0.65),
                        hsl(var(--accent) / 0.15)
                    );
                    animation: progressSweep 1.6s ease-in-out infinite;
                }

                @keyframes borderPulse {
                    0% { box-shadow: 0 0 0 0 hsl(var(--accent) / 0.2); }
                    50% { box-shadow: 0 0 14px 2px hsl(var(--accent) / 0.45); }
                    100% { box-shadow: 0 0 0 0 hsl(var(--accent) / 0.2); }
                }

                @keyframes completionPulse {
                    0% { box-shadow: 0 0 0 0 hsl(var(--accent) / 0.6); }
                    100% { box-shadow: 0 0 0 18px transparent; }
                }

                @keyframes glowPulse {
                    0% { box-shadow: 0 0 24px hsl(var(--accent) / 0.1); }
                    50% { box-shadow: 0 0 36px hsl(var(--accent) / 0.25); }
                    100% { box-shadow: 0 0 24px hsl(var(--accent) / 0.1); }
                }

                @keyframes sheenSweep {
                    0% { transform: translateX(-120%); opacity: 0; }
                    30% { opacity: 0.7; }
                    60% { opacity: 0.4; }
                    100% { transform: translateX(120%); opacity: 0; }
                }

                @keyframes progressSweep {
                    0% { transform: translateX(-40%); opacity: 0.4; }
                    50% { transform: translateX(40%); opacity: 0.9; }
                    100% { transform: translateX(140%); opacity: 0.4; }
                }

                @keyframes toastIn {
                    0% { opacity: 0; transform: translateY(-10px) scale(0.98); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }

                @keyframes toastOut {
                    0% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(-8px) scale(0.98); }
                }

                .toast-enter {
                    animation: toastIn 320ms ease-out;
                }

                .toast-exit {
                    animation: toastOut 320ms ease-in;
                }

                @media (prefers-reduced-motion: reduce) {
                    .loading-border,
                    .completion-pulse,
                    .status-glow,
                    .status-sheen,
                    .progress-flow,
                    .toast-enter,
                    .toast-exit {
                        animation: none !important;
                    }
                }
                `}
            </style>

            {/* Central Focal Point */}
            <div className="relative z-10 mb-12 group perspective-1000">
                <LogoStreaks />
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, rotateX: 20 }}
                    animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                    transition={{ duration: 1.2, type: "spring", bounce: 0.3 }}
                    className="relative z-10 p-8 rounded-[3rem]"
                >
                    <div className="absolute inset-0 bg-[hsl(var(--accent))/10] blur-3xl rounded-full opacity-60 group-hover:opacity-80 transition-opacity duration-1000" />
                    <img
                        src="/obsidian-logo.png"
                        alt="Obsidian Logo"
                        className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-2xl relative z-20"
                        style={{ filter: "drop-shadow(0 0 40px rgba(139, 92, 246, 0.3))" }}
                    />
                </motion.div>
            </div>

            {/* CTA Section */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="relative z-20 space-y-8 max-w-2xl mx-auto"
            >
                <div className="space-y-4">
                    {totalFiles === 0 ? (
                        <Button
                            size="lg"
                            disabled={isUploading || isGeneratingFlashcards || isSessionLoading}
                            className="h-14 px-8 text-lg rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105 group disabled:cursor-not-allowed disabled:hover:scale-100"
                            onClick={handleUploadClick}
                        >
                            <UploadCloud className="mr-2 size-5 text-[hsl(var(--accent))]" />
                            <span className="text-white font-medium">
                                {isSessionLoading ? "Initializing session..." : "Upload your .md notes"}
                            </span>
                        </Button>
                    ) : (
                        <div className="group luminous-btn inline-flex h-14 items-center rounded-full overflow-hidden">
                            <button
                                type="button"
                                onClick={handleUploadClick}
                                disabled={isUploading || isGeneratingFlashcards || isSessionLoading}
                                className="inline-flex h-14 items-center gap-2 rounded-l-full px-8 text-lg text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))/35] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <UploadCloud className="size-5 text-white drop-shadow-[0_0_8px_hsl(var(--accent)/0.8)]" />
                                <span className="font-medium">
                                    {isSessionLoading ? "Initializing..." : "Upload"}
                                </span>
                            </button>
                            <div className="h-10 w-[2px] bg-white/55 shadow-[0_0_10px_rgba(255,255,255,0.18)]" />
                            <button
                                type="button"
                                onClick={() => navigate("/flashcards")}
                                disabled={isUploading || isGeneratingFlashcards || completedFiles < totalFiles}
                                className="group inline-flex h-14 items-center rounded-r-full px-8 text-lg text-white font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))/35] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Flashcards
                                <span className="ml-2 text-white/70 transition-transform duration-300 group-hover:translate-x-1">→</span>
                            </button>
                        </div>
                    )}
                    <p className="text-white/40 text-sm md:text-base font-light tracking-wide max-w-sm mx-auto">
                        Turn your Markdown notes into a searchable,<br /> intelligent knowledge base.
                    </p>
                </div>

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".md,.markdown,.txt"
                    multiple
                />

                {showToast ? (
                    <div
                        className="fixed right-6 top-6 z-50 w-[min(84vw,320px)]"
                        role="status"
                        aria-live="polite"
                        onMouseEnter={() => setIsHoveringToast(true)}
                        onMouseLeave={() => setIsHoveringToast(false)}
                        onFocusCapture={() => setIsHoveringToast(true)}
                        onBlurCapture={() => setIsHoveringToast(false)}
                    >
                        <div
                            className={`status-shell status-glow relative overflow-hidden rounded-[18px] ${
                                isUploading || isGeneratingFlashcards ? "loading-border" : ""
                            } ${pulseComplete ? "completion-pulse" : ""} ${
                                isClosing ? "toast-exit" : "toast-enter"
                            }`}
                        >
                            <div className="absolute inset-0 status-sheen pointer-events-none" />
                            <div className="status-card relative rounded-[16px] px-4 py-3 text-left text-sm text-white/80 backdrop-blur-xl">
                                <div className="accent-strip absolute left-0 top-0 h-full w-1.5" />
                                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.24em] text-white/45">
                                    <span>{isGeneratingFlashcards ? "Flashcards" : "Embedding"}</span>
                                    <button
                                        type="button"
                                        onClick={closeToast}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[9px] tracking-[0.16em] text-white/50 transition hover:text-white"
                                    >
                                        <span>Close</span>
                                        <X className="size-3" />
                                    </button>
                                </div>
                                <div className="mt-2 text-[13px] font-medium text-white">
                                    {loadingMessage ||
                                        (isGeneratingFlashcards
                                            ? "Generating flashcards..."
                                            : "Preparing embeddings...")}
                                </div>
                                {isUploading || isGeneratingFlashcards ? (
                                    <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
                                        <div className="progress-flow h-full w-[60%] rounded-full" />
                                    </div>
                                ) : null}
                                <div className="mt-2.5 flex items-center justify-between text-[10px] text-white/45">
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--accent)/0.6)] opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--accent)/0.9)]" />
                                        </span>
                                        <span>
                                            {isGeneratingFlashcards
                                                ? "Generating flashcards"
                                                : "Storing vector embeddings"}
                                        </span>
                                    </div>
                                    <span>
                                        {isGeneratingFlashcards ? "…" : `${completedFiles}/${totalFiles}`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </motion.div>

            {/* Minimal Demo */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.8 }}
                className="mt-24 relative z-10 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 opacity-80 hover:opacity-100 transition-opacity duration-500"
            >
                {/* Input */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-20 bg-[#18181b] border border-white/10 rounded-lg flex items-center justify-center shadow-lg transform rotate-[-6deg]">
                        <FileText className="text-white/20 size-8" />
                    </div>
                    <span className="text-xs text-white/30 font-mono">notes.md</span>
                </div>

                {/* Flow */}
                <div className="w-px h-12 md:w-24 md:h-px bg-gradient-to-b md:bg-gradient-to-r from-transparent via-white/20 to-transparent relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[hsl(var(--accent))] rounded-full shadow-[0_0_10px_hsl(var(--accent))]" />
                </div>

                {/* Output */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-64 h-24 bg-[#18181b] border border-white/10 rounded-xl p-4 flex flex-col justify-center shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(var(--accent))]" />
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="size-3 text-[hsl(var(--accent))]" />
                            <span className="text-[10px] uppercase tracking-widest text-white/40">Recall Generated</span>
                        </div>
                        <p className="text-sm text-white/80 font-medium">What is the primary function of the hippocampus?</p>
                    </div>
                    <span className="text-xs text-white/30 font-mono">flashcard</span>
                </div>
            </motion.div>
        </section>
    );
}
