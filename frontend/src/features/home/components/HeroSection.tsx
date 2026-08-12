import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { UploadCloud, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { buildDeckTitle, loadDecks, upsertDeck } from "@/features/flashcards/utils/flashcardDecks";
import { formatModelLabel } from "@/shared/utils/modelLabel";
import { apiUrl } from "@/shared/utils/api";

export function HeroSection() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
    const selectedDeckKey = (sid: string) => `flashcards_selected_deck_id:${sid}`;
    const existingDecks = loadDecks();
    const isReturningUser = existingDecks.length > 0;
    const [isSessionLoading, setIsSessionLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
    const [showToast, setShowToast] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isHoveringToast, setIsHoveringToast] = useState(false);
    const closeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const sessionKey = "session_id";
        if (!localStorage.getItem(sessionKey)) {
            localStorage.setItem(sessionKey, crypto.randomUUID());
        }
        setIsSessionLoading(false);
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
            const uploadUrl = apiUrl("/upload-files", { session_id: sessionId });
            const fileList = Array.from(files);
            const fileNames = fileList.map((file) => file.name);
            const embeddedFilenames: string[] = [];
            const embeddedFileIds: number[] = [];
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
                                    if (typeof payload.file_id === "number") {
                                        embeddedFileIds.push(payload.file_id);
                                    }
                                    embeddedCount += 1;
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
                        const llmParams = new URLSearchParams({ session_id: activeSessionId });
                        embeddedFileIds.forEach((id) => llmParams.append("file_ids", String(id)));
                        const llmUrl = apiUrl(`/llm?${llmParams.toString()}`);
                        const llmResponse = await fetch(llmUrl);
                        if (!llmResponse.ok) {
                            const detail = await llmResponse.text();
                            throw new Error(detail || "Flashcard generation failed.");
                        }
                        const data = await llmResponse.json() as Record<string, unknown>;
                        const savedCount = typeof data?.saved_count === "number" ? data.saved_count : null;
                        const backendDeckId =
                            typeof data?.deck === "object" && data.deck !== null &&
                            typeof (data.deck as Record<string, unknown>).id === "number"
                                ? (data.deck as Record<string, unknown>).id as number
                                : undefined;
                        const deckCardCount = savedCount ?? 0;
                        const modelLabel = typeof data?.model_used === "string"
                            ? formatModelLabel(data.model_used)
                            : null;
                        setLoadingMessage(
                            savedCount !== null
                                ? `Generated ${savedCount} cards${modelLabel ? ` via ${modelLabel}` : ""}.`
                                : "Flashcards generated."
                        );
                        const deckSessionId = String(activeSessionId);
                        const sourceFiles = embeddedFilenames.length > 0 ? embeddedFilenames : fileNames;
                        const uniqueFiles = Array.from(new Set(sourceFiles)).filter(
                            (name) => typeof name === "string" && name.trim().length > 0
                        );
                        upsertDeck({
                            id:
                                typeof backendDeckId === "number"
                                    ? `deck-${deckSessionId}-${backendDeckId}`
                                    : `deck-${deckSessionId}-${Date.now()}`,
                            sessionId: deckSessionId,
                            backendDeckId,
                            title: buildDeckTitle(uniqueFiles),
                            cardCount: deckCardCount,
                            noteCount: uniqueFiles.length,
                            notes: uniqueFiles,
                            createdAt: new Date().toISOString(),
                        });
                        if (typeof backendDeckId === "number") {
                            localStorage.setItem(selectedDeckKey(deckSessionId), String(backendDeckId));
                        } else {
                            localStorage.removeItem(selectedDeckKey(deckSessionId));
                        }
                    } catch (error) {
                        const message =
                            error instanceof Error ? error.message : "Flashcard generation failed.";
                        setLoadingMessage(message);
                    } finally {
                        setIsGeneratingFlashcards(false);
                        navigate("/flashcards-lab", { replace: true });
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
        <section className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-6 text-center bg-[var(--bg-chrome)] overflow-hidden">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                className="relative z-10 mb-10"
            >
                <img
                    src="/obsidian-logo.png"
                    alt="Obsidian"
                    className="w-20 h-20 md:w-24 md:h-24 object-contain mx-auto"
                />
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.06, ease: [0.23, 1, 0.32, 1] }}
                className="relative z-20 flex flex-col items-center gap-4 max-w-[360px]"
            >
                <div className="flex flex-col items-center gap-2">
                    <p className="text-label text-[var(--accent-hex)]">Flashcards</p>
                    <h1 className="text-display text-[32px] leading-[38px] md:text-[36px] md:leading-[42px] text-[var(--fg)]">
                        Obsidian
                    </h1>
                    <p className="text-[15px] leading-6 text-[var(--fg-secondary)] mt-1">
                        Turn your Markdown notes into a study deck in one upload.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleUploadClick}
                    disabled={isUploading || isGeneratingFlashcards || isSessionLoading}
                    className="luminous-btn mt-2 h-9 px-4 text-[14px] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <UploadCloud className="size-4" />
                    {isSessionLoading ? "Initializing…" : "Upload notes"}
                </button>

                {isReturningUser && (
                    <button
                        type="button"
                        onClick={() => navigate("/flashcards-lab")}
                        className="text-[13px] leading-5 text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] transition-colors"
                    >
                        {existingDecks.length} saved deck{existingDecks.length !== 1 ? "s" : ""} — open lab
                    </button>
                )}
            </motion.div>

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
                    className="fixed right-5 top-5 z-50 w-[min(84vw,300px)]"
                    role="status"
                    aria-live="polite"
                    onMouseEnter={() => setIsHoveringToast(true)}
                    onMouseLeave={() => setIsHoveringToast(false)}
                    onFocusCapture={() => setIsHoveringToast(true)}
                    onBlurCapture={() => setIsHoveringToast(false)}
                >
                    <div
                        className={`status-toast relative overflow-hidden px-3.5 py-3 text-left ${
                            isClosing ? "status-toast-exit" : "status-toast-enter"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-label">
                                {isGeneratingFlashcards ? "Flashcards" : "Embedding"}
                            </span>
                            <button
                                type="button"
                                onClick={closeToast}
                                className="rounded-md p-0.5 text-[var(--fg-tertiary)] transition hover:text-[var(--fg)]"
                                aria-label="Close"
                            >
                                <X className="size-3.5" />
                            </button>
                        </div>
                        <div className="mt-1.5 text-[14px] leading-5 text-[var(--fg)]">
                            {loadingMessage || (isGeneratingFlashcards ? "Generating flashcards..." : "Preparing embeddings...")}
                        </div>
                        {isUploading || isGeneratingFlashcards ? (
                            <div className="status-progress-track mt-2.5">
                                <div className="status-progress" />
                            </div>
                        ) : null}
                        {!isGeneratingFlashcards && totalFiles > 0 ? (
                            <div className="mt-2 text-[12px] leading-4 text-[var(--fg-tertiary)] font-mono">
                                {completedFiles}/{totalFiles}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
