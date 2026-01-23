import { Routes, Route } from 'react-router-dom';
import { AmbientBackground } from './components/demo/AmbientBackground';
import { HeroSection } from './components/demo/HeroSection';
import { FlashcardsPage } from './components/flashcards/FlashcardsPage';
import { FlashcardsLabPage } from './components/flashcards/FlashcardsLabPage';

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
