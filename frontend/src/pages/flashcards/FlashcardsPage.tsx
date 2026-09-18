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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
            Flashcards
          </h1>
          <p className="text-[#5C635D]">AI-generated flashcards for quick review</p>
        </div>
        <Button variant="ghost" size="sm" as={Link} to="/dashboard">
          Back to dashboard
        </Button>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F2E3D6] rounded-full flex items-center justify-center">
              <Layers className="text-[#C4612F]" size={20} />
            </div>
            <div>
              <h3 className="font-medium text-[#1F2421]">Module flashcards</h3>
              <p className="text-sm text-[#5C635D]">Tap a card to flip it.</p>
            </div>
          </div>
          <Button onClick={handleGenerate} loading={isPending} variant="outline">
            <RefreshCw size={16} />
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {generatedCards.map((card: any) => (
            <button
              key={card.id}
              onClick={() => toggleFlip(card.id)}
              className="text-left bg-[#FFFFFF] border border-[#E7E1D7] rounded-xl p-6 hover:shadow-md transition-all min-h-[160px]"
            >
              {flipped[card.id] ? (
                <div>
                  <p className="text-xs text-[#A94E22] dark:text-[#e8a06f] mb-2">Answer</p>
                  <p className="text-[#1F2421]">{card.back}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-[#A94E22] dark:text-[#e8a06f] mb-2">Question</p>
                  <p className="text-[#1F2421]">{card.front}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
