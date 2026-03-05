import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { AmbientBackground } from '@/features/home/components/AmbientBackground';
import { HeroSection } from '@/features/home/components/HeroSection';
import { FlashcardsPage } from '@/features/flashcards/components/FlashcardsPage';
import { FlashcardsLabPage } from '@/features/flashcards/components/FlashcardsLabPage';

function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const sessionId = localStorage.getItem("session_id");
    if (!sessionId) {
      return;
    }

    let isActive = true;
    const validateSession = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.SERVER_URL}/files?session_id=${encodeURIComponent(sessionId)}`
        );
        if (!response.ok) {
          if (response.status === 404 || response.status === 422) {
            localStorage.removeItem("session_id");
          }
          return;
        }
        if (isActive) {
          navigate("/flashcards-lab", { replace: true });
        }
      } catch {
        // Ignore validation errors and keep the user on the landing page.
      }
    };

    validateSession();
    return () => {
      isActive = false;
    };
  }, [navigate]);

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden selection:bg-[hsl(var(--accent))/30] selection:text-white">
      <AmbientBackground />
      <HeroSection />
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/flashcards" element={<FlashcardsPage />} />
      <Route path="/flashcards-lab" element={<FlashcardsLabPage />} />
    </Routes>
  )
}

export default App
