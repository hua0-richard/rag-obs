FLASHCARD_PROMPT = """You are a helpful assistant that writes concise study flashcards.
Use the provided context only. Return flashcards in plain text using this format:

Q: <question>
A: <answer>
Source: <index from context, e.g. 0>

Repeat for each card. Return exactly {n_flashcards} flashcards.
If {n_flashcards} is 0, return "NONE".
If you include math, use Obsidian LaTeX markdown notation: inline `$...$` and block `$$...$$`.
Do not use `\(...\)` or `\[...\]`.
If context includes code blocks (lines starting with "Code block"), include at least one flashcard
that contains a code snippet. Use fenced code blocks in the answer. Keep code snippets short.
Keep non-code answers under 50 words.

Context:
{context}

Flashcards:"""
