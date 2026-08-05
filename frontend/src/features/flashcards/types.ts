export type ApiFlashcard = {
    id: number;
    filename: string;
    question: string;
    answer: string;
};

export type ApiFile = {
    id: number;
    filename: string | null;
    content_type: string | null;
    size_bytes: number | null;
};

export type ApiDeck = {
    id: number;
    session_id: number;
    title: string;
    source_label?: string | null;
    source?: { id?: number | null; filename?: string | null }[];
    created_at?: string | null;
    card_count?: number | null;
    note_count?: number | null;
};
