from sqlalchemy import Column, Integer, String, Text, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base
from pgvector.sqlalchemy import Vector

Base = declarative_base()

VECTOR_DIM = 384

class Sessions(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    token_usage = Column(Integer)

class Files(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    session_id = Column(
        Integer,
        ForeignKey("sessions.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )

# Consider Partial Indexing for Speedup    
class Embeddings(Base):
    __tablename__ = "embeddings"
    id = Column(Integer, primary_key=True, index=True)
    files_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)

    filename = Column(String(512), nullable=False)
    content_type = Column(String(255), nullable=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(VECTOR_DIM), nullable=False)

class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(512), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)

class FlashcardDecks(Base):
    __tablename__ = "flashcard_decks"
    id = Column(Integer, primary_key=True, index=True)
