FLASHCARD_PROMPT = """You are a helpful assistant that writes concise study flashcards.
Use the provided context only. Return JSON array of objects with keys
`question`, `answer`, and `source_tag` (the bracketed number from context).
Return exactly {n_flashcards} flashcards. If {n_flashcards} is 0, return [].
Keep answers under 50 words.

Context:
{context}

Flashcards:"""
