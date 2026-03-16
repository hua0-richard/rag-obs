import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { Check, FileText, Wand2, X, Layers, Clock, ArrowRight, UploadCloud, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/components/ui/Button";
import { Input } from "@/shared/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/shared/components/ui/Select";
import { useNavigate } from "react-router-dom";
import { buildDeckTitle, loadDecks, markDeckStudied, upsertDeck, type FlashcardDeck } from "@/features/flashcards/utils/flashcardDecks";
import { formatModelLabel } from "@/shared/utils/modelLabel";

type ApiFile = {
    id: number;
    filename: string | null;
    content_type: string | null;
    size_bytes: number | null;
};

type Document = {
    id: string;
    title: string;
    meta: string;
    updatedAt?: string;
};

type Tab = "create" | "decks";
type FlashcardAmountOption = "small" | "medium" | "large";

const FLASHCARD_AMOUNT_OPTIONS: { value: FlashcardAmountOption; label: string; description: string }[] = [
    {
        value: "small",
        label: "Small",
        description: "Quick pass.",
    },
    {
        value: "medium",
        label: "Medium",
        description: "Balanced set.",
    },
    {
        value: "large",
        label: "Large",
        description: "Deep review.",
    },
];


const formatRelativeTime = (isoTimestamp: string) => {
    const timestamp = new Date(isoTimestamp).getTime();
    if (!Number.isFinite(timestamp)) {
        return "just now";
    }
    const diffMs = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days} day${days === 1 ? "" : "s"} ago`;
    }
    const weeks = Math.floor(days / 7);
    if (weeks < 5) {
        return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
    }
    const months = Math.floor(days / 30);
    if (months < 12) {
        return `${months} month${months === 1 ? "" : "s"} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
};

const formatFilename = (value: string | null) => {
    if (!value) {
        return "Untitled";
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return "Untitled";
    }
    return trimmed.split(/[\\/]/).pop() ?? trimmed;
};

const formatFileSize = (sizeBytes: number | null) => {
    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes)) {
        return "Unknown size";
    }
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }
    const kb = sizeBytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    if (mb < 1024) {
        return `${mb.toFixed(1)} MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
};

const buildDocument = (file: ApiFile): Document => {
    const typeLabel = file.content_type?.trim() || "unknown type";
    const sizeLabel = formatFileSize(file.size_bytes);
    return {
        id: String(file.id),
        title: formatFilename(file.filename),
        meta: `${typeLabel} · ${sizeLabel}`,
        updatedAt: "Stored in session",
    };
};

export function FlashcardsLabPage() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pulseTimeoutRef = useRef<number | null>(null);
    const closeTimeoutRef = useRef<number | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("create");
    const [selected, setSelected] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [_uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [_uploadIsError, setUploadIsError] = useState(false);
    const [studyFocus, setStudyFocus] = useState("");
    const [flashcardAmount, setFlashcardAmount] = useState<FlashcardAmountOption>("medium");
    const [loadingMessage, setLoadingMessage] = useState("");
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
    const [pulseComplete, setPulseComplete] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [isHoveringToast, setIsHoveringToast] = useState(false);
    const [decks, setDecks] = useState<FlashcardDeck[]>(() => loadDecks());
    const [documents, setDocuments] = useState<Document[]>([]);
    const [documentsLoading, setDocumentsLoading] = useState(true);
    const [documentsError, setDocumentsError] = useState<string | null>(null);
    const selectedDeckKey = (sid: string) => `flashcards_selected_deck_id:${sid}`;

    const selectedCount = selected.length;
    const totalDocs = documents.length;
    const selectedAmountOption =
        FLASHCARD_AMOUNT_OPTIONS.find((option) => option.value === flashcardAmount) ??
        FLASHCARD_AMOUNT_OPTIONS[1];

    const fetchDocuments = useCallback(async (sessionId: string) => {
        setDocumentsLoading(true);
        setDocumentsError(null);
        try {
            const response = await fetch(
                `${import.meta.env.SERVER_URL}/files?session_id=${encodeURIComponent(sessionId)}`
            );
            if (!response.ok) {
                const detail = await response.text();
                throw new Error(detail || "Failed to load files");
            }
            const data = await response.json();
            const list: ApiFile[] = Array.isArray(data?.files) ? data.files : [];
            const docs = list.map(buildDocument);
            setDocuments(docs);
            setSelected((prev) => {
                const ids = new Set(docs.map((doc) => doc.id));
                const filtered = prev.filter((id) => ids.has(id));
                if (filtered.length > 0) {
                    return filtered;
                }
                return docs.length > 0 ? [docs[0].id] : [];
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load files";
            setDocuments([]);
            setDocumentsError(message);
        } finally {
            setDocumentsLoading(false);
        }
    }, []);

    useEffect(() => {
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setDocuments([]);
            setDocumentsError("No session id found. Upload files to start a session.");
            setDocumentsLoading(false);
            return;
        }
        fetchDocuments(sessionId);
    }, [fetchDocuments]);

    useEffect(() => {
        if (activeTab === "decks") {
            setDecks(loadDecks());
        }
    }, [activeTab]);

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
            !isGenerating &&
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
    }, [showToast, isUploading, isGenerating, totalFiles, completedFiles, isHoveringToast]);

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

    const sortedDecks = useMemo(() => {
        return [...decks].sort((a, b) => {
            const aTimeRaw = new Date(a.lastStudiedAt ?? a.createdAt).getTime();
            const bTimeRaw = new Date(b.lastStudiedAt ?? b.createdAt).getTime();
            const aTime = Number.isFinite(aTimeRaw) ? aTimeRaw : 0;
            const bTime = Number.isFinite(bTimeRaw) ? bTimeRaw : 0;
            return bTime - aTime;
        });
    }, [decks]);

    const handleStudyDeck = (deck: FlashcardDeck) => {
        localStorage.setItem("session_id", deck.sessionId);
        if (typeof deck.backendDeckId === "number" && Number.isFinite(deck.backendDeckId)) {
            localStorage.setItem(selectedDeckKey(deck.sessionId), String(deck.backendDeckId));
        } else {
            localStorage.removeItem(selectedDeckKey(deck.sessionId));
        }
        const nextDecks = markDeckStudied(deck.sessionId, deck.id);
        if (nextDecks.length > 0) {
            setDecks(nextDecks);
        }
        navigate("/flashcards");
    };

    const toggleSelection = (id: string) => {
        setSelected((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleGenerate = async () => {
        if (isGenerating || isUploading || selectedCount === 0 || documentsLoading || documents.length === 0) {
            return;
        }
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setGenerateError("No session id found. Upload files to start a session.");
            return;
        }

        const selectedDocs = documents.filter((doc) => selected.includes(doc.id));
        const selectedIds = selectedDocs
            .map((doc) => Number(doc.id))
            .filter((value) => Number.isFinite(value));
        if (selectedIds.length === 0) {
            setGenerateError("Select at least one document to generate a deck.");
            return;
        }
        const trimmedStudyFocus = studyFocus.trim();

        setGenerateError(null);
        setShowToast(true);
        setIsClosing(false);
        setLoadingMessage(
            trimmedStudyFocus
                ? "Generating flashcards with hybrid retrieval..."
                : "Generating flashcards..."
        );
        setTotalFiles((prev) => (prev > 0 ? prev : selectedIds.length));
        setCompletedFiles((prev) => (prev > 0 ? prev : selectedIds.length));
        setIsGenerating(true);
        try {
            const params = new URLSearchParams({
                session_id: sessionId,
                replace: "true",
            });
            if (flashcardAmount !== "medium") {
                params.set("flashcard_amount", flashcardAmount);
            }
            if (trimmedStudyFocus) {
                params.set("prompt", trimmedStudyFocus);
            }
            selectedIds.forEach((id) => params.append("file_ids", String(id)));

            const response = await fetch(`${import.meta.env.SERVER_URL}/llm?${params.toString()}`);
            if (!response.ok) {
                const detail = await response.text();
                throw new Error(detail || "Flashcard generation failed.");
            }

            const data = await response.json() as Record<string, unknown>;

            const savedCount =
                typeof data?.saved_count === "number"
                    ? data.saved_count
                    : Array.isArray(data?.flashcards)
                        ? (data.flashcards as unknown[]).length
                        : 0;
            const backendDeckId =
                typeof (data?.deck as Record<string, unknown> | null)?.id === "number" &&
                Number.isFinite((data?.deck as Record<string, unknown>)?.id)
                    ? (data.deck as Record<string, unknown>).id as number
                    : undefined;

            const modelLabel = typeof data?.model_used === "string"
                ? formatModelLabel(data.model_used)
                : null;
            setLoadingMessage(
                typeof data?.saved_count === "number"
                    ? `Generated ${savedCount} cards${modelLabel ? ` via ${modelLabel}` : ""}.`
                    : "Flashcards generated."
            );
            const deckSessionId = String(sessionId);
            const selectedTitles = selectedDocs.map((doc) => doc.title);
            const nextDecks = upsertDeck({
                id:
                    typeof backendDeckId === "number"
                        ? `deck-${deckSessionId}-${backendDeckId}`
                        : `deck-${deckSessionId}-${Date.now()}`,
                sessionId: deckSessionId,
                backendDeckId,
                title: buildDeckTitle(selectedTitles),
                cardCount: savedCount,
                noteCount: selectedTitles.length,
                notes: selectedTitles,
                createdAt: new Date().toISOString(),
            });
            setDecks(nextDecks);
            if (typeof backendDeckId === "number") {
                localStorage.setItem(selectedDeckKey(deckSessionId), String(backendDeckId));
            } else {
                localStorage.removeItem(selectedDeckKey(deckSessionId));
            }
            navigate("/flashcards");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Flashcard generation failed.";
            setGenerateError(message);
            setLoadingMessage(message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUploadClick = () => {
        if (isUploading || documentsLoading) {
            return;
        }
        fileInputRef.current?.click();
    };

    const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0 || isUploading) {
            event.target.value = "";
            return;
        }
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setUploadIsError(true);
            setUploadStatus("No session id found. Start a session to upload files.");
            event.target.value = "";
            return;
        }

        const fileList = Array.from(files);
        const formData = new FormData();
        fileList.forEach((file) => formData.append("files", file));

        setIsUploading(true);
        setUploadIsError(false);
        setUploadStatus(`Uploading ${fileList.length} file${fileList.length === 1 ? "" : "s"}...`);
        setShowToast(true);
        setIsClosing(false);
        setCompletedFiles(0);
        setTotalFiles(fileList.length);
        setLoadingMessage(
            `Embedding ${fileList.length} document${fileList.length === 1 ? "" : "s"}...`
        );

        try {
            const uploadUrl = new URL(`${import.meta.env.SERVER_URL}/upload-files`);
            uploadUrl.searchParams.set("session_id", sessionId);
            const response = await fetch(
                uploadUrl.toString(),
                {
                    method: "POST",
                    body: formData,
                }
            );

            if (!response.ok || !response.body) {
                const detail = response.ok ? "Upload failed. Please try again." : await response.text();
                setUploadIsError(true);
                setUploadStatus(detail || "Upload failed. Please try again.");
                setLoadingMessage(detail || "Upload failed. Please try again.");
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let completed = 0;
            let embeddedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            let lastError = "";

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
                    if (!payloadText || payloadText === "[DONE]") {
                        continue;
                    }

                    try {
                        const payload = JSON.parse(payloadText);
                    if (payload?.status === "session" && payload?.session_id) {
                        localStorage.setItem("session_id", String(payload.session_id));
                        continue;
                    }
                    if (payload?.status === "embedded") {
                        completed += 1;
                        setCompletedFiles(completed);
                        const filename =
                            payload?.filename || fileList[Math.max(0, completed - 1)]?.name || "document";
                        setLoadingMessage(
                            `Embedded ${filename} (${completed}/${fileList.length})`
                        );
                        embeddedCount += 1;
                        setPulseComplete(true);
                        if (pulseTimeoutRef.current) {
                            window.clearTimeout(pulseTimeoutRef.current);
                        }
                        pulseTimeoutRef.current = window.setTimeout(() => {
                            setPulseComplete(false);
                        }, 900);
                        continue;
                    }
                    if (payload?.status === "skipped") {
                        completed += 1;
                        setCompletedFiles(completed);
                        const filename =
                            payload?.filename || fileList[Math.max(0, completed - 1)]?.name || "document";
                        setLoadingMessage(
                            `Skipped ${filename} (${completed}/${fileList.length})`
                        );
                        skippedCount += 1;
                        continue;
                    }
                    if (payload?.status === "error") {
                        errorCount += 1;
                        setUploadIsError(true);
                        lastError = payload?.detail || "Upload failed. Please try again.";
                        if (payload?.filename) {
                            completed += 1;
                            setCompletedFiles(completed);
                            lastError = `Failed ${payload.filename}: ${lastError}`;
                            setLoadingMessage(lastError);
                        } else {
                            setLoadingMessage(lastError);
                        }
                        if (payload?.detail === "session_id not found") {
                            localStorage.removeItem("session_id");
                        }
                    }
                } catch {
                        // Ignore malformed payloads
                    }
                }
            }

            if (errorCount > 0) {
                setUploadIsError(true);
                setUploadStatus(lastError || `Upload finished with ${errorCount} error${errorCount === 1 ? "" : "s"}.`);
                setLoadingMessage(
                    `Processed ${completed}/${fileList.length} files with ${errorCount} error${errorCount === 1 ? "" : "s"}.`
                );
            } else {
                const totalProcessed = embeddedCount + skippedCount;
                setUploadStatus(
                    `Uploaded ${totalProcessed} file${totalProcessed === 1 ? "" : "s"}.`
                );
                if (totalProcessed === 0) {
                    setLoadingMessage("No documents were embedded.");
                } else if (totalProcessed < fileList.length) {
                    setLoadingMessage(`Processed ${totalProcessed}/${fileList.length} files.`);
                } else {
                    setLoadingMessage("All documents embedded.");
                }
            }

            await fetchDocuments(sessionId);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
            setUploadIsError(true);
            setUploadStatus(message);
            setLoadingMessage(message);
        } finally {
            setIsUploading(false);
            event.target.value = "";
        }
    };

    return (
        <div className="min-h-screen w-full bg-[#09090b] text-white/90 selection:bg-[hsl(var(--accent)/0.3)] relative">
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
            {/* Ambient Vignette */}
            <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,rgba(0,0,0,0.0)_70%)]" />

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 bg-transparent">
                <div className="text-white/40 font-medium text-sm tracking-widest uppercase font-mono">
                    <span className="text-[hsl(var(--accent))]">Flashcards</span> <span className="text-white/20 mx-2">/</span> Lab
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/upload')}
                    className="text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors duration-300"
                >
                    <X className="size-5" />
                </Button>
            </nav>

            <main className="relative z-10 mx-auto flex h-screen w-screen max-w-[1500px] flex-col items-center px-6 pb-20 pt-32">

                {/* Tabs */}
                <div className="flex justify-center mb-8">
                    <div className="p-1 bg-[#18181b]/50 backdrop-blur-md border border-white/5 rounded-full inline-flex relative">
                        {[
                            { id: "create", label: "Create Deck", icon: PlusCircle },
                            { id: "decks", label: "My Decks", icon: Layers },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`relative px-6 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10 flex items-center gap-2 ${activeTab === tab.id ? "text-white" : "text-white/40 hover:text-white/60"
                                    }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white/10 rounded-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <tab.icon className="size-4" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === "create" ? (
                        <motion.section
                            key="create"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="group relative mx-auto flex w-full max-w-[1100px] flex-col rounded-2xl border border-white/5 bg-[#121215]/40 shadow-[0_20px_60px_-45px_rgba(0,0,0,0.8)] backdrop-blur-sm h-[min(72vh,720px)] min-h-[500px] sm:min-h-[540px] max-h-[760px] overflow-hidden"
                        >
                            {/* Top Bar */}
                            <div className="flex flex-col gap-3 border-b border-white/5 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <div
                                        className="text-xs font-mono text-white/40 line-clamp-1"
                                        title={`${selectedCount} / ${totalDocs} selected`}
                                    >
                                        <span className="text-white/70">{selectedCount}</span> <span className="opacity-50">/</span> {totalDocs} selected
                                    </div>
                                    <label className="flex min-w-0 flex-col gap-1.5 lg:max-w-[480px]">
                                        <span className="text-[9px] font-mono text-white/25 uppercase tracking-[0.2em]">
                                            Study Focus
                                        </span>
                                        <Input
                                            id="study-focus"
                                            value={studyFocus}
                                            onChange={(event) => setStudyFocus(event.target.value)}
                                            placeholder="Optional: recursion base case, key formulas, React hooks..."
                                            disabled={isUploading || isGenerating || documentsLoading}
                                            maxLength={160}
                                            className="h-9 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-sm text-white/75 placeholder:text-white/35 focus:border-[hsl(var(--accent)/0.35)]"
                                        />
                                        <span className="text-[11px] text-white/30">
                                            Optional. When filled, we use it as a hybrid retrieval query across the selected notes.
                                        </span>
                                    </label>
                                </div>

                                <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end lg:gap-4">
                                    <div className="flex w-full min-w-0 items-center gap-2.5 px-1 py-1.5 sm:w-auto lg:max-w-[260px]">
                                        <span className="text-[9px] font-mono text-white/25 uppercase tracking-[0.2em] shrink-0">
                                            Amount
                                        </span>
                                        <div className="min-w-0 flex-1 sm:w-[160px] sm:flex-none">
                                            <Select
                                                value={flashcardAmount}
                                                onValueChange={(value) => setFlashcardAmount(value as FlashcardAmountOption)}
                                                disabled={isUploading || isGenerating}
                                            >
                                                <SelectTrigger
                                                    id="flashcard-amount"
                                                    aria-label="Flashcard amount"
                                                    className="h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-0 text-xs text-white/50 transition-all hover:border-[hsl(var(--accent)/0.3)] hover:bg-white/[0.05] hover:text-white/75 focus:ring-0 focus:outline-none whitespace-nowrap"
                                                    title={selectedAmountOption.label}
                                                >
                                                    <span className="truncate">{selectedAmountOption.label}</span>
                                                </SelectTrigger>
                                                <SelectContent className="w-[min(90vw,220px)] rounded-xl border border-white/[0.07] bg-[#111113] p-1 shadow-2xl backdrop-blur-xl">
                                                    {FLASHCARD_AMOUNT_OPTIONS.map((option) => (
                                                        <SelectItem
                                                            key={option.value}
                                                            value={option.value}
                                                            textValue={option.label}
                                                            className="items-start py-2.5 pr-8"
                                                        >
                                                            <div className="flex min-w-0 flex-col gap-1">
                                                                <span className="line-clamp-1 text-xs text-white/80">{option.label}</span>
                                                                <span className="line-clamp-2 text-[10px] leading-snug text-white/35">
                                                                    {option.description}
                                                                </span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                if (documentsLoading) {
                                                    return;
                                                }
                                                setSelected(documents.map((doc) => doc.id));
                                            }}
                                            className="text-[11px] font-medium text-white/30 hover:text-white transition-colors whitespace-nowrap"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (documentsLoading) {
                                                    return;
                                                }
                                                setSelected([]);
                                            }}
                                            className="text-[11px] font-medium text-white/30 hover:text-white transition-colors whitespace-nowrap"
                                        >
                                            Clear
                                        </button>
                                        <Button
                                            onClick={handleUploadClick}
                                            disabled={isUploading || documentsLoading}
                                            variant="ghost"
                                            size="sm"
                                            className="group min-w-[120px] rounded-full px-4 text-[11px] bg-[#18181b] border border-white/5 border-t-white/10 text-white/75 shadow-[0_4px_12px_rgba(0,0,0,0.5),0_0_10px_-2px_hsl(var(--accent)/0.1),inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-[#202023] hover:border-[hsl(var(--accent)_/_0.3)] hover:text-white/90 hover:shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_20px_-5px_hsl(var(--accent)/0.4),inset_0_1px_0_rgba(255,255,255,0.1)] active:scale-[0.98] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200 ease-out"
                                        >
                                            <UploadCloud className="size-3.5 text-white/75 group-hover:text-white/90 transition-colors" />
                                            <span>{isUploading ? "Uploading..." : "Upload More"}</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* List */}
                            <div className="flex-1 min-h-0 divide-y divide-white/5 overflow-y-auto">
                                {documentsLoading ? (
                                    <div className="divide-y divide-white/5">
                                        {[...Array(4)].map((_, i) => (
                                            <div
                                                key={i}
                                                className="flex h-20 items-center justify-between gap-4 px-6 py-3"
                                                style={{ opacity: 1 - i * 0.18 }}
                                            >
                                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                                    <div className="h-10 w-10 shrink-0 rounded-lg bg-white/[0.04] animate-pulse" />
                                                    <div className="min-w-0 flex-1 space-y-2.5">
                                                        <div className="h-3 bg-white/[0.05] rounded-full animate-pulse" style={{ width: `${32 + (i % 3) * 14}%` }} />
                                                        <div className="h-2 bg-white/[0.03] rounded-full animate-pulse" style={{ width: `${18 + (i % 2) * 10}%` }} />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 shrink-0">
                                                    <div className="hidden sm:block h-2 w-16 bg-white/[0.03] rounded-full animate-pulse" />
                                                    <div className="h-5 w-5 rounded-full bg-white/[0.04] animate-pulse" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : documentsError ? (
                                    <div
                                        className="px-6 py-10 text-center text-sm text-white/40 line-clamp-2"
                                        title={documentsError}
                                    >
                                        {documentsError}
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="px-6 py-10 text-center text-sm text-white/40 line-clamp-2">
                                        No documents found for this session.
                                    </div>
                                ) : (
                                    documents.map((doc) => {
                                        const isSelected = selected.includes(doc.id);
                                        return (
                                            <button
                                                key={doc.id}
                                                onClick={() => toggleSelection(doc.id)}
                                                className={`w-full flex h-20 items-center justify-between gap-4 px-6 py-3 text-left transition-colors duration-200 overflow-hidden ${isSelected ? "bg-white/[0.03]" : "hover:bg-white/[0.01]"
                                                    }`}
                                            >
                                                <div className="flex min-w-0 items-center gap-4">
                                                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-200 ${isSelected
                                                        ? "bg-white/[0.06] border-white/10 text-white/70"
                                                        : "bg-transparent border-white/5 text-white/20"
                                                        }`}>
                                                        <FileText className="size-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div
                                                            className={`text-sm transition-colors duration-200 line-clamp-1 ${isSelected ? "text-white font-medium" : "text-white/60"}`}
                                                            title={doc.title}
                                                        >
                                                            {doc.title}
                                                        </div>
                                                        <div className="text-[11px] text-white/20 mt-0.5 font-mono line-clamp-1" title={doc.meta}>
                                                            {doc.meta}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${isSelected
                                                        ? "bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white"
                                                        : "bg-transparent border-white/10 text-transparent"
                                                        }`}
                                                >
                                                    <Check className="size-3 stroke-[3]" />
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Bottom Action Bar */}
                            <div className="border-t border-white/5 px-6 py-3 flex items-center justify-between gap-4 h-20 overflow-hidden">
                                <div className="min-w-0 flex-1">
                                    {generateError ? (
                                        <div className="text-[11px] font-mono text-rose-300/70 line-clamp-1" title={generateError}>
                                            {generateError}
                                        </div>
                                    ) : isGenerating ? (
                                        <div className="text-[11px] font-mono text-white/30 line-clamp-1">
                                            Generating deck…
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    onClick={handleGenerate}
                                    disabled={selectedCount === 0 || isGenerating || isUploading || documentsLoading || documents.length === 0 || !!documentsError}
                                    className={`luminous-btn h-10 min-w-[170px] px-6 flex items-center justify-center gap-2 text-sm transition-all duration-300 whitespace-nowrap shrink-0 ${selectedCount === 0 || documentsLoading || documents.length === 0 || !!documentsError ? "opacity-30 grayscale cursor-not-allowed" : ""
                                        }`}
                                >
                                    {isGenerating ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <Wand2 className="size-3.5" />
                                    )}
                                    <span>{isGenerating ? "Generating..." : "Generate Deck"}</span>
                                </button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                multiple
                                accept=".md,.markdown,.txt"
                                onChange={handleUploadChange}
                            />
                        </motion.section>
                    ) : (
                        <motion.div
                            key="decks"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="mx-auto grid w-full max-w-[1200px] grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                        >
                            {sortedDecks.length === 0 ? (
                                <div className="col-span-full flex flex-col items-center justify-center gap-3 min-h-[240px] rounded-2xl border border-white/5 bg-[#121215]/40 p-10 text-center">
                                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/[0.04] text-white/20 mb-1">
                                        <Layers className="size-5" />
                                    </div>
                                    <p className="text-sm text-white/40">No decks yet</p>
                                    <p className="text-xs text-white/25 max-w-[220px] leading-relaxed">
                                        Select notes in Create Deck and generate your first flashcard set.
                                    </p>
                                </div>
                            ) : (
                                sortedDecks.map((deck) => {
                                    const masteryValue =
                                        typeof deck.mastery === "number" && Number.isFinite(deck.mastery)
                                            ? Math.min(100, Math.max(0, deck.mastery))
                                            : 0;
                                    const masteryLabel = masteryValue > 0 ? `${masteryValue}% Mastery` : "New";
                                    const timeLabel = deck.lastStudiedAt
                                        ? `Studied ${formatRelativeTime(deck.lastStudiedAt)}`
                                        : `Created ${formatRelativeTime(deck.createdAt)}`;
                                    const notesLabel = `${deck.noteCount} Note${deck.noteCount === 1 ? "" : "s"}`;
                                    const cardLabel = `${deck.cardCount} Card${deck.cardCount === 1 ? "" : "s"}`;

                                    return (
                                        <div
                                            key={deck.id}
                                            className="group relative flex h-[260px] min-h-[260px] max-h-[260px] flex-col justify-between overflow-hidden rounded-2xl border border-white/5 bg-[#121215]/40 p-6 backdrop-blur-sm cursor-pointer
                                                       transition-all duration-300
                                                       hover:bg-[#16161a]/90 hover:border-[hsl(var(--accent)/0.2)]
                                                       shadow-[0_16px_40px_-30px_rgba(0,0,0,0.8)]
                                                       hover:shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9),0_0_30px_-10px_hsl(var(--accent)/0.15)]"
                                            onClick={() => handleStudyDeck(deck)}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))] transition-colors duration-300 group-hover:bg-[hsl(var(--accent)/0.18)]">
                                                        <Layers className="size-5" />
                                                    </div>
                                                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-full line-clamp-1 max-w-[110px]" title={cardLabel}>
                                                        {cardLabel}
                                                    </div>
                                                </div>

                                                <h3 className="text-base font-medium text-white/90 mb-1 line-clamp-2 group-hover:text-white transition-colors duration-300" title={deck.title}>
                                                    {deck.title}
                                                </h3>

                                                <div className="flex items-center gap-2.5 text-[11px] text-white/35 mb-6 min-w-0 overflow-hidden">
                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                        <Clock className="size-3 flex-none" />
                                                        <span className="line-clamp-1" title={timeLabel}>{timeLabel}</span>
                                                    </span>
                                                    <span className="w-1 h-1 rounded-full bg-white/15 flex-none" />
                                                    <span className="line-clamp-1 min-w-0" title={notesLabel}>{notesLabel}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/[0.06]">
                                                <div className="flex-1 mr-4">
                                                    <div className="w-full bg-white/[0.06] h-0.5 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[hsl(var(--accent))] opacity-70 rounded-full transition-all duration-700"
                                                            style={{ width: `${masteryValue}%` }}
                                                        />
                                                    </div>
                                                    <div className="mt-1.5 text-[10px] font-mono text-white/20">{masteryLabel}</div>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-white/40 group-hover:text-white/80 translate-x-1 group-hover:translate-x-0 transition-all duration-300">
                                                    Study <ArrowRight className="size-3" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
            {showToast ? (
                <div
                    className="fixed z-50 w-[min(92vw,320px)] left-1/2 -translate-x-1/2 top-20 sm:left-auto sm:translate-x-0 sm:top-6 sm:right-6"
                    role="status"
                    aria-live="polite"
                    onMouseEnter={() => setIsHoveringToast(true)}
                    onMouseLeave={() => setIsHoveringToast(false)}
                    onFocusCapture={() => setIsHoveringToast(true)}
                    onBlurCapture={() => setIsHoveringToast(false)}
                >
                    <div
                        className={`status-shell status-glow relative overflow-hidden rounded-[18px] ${
                            isUploading || isGenerating ? "loading-border" : ""
                        } ${pulseComplete ? "completion-pulse" : ""} ${
                            isClosing ? "toast-exit" : "toast-enter"
                        }`}
                    >
                        <div className="absolute inset-0 status-sheen pointer-events-none" />
                        <div className="status-card relative rounded-[16px] px-4 py-3 text-left text-sm text-white/80 backdrop-blur-xl">
                            <div className="accent-strip absolute left-0 top-0 h-full w-1.5" />
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.24em] text-white/45">
                                <span>{isGenerating ? "Flashcards" : "Embedding"}</span>
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
                                {loadingMessage || (isGenerating ? "Generating flashcards..." : "Preparing embeddings...")}
                            </div>
                            {isUploading || isGenerating ? (
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
                                        {isGenerating ? "Generating flashcards" : "Storing vector embeddings"}
                                    </span>
                                </div>
                                <span>
                                    {isGenerating ? "…" : `${completedFiles}/${totalFiles}`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function PlusCircle(props: ComponentProps<"svg">) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
        </svg>
    )
}
