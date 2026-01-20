import { AmbientBackground } from './components/demo/AmbientBackground';
import { HeroSection } from './components/demo/HeroSection';


function App() {
  return (
    <main className="relative min-h-screen w-full overflow-x-hidden selection:bg-[hsl(var(--accent))/30] selection:text-white">
      <AmbientBackground />
      <HeroSection />
    </main>
  )
}

export default App
