import { useParams, Link } from 'react-router-dom';
import { useGenerateFlashcards } from '@/hooks/useAI';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Layers, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export const FlashcardsPage = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { mutate: generate, isPending, data } = useGenerateFlashcards();
  const [cards, setCards] = useState<any[]>([]);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const handleGenerate = () => {
    if (moduleId) {
      generate(moduleId, { onSuccess: (d) => setCards(d.data ?? []) });
    }
  };

  const toggleFlip = (id: string) => setFlipped((prev) => ({ ...prev, [id]: !prev[id] }));
  const generatedCards = cards.length > 0 ? cards : data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
            Flashcards
          </h1>
          <p className="text-[#5C635D] dark:text-[#b9beb4]">AI-generated flashcards for quick review</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to="/dashboard">
          Back to dashboard
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7]/80 dark:ring-[#2c2f2a] flex items-center justify-center" aria-hidden="true">
              <Layers className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
            </div>
            <div>
              <h3 className="font-medium text-[#1F2421] dark:text-[#ece9e2]">Module flashcards</h3>
              <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Tap a card to flip it.</p>
            </div>
          </div>
          <Button onClick={handleGenerate} loading={isPending} variant="outline">
            <RefreshCw size={16} aria-hidden="true" />
            {generatedCards.length > 0 ? 'Regenerate' : 'Generate'}
          </Button>
        </div>
      </Card>

      {isPending && <LoadingSpinner text="Generating flashcards..." />}

      {!isPending && generatedCards.length === 0 && (
        <Card>
          <EmptyState
            icon={Layers}
            title="No flashcards yet"
            description="Generate flashcards from the indexed lecture content for this module."
          />
        </Card>
      )}

      {generatedCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 vl-stagger">
          {generatedCards.map((card: any) => (
            <button
              key={card.id}
              onClick={() => toggleFlip(card.id)}
              aria-pressed={!!flipped[card.id]}
              className="text-left bg-[#FFFFFF] dark:bg-[#1a1d17] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-2xl p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all min-h-[160px] flex flex-col"
            >
              <p className="vl-eyebrow text-[#C4612F] dark:text-[#e8a06f] mb-2">
                {flipped[card.id] ? 'Answer' : 'Question'}
              </p>
              <p className="text-[#1F2421] dark:text-[#ece9e2] leading-relaxed">{flipped[card.id] ? card.back : card.front}</p>
              <span className="mt-auto pt-3 text-xs text-[#5C635D] dark:text-[#b9beb4]">Tap to flip</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
