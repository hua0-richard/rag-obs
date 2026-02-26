import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Check, FileText, Wand2, Sparkles, X, Layers, Clock, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/components/ui/Button";
import { useNavigate } from "react-router-dom";
import { loadDecks, markDeckStudied, type FlashcardDeck } from "@/features/flashcards/utils/flashcardDecks";

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

export function FlashcardsLabPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>("create");
    const [selected, setSelected] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [decks, setDecks] = useState<FlashcardDeck[]>(() => loadDecks());
    const [documents, setDocuments] = useState<Document[]>([]);
    const [documentsLoading, setDocumentsLoading] = useState(true);
    const [documentsError, setDocumentsError] = useState<string | null>(null);

    const selectedCount = selected.length;
    const totalDocs = documents.length;

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

    useEffect(() => {
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setDocuments([]);
            setDocumentsError("No session id found. Upload files to start a session.");
            setDocumentsLoading(false);
            return;
        }

        const fetchDocuments = async () => {
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
        };

        fetchDocuments();
    }, []);

    useEffect(() => {
        if (activeTab === "decks") {
            setDecks(loadDecks());
        }
    }, [activeTab]);

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
        const nextDecks = markDeckStudied(deck.sessionId);
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

    const handleGenerate = () => {
        if (isGenerating || selectedCount === 0 || documentsLoading || documents.length === 0) {
            return;
        }
        setIsGenerating(true);
        window.setTimeout(() => {
            setIsGenerating(false);
            navigate("/flashcards");
        }, 1500);
    };

    return (
        <div className="min-h-screen w-full bg-[#09090b] text-white/90 selection:bg-[hsl(var(--accent)/0.3)] relative">
            {/* Ambient Vignette */}
            <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,rgba(0,0,0,0.0)_70%)]" />

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 bg-transparent">
                <div className="text-white/40 font-medium text-sm tracking-widest uppercase font-mono">
                    <span className="text-[hsl(var(--accent))]">Flashcards</span> <span className="text-[hsl(var(--accent))/40] mx-2">/</span> Lab
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/')}
                    className="text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors duration-300"
                >
                    <X className="size-5" />
                </Button>
            </nav>

            <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-6 pb-20 pt-32">

                {/* Tabs */}
                <div className="flex justify-center mb-12">
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
                            className="group relative rounded-2xl border border-white/5 bg-[#121215]/40 w-full flex-1 flex flex-col"
                        >
                            {/* Top Bar */}
                            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
                                <div className="text-xs font-mono text-white/40">
                                    <span className="text-white/70">{selectedCount}</span> <span className="opacity-50">/</span> {totalDocs} selected
                                </div>

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => {
                                            if (documentsLoading) {
                                                return;
                                            }
                                            setSelected(documents.map((doc) => doc.id));
                                        }}
                                        className="text-[11px] font-medium text-white/30 hover:text-white transition-colors"
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
                                        className="text-[11px] font-medium text-white/30 hover:text-white transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* List */}
                            <div className="divide-y divide-white/5 flex-1">
                                {documentsLoading ? (
                                    <div className="px-6 py-10 text-center text-sm text-white/40">
                                        Loading documents...
                                    </div>
                                ) : documentsError ? (
                                    <div className="px-6 py-10 text-center text-sm text-white/40">
                                        {documentsError}
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="px-6 py-10 text-center text-sm text-white/40">
                                        No documents found for this session.
                                    </div>
                                ) : (
                                    documents.map((doc) => {
                                        const isSelected = selected.includes(doc.id);
                                        return (
                                            <button
                                                key={doc.id}
                                                onClick={() => toggleSelection(doc.id)}
                                                className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left transition-colors duration-200 ${isSelected ? "bg-white/[0.03]" : "hover:bg-white/[0.01]"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-200 ${isSelected
                                                        ? "bg-white/[0.06] border-white/10 text-white/70"
                                                        : "bg-transparent border-white/5 text-white/20"
                                                        }`}>
                                                        <FileText className="size-4" />
                                                    </div>
                                                    <div>
                                                        <div className={`text-sm transition-colors duration-200 ${isSelected ? "text-white font-medium" : "text-white/60"}`}>
                                                            {doc.title}
                                                        </div>
                                                        <div className="text-[11px] text-white/20 mt-0.5 font-mono">{doc.meta}</div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    {doc.updatedAt ? (
                                                        <span className="hidden sm:inline text-[10px] text-white/20 font-mono tracking-wider">
                                                            {doc.updatedAt}
                                                        </span>
                                                    ) : null}

                                                    <div
                                                        className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200 ${isSelected
                                                            ? "bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white"
                                                            : "bg-transparent border-white/10 text-transparent"
                                                            }`}
                                                    >
                                                        <Check className="size-3 stroke-[3]" />
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            {/* Bottom Action Bar */}
                            <div className="border-t border-white/5 p-4 flex justify-end">
                                <button
                                    onClick={handleGenerate}
                                    disabled={selectedCount === 0 || isGenerating || documentsLoading || documents.length === 0 || !!documentsError}
                                    className={`luminous-btn h-10 px-6 flex items-center justify-center gap-2 text-sm transition-all duration-300 ${selectedCount === 0 || documentsLoading || documents.length === 0 || !!documentsError ? "opacity-30 grayscale cursor-not-allowed" : ""
                                        }`}
                                >
                                    {isGenerating ? (
                                        <Sparkles className="size-3.5 animate-spin" />
                                    ) : (
                                        <Wand2 className="size-3.5" />
                                    )}
                                    <span>{isGenerating ? "Processing..." : "Generate Deck"}</span>
                                </button>
                            </div>
                        </motion.section>
                    ) : (
                        <motion.div
                            key="decks"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full"
                        >
                            {sortedDecks.length === 0 ? (
                                <div className="col-span-full rounded-2xl border border-white/5 bg-[#121215]/40 p-10 text-center text-sm text-white/40">
                                    No decks yet. Generate flashcards from your notes to save a deck.
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
                                            className="group relative flex flex-col justify-between p-6 rounded-2xl border border-white/5 bg-[#121215]/40 hover:bg-[#121215]/80 hover:border-white/10 transition-all duration-300 backdrop-blur-sm"
                                        >
                                            <div>
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]">
                                                        <Layers className="size-5" />
                                                    </div>
                                                    <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-full">
                                                        {cardLabel}
                                                    </div>
                                                </div>

                                                <h3 className="text-lg font-medium text-white mb-1 group-hover:text-[hsl(var(--accent))] transition-colors">
                                                    {deck.title}
                                                </h3>

                                                <div className="flex flex-wrap items-center gap-3 text-xs text-white/40 mb-6">
                                                    <span className="flex items-center gap-1.5">
                                                        <Clock className="size-3" />
                                                        {timeLabel}
                                                    </span>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>{notesLabel}</span>
                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                    <span>{masteryLabel}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                                                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mr-4">
                                                    <div
                                                        className="h-full bg-[hsl(var(--accent))] opacity-60 rounded-full"
                                                        style={{ width: `${masteryValue}%` }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => handleStudyDeck(deck)}
                                                    className="flex items-center gap-2 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-300"
                                                >
                                                    Study <ArrowRight className="size-3" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
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
