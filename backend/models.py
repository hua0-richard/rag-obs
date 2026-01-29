from sqlalchemy import Column, Integer, String, Text, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base
from pgvector.sqlalchemy import Vector

Base = declarative_base()
VECTOR_DIM = 384

class Sessions(Base):
    __tablename__ = "sessionss"
    id = Column(Integer, primary_key=True)

class Notes(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("sessions.id"), ondelete="CASCADE", onupdate="CASCADE", nullable=False)
    
class Embeddings(Base):
    __tablename__ = "embeddings"
    id = Column(Integer, primary_key=True, index=True)
    notes_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)

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
    