import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps } from "react";
import { Check, FileText, Wand2, X, Layers, Clock, ArrowRight, UploadCloud } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/components/ui/Button";
import { BrandMark } from "@/shared/components/BrandMark";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/shared/components/ui/Select";
import { useNavigate } from "react-router-dom";
import { buildDeckTitle, loadDecks, markDeckStudied, upsertDeck, type FlashcardDeck } from "@/features/flashcards/utils/flashcardDecks";
import { formatModelLabel } from "@/shared/utils/modelLabel";
import { apiUrl } from "@/shared/utils/api";
import type { ApiFile } from "@/features/flashcards/types";

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

const readErrorMessage = async (response: Response, fallback: string) => {
    const raw = await response.text();
    if (!raw) {
        return fallback;
    }
    try {
        const data = JSON.parse(raw) as { detail?: unknown };
        if (typeof data.detail === "string" && data.detail.trim()) {
            return data.detail;
        }
    } catch {
        // Fall back to the raw response body when it is not JSON.
    }
    return raw;
};

export function FlashcardsLabPage() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const closeTimeoutRef = useRef<number | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("create");
    const [selected, setSelected] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [studyFocus, setStudyFocus] = useState("");
    const [flashcardAmount, setFlashcardAmount] = useState<FlashcardAmountOption>("medium");
    const [loadingMessage, setLoadingMessage] = useState("");
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
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
                apiUrl("/files", { session_id: sessionId })
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

            const response = await fetch(apiUrl(`/llm?${params.toString()}`));
            if (!response.ok) {
                const detail = await readErrorMessage(response, "Flashcard generation failed.");
                throw new Error(detail);
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
            event.target.value = "";
            return;
        }

        const fileList = Array.from(files);
        const formData = new FormData();
        fileList.forEach((file) => formData.append("files", file));

        setIsUploading(true);
        setShowToast(true);
        setIsClosing(false);
        setCompletedFiles(0);
        setTotalFiles(fileList.length);
        setLoadingMessage(
            `Embedding ${fileList.length} document${fileList.length === 1 ? "" : "s"}...`
        );

        try {
            const response = await fetch(
                apiUrl("/upload-files", { session_id: sessionId }),
                {
                    method: "POST",
                    body: formData,
                }
            );

            if (!response.ok || !response.body) {
                const detail = response.ok ? "Upload failed. Please try again." : await response.text();
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
                setLoadingMessage(
                    `Processed ${completed}/${fileList.length} files with ${errorCount} error${errorCount === 1 ? "" : "s"}.`
                );
            } else {
                const totalProcessed = embeddedCount + skippedCount;
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
            setLoadingMessage(message);
        } finally {
            setIsUploading(false);
            event.target.value = "";
        }
    };

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-[var(--bg-chrome)] text-[var(--fg)] relative">
            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-5 sm:px-6 border-b border-[var(--stroke-tertiary)] bg-[var(--bg-chrome)]">
                <div className="flex items-center gap-3 text-[14px]">
                    <BrandMark />
                    <span className="text-[var(--fg-quaternary)]">/</span>
                    <span className="text-[var(--fg-secondary)]">Lab</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/upload')}
                >
                    <X className="size-4" />
                </Button>
            </nav>

            <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1040px] flex-col items-stretch px-5 pb-20 pt-24 sm:px-6">

                {/* Tabs */}
                <div className="flex mb-6">
                    <div className="p-0.5 bg-[var(--fill-quaternary)] border border-[var(--stroke-tertiary)] rounded-lg inline-flex relative">
                        {[
                            { id: "create", label: "Create Deck", icon: PlusCircle },
                            { id: "decks", label: "My Decks", icon: Layers },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`relative h-8 px-3.5 rounded-md text-[14px] transition-colors duration-150 z-10 flex items-center gap-1.5 ${
                                    activeTab === tab.id
                                        ? "text-[var(--fg)]"
                                        : "text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)]"
                                }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-[var(--fill-secondary)] rounded"
                                        transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                                    />
                                )}
                                <tab.icon className="size-3.5 relative" />
                                <span className="relative">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === "create" ? (
                        <motion.section
                            key="create"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="flex w-full flex-col rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] h-[min(68vh,640px)] min-h-[480px] max-h-[700px] overflow-hidden"
                        >
                            {/* Top Bar */}
                            <div className="flex flex-col gap-2 border-b border-[var(--stroke-tertiary)] px-4 py-3">
                                <div
                                    className="text-left text-[12px] text-[var(--fg-tertiary)] line-clamp-1"
                                    title={`${selectedCount} / ${totalDocs} selected`}
                                >
                                    <span className="text-[var(--fg-secondary)]">{selectedCount}</span>
                                    <span className="text-[var(--fg-quaternary)]"> / </span>
                                    {totalDocs} selected
                                </div>

                                <div className="flex w-full flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex w-full min-w-0 flex-col gap-1.5 lg:max-w-[340px] lg:flex-row lg:items-center lg:gap-2">
                                        <label
                                            htmlFor="study-focus"
                                            className="shrink-0 text-label"
                                        >
                                            Focus
                                        </label>
                                        <div className="min-w-0 flex-1">
                                            <input
                                                id="study-focus"
                                                value={studyFocus}
                                                onChange={(event) => setStudyFocus(event.target.value)}
                                                placeholder="Optional: recursion, formulas, React hooks"
                                                disabled={isUploading || isGenerating || documentsLoading}
                                                maxLength={160}
                                                className="h-8 w-full rounded-lg border border-[var(--stroke-secondary)] bg-[var(--bg-chrome)] px-3 text-[14px] text-[var(--fg-secondary)] outline-none transition-colors hover:border-[var(--stroke-primary)] focus:border-[var(--accent-hex)] focus:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-[var(--fg-quaternary)]"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex w-full min-w-0 flex-col gap-2.5 lg:w-auto lg:flex-row lg:items-center lg:justify-end lg:gap-3">
                                        <div className="flex w-full min-w-0 flex-col gap-1.5 lg:w-auto lg:flex-row lg:items-center lg:gap-2">
                                            <span className="shrink-0 text-label">
                                                Amount
                                            </span>
                                            <div className="min-w-0 w-full lg:w-[140px] lg:flex-none">
                                                <Select
                                                    value={flashcardAmount}
                                                    onValueChange={(value) => setFlashcardAmount(value as FlashcardAmountOption)}
                                                    disabled={isUploading || isGenerating}
                                                >
                                                    <SelectTrigger
                                                        id="flashcard-amount"
                                                        aria-label="Flashcard amount"
                                                        className="h-8 rounded-lg border border-[var(--stroke-secondary)] bg-[var(--bg-chrome)] px-3 text-[14px] text-[var(--fg-secondary)] hover:border-[var(--stroke-primary)] focus:ring-0 focus:outline-none whitespace-nowrap"
                                                        title={selectedAmountOption.label}
                                                    >
                                                        <span className="truncate">{selectedAmountOption.label}</span>
                                                    </SelectTrigger>
                                                    <SelectContent className="w-[min(90vw,220px)] rounded-md border border-[var(--stroke-secondary)] bg-[var(--bg-elevated)] p-1 shadow-none">
                                                        {FLASHCARD_AMOUNT_OPTIONS.map((option) => (
                                                            <SelectItem
                                                                key={option.value}
                                                                value={option.value}
                                                                textValue={option.label}
                                                                className="items-start py-2 pr-8"
                                                            >
                                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                                    <span className="line-clamp-1 text-[13px] text-[var(--fg)]">{option.label}</span>
                                                                    <span className="line-clamp-2 text-[12px] leading-4 text-[var(--fg-tertiary)]">
                                                                        {option.description}
                                                                    </span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="flex w-full items-center gap-3 lg:w-auto">
                                            <div className="flex items-center gap-3 text-[12px]">
                                                <button
                                                    onClick={() => {
                                                        if (documentsLoading) return;
                                                        setSelected(documents.map((doc) => doc.id));
                                                    }}
                                                    className="text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg)] whitespace-nowrap"
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (documentsLoading) return;
                                                        setSelected([]);
                                                    }}
                                                    className="text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg)] whitespace-nowrap"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <Button
                                                onClick={handleUploadClick}
                                                disabled={isUploading || documentsLoading}
                                                variant="outline"
                                                size="sm"
                                                className="ml-auto lg:ml-0"
                                            >
                                                <UploadCloud className="size-3.5" />
                                                <span>{isUploading ? "Uploading..." : "Upload"}</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* List */}
                            <div className="flex-1 min-h-0 divide-y divide-[var(--stroke-tertiary)] overflow-y-auto">
                                {documentsLoading ? (
                                    <div className="divide-y divide-[var(--stroke-tertiary)]">
                                        {[...Array(4)].map((_, i) => (
                                            <div
                                                key={i}
                                                className="flex h-16 items-center justify-between gap-3 px-5"
                                                style={{ animationDelay: `${i * 90}ms` }}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="h-7 w-7 shrink-0 rounded-md skeleton" />
                                                    <div className="min-w-0 flex-1 space-y-2">
                                                        <div
                                                            className="h-2.5 rounded skeleton-strong"
                                                            style={{
                                                                width: `${36 + (i % 3) * 12}%`,
                                                                animationDelay: `${i * 90 + 40}ms`,
                                                            }}
                                                        />
                                                        <div
                                                            className="h-2 rounded skeleton"
                                                            style={{
                                                                width: `${20 + (i % 2) * 10}%`,
                                                                animationDelay: `${i * 90 + 80}ms`,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="h-4 w-4 rounded-sm skeleton" />
                                            </div>
                                        ))}
                                    </div>
                                ) : documentsError ? (
                                    <div
                                        className="px-4 py-8 text-center text-[14px] text-[var(--fg-tertiary)] line-clamp-2"
                                        title={documentsError}
                                    >
                                        {documentsError}
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-[14px] text-[var(--fg-tertiary)]">
                                        No documents found for this session.
                                    </div>
                                ) : (
                                    documents.map((doc) => {
                                        const isSelected = selected.includes(doc.id);
                                        return (
                                            <button
                                                key={doc.id}
                                                onClick={() => toggleSelection(doc.id)}
                                                className={`w-full flex h-16 items-center justify-between gap-3 px-5 text-left transition-colors duration-100 overflow-hidden ${
                                                    isSelected
                                                        ? "bg-[var(--fill-quaternary)]"
                                                        : "hover:bg-[var(--fill-quaternary)]"
                                                }`}
                                            >
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <div className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${
                                                        isSelected
                                                            ? "bg-[var(--fill-tertiary)] border-[var(--stroke-secondary)] text-[var(--fg-secondary)]"
                                                            : "bg-transparent border-[var(--stroke-tertiary)] text-[var(--fg-quaternary)]"
                                                    }`}>
                                                        <FileText className="size-3.5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div
                                                            className={`text-[13px] leading-[18px] line-clamp-1 ${
                                                                isSelected
                                                                    ? "text-[var(--fg)] text-heading"
                                                                    : "text-[var(--fg-secondary)]"
                                                            }`}
                                                            title={doc.title}
                                                        >
                                                            {doc.title}
                                                        </div>
                                                        <div className="text-[12px] leading-4 text-[var(--fg-quaternary)] mt-0.5 line-clamp-1" title={doc.meta}>
                                                            {doc.meta}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                                                        isSelected
                                                            ? "bg-[var(--accent-hex)] border-[var(--accent-hex)] text-[var(--on-accent)]"
                                                            : "bg-transparent border-[var(--stroke-secondary)] text-transparent"
                                                    }`}
                                                >
                                                    <Check className="size-2.5 stroke-[3]" />
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Bottom Action Bar */}
                            <div className="flex flex-col gap-2 border-t border-[var(--stroke-tertiary)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    {generateError ? (
                                        <div className="text-[12px] text-[var(--destructive)] line-clamp-2 sm:line-clamp-1" title={generateError}>
                                            {generateError}
                                        </div>
                                    ) : isGenerating ? (
                                        <div className="text-[12px] text-[var(--fg-tertiary)]">
                                            Generating deck…
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    onClick={handleGenerate}
                                    disabled={selectedCount === 0 || isGenerating || isUploading || documentsLoading || documents.length === 0 || !!documentsError}
                                    className={`luminous-btn flex h-8 w-full items-center justify-center gap-2 px-3.5 text-[14px] whitespace-nowrap sm:w-auto ${
                                        selectedCount === 0 || documentsLoading || documents.length === 0 || !!documentsError
                                            ? "cursor-not-allowed opacity-40"
                                            : ""
                                    }`}
                                >
                                    {isGenerating ? (
                                        <span className="loader-ring loader-ring-sm loader-ring-on-accent" aria-hidden />
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
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="mx-auto grid w-full min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
                        >
                            {sortedDecks.length === 0 ? (
                                <div className="col-span-full flex flex-col items-center justify-center gap-2 min-h-[200px] rounded-lg border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] p-8 text-center">
                                    <Layers className="size-5 text-[var(--fg-quaternary)] mb-1" />
                                    <p className="text-[14px] text-[var(--fg-secondary)]">No decks yet</p>
                                    <p className="text-[12px] text-[var(--fg-tertiary)] max-w-[240px] leading-4">
                                        Select notes in Create Deck and generate your first set.
                                    </p>
                                </div>
                            ) : (
                                sortedDecks.map((deck) => {
                                    const masteryValue =
                                        typeof deck.mastery === "number" && Number.isFinite(deck.mastery)
                                            ? Math.min(100, Math.max(0, deck.mastery))
                                            : 0;
                                    const masteryLabel = masteryValue > 0 ? `${masteryValue}%` : "New";
                                    const timeLabel = deck.lastStudiedAt
                                        ? `Studied ${formatRelativeTime(deck.lastStudiedAt)}`
                                        : `Created ${formatRelativeTime(deck.createdAt)}`;
                                    const notesLabel = `${deck.noteCount} note${deck.noteCount === 1 ? "" : "s"}`;
                                    const cardLabel = `${deck.cardCount} card${deck.cardCount === 1 ? "" : "s"}`;

                                    return (
                                        <div
                                            key={deck.id}
                                            className="group relative flex flex-col justify-between overflow-hidden rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] p-5 cursor-pointer
                                                       transition-colors duration-120
                                                       hover:border-[var(--stroke-secondary)] hover:bg-[var(--fill-quaternary)]"
                                            onClick={() => handleStudyDeck(deck)}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between mb-2.5 gap-2">
                                                    <h3 className="text-[15px] leading-6 text-heading text-[var(--fg)] line-clamp-2" title={deck.title}>
                                                        {deck.title}
                                                    </h3>
                                                    <span className="shrink-0 text-[12px] leading-4 text-[var(--fg-tertiary)]" title={cardLabel}>
                                                        {cardLabel}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 text-[12px] leading-4 text-[var(--fg-tertiary)] min-w-0 overflow-hidden mb-4">
                                                    <span className="flex min-w-0 items-center gap-1">
                                                        <Clock className="size-3 flex-none opacity-60" />
                                                        <span className="line-clamp-1" title={timeLabel}>{timeLabel}</span>
                                                    </span>
                                                    <span className="text-[var(--fg-quaternary)]">·</span>
                                                    <span className="line-clamp-1 min-w-0" title={notesLabel}>{notesLabel}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-3 border-t border-[var(--stroke-tertiary)]">
                                                <div className="flex-1 mr-3">
                                                    <div className="w-full bg-[var(--fill-tertiary)] h-px overflow-hidden">
                                                        <div
                                                            className="h-full bg-[var(--accent-hex)] transition-all duration-300"
                                                            style={{ width: `${masteryValue}%` }}
                                                        />
                                                    </div>
                                                    <div className="mt-1.5 text-[12px] text-[var(--fg-quaternary)]">{masteryLabel}</div>
                                                </div>
                                                <div className="flex items-center gap-1 text-[12px] text-[var(--fg-tertiary)] group-hover:text-[var(--fg-secondary)] transition-colors">
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
                    className="fixed z-50 w-[min(92vw,280px)] left-1/2 -translate-x-1/2 top-16 sm:left-auto sm:translate-x-0 sm:top-4 sm:right-4"
                    role="status"
                    aria-live="polite"
                    onMouseEnter={() => setIsHoveringToast(true)}
                    onMouseLeave={() => setIsHoveringToast(false)}
                    onFocusCapture={() => setIsHoveringToast(true)}
                    onBlurCapture={() => setIsHoveringToast(false)}
                >
                    <div
                        className={`status-toast relative overflow-hidden px-3 py-2.5 text-left ${
                            isClosing ? "status-toast-exit" : "status-toast-enter"
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-label">
                                {isGenerating ? "Flashcards" : "Embedding"}
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
                            {loadingMessage || (isGenerating ? "Generating flashcards..." : "Preparing embeddings...")}
                        </div>
                        {isUploading || isGenerating ? (
                            <div className="status-progress-track mt-2.5">
                                <div className="status-progress" />
                            </div>
                        ) : null}
                        {!isGenerating && totalFiles > 0 ? (
                            <div className="mt-2 text-[12px] leading-4 text-[var(--fg-tertiary)] font-mono">
                                {completedFiles}/{totalFiles}
                            </div>
                        ) : null}
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
