import { Routes, Route } from 'react-router-dom';
import { AmbientBackground } from '@/features/home/components/AmbientBackground';
import { HeroSection } from '@/features/home/components/HeroSection';
import { FlashcardsPage } from '@/features/flashcards/components/FlashcardsPage';
import { FlashcardsLabPage } from '@/features/flashcards/components/FlashcardsLabPage';

function Home() {
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
