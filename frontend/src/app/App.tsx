import { Navigate, Routes, Route } from 'react-router-dom';
import { AmbientBackground } from '@/features/home/components/AmbientBackground';
import { HeroSection } from '@/features/home/components/HeroSection';
import { FlashcardsPage } from '@/features/flashcards/components/FlashcardsPage';
import { FlashcardsLabPage } from '@/features/flashcards/components/FlashcardsLabPage';
import { loadDecks } from '@/features/flashcards/utils/flashcardDecks';

function RootRedirect() {
  const hasDecks = loadDecks().length > 0;
  return <Navigate to={hasDecks ? "/flashcards-lab" : "/upload"} replace />;
}

function UploadPage() {
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
      <Route path="/" element={<RootRedirect />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/flashcards" element={<FlashcardsPage />} />
      <Route path="/flashcards-lab" element={<FlashcardsLabPage />} />
    </Routes>
  )
}

export default App
