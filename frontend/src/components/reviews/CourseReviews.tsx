import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { courseService } from '@/services/courseService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Star } from 'lucide-react';

export const CourseReviews = ({ courseId, canReview }: { courseId: string; canReview: boolean }) => {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', courseId],
    queryFn: () => courseService.listReviews(courseId),
  });

  const submit = useMutation({
    mutationFn: () => courseService.submitReview(courseId, { rating, review }),
    onSuccess: () => {
      setReview('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['reviews', courseId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to submit review'),
  });

  const items = data?.data ?? [];
  const agg = data?.aggregate;

  return (
    <Card>
      <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-1 flex items-center gap-2">
        <Star size={16} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
        Student reviews
      </h3>
      {agg && agg.rating_count > 0 ? (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3">
          ★ {agg.avg_rating.toFixed(1)} average from {agg.rating_count} review{agg.rating_count === 1 ? '' : 's'}
        </p>
      ) : (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3">No reviews yet.</p>
      )}

      {canReview && (
        <div className="mb-4 border-b border-[#E7E1D7] dark:border-[#2c2f2a] pb-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2" role="alert">{error}</p>}
          <label className="block text-sm text-[#5C635D] dark:text-[#b9beb4] mb-1" htmlFor="review-rating">Your rating (1–5)</label>
          <select
            id="review-rating"
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-lg px-3 py-2 text-sm text-[#1F2421] dark:text-[#ece9e2] mb-2 focus:outline-none focus:ring-2 focus:ring-[#C4612F] transition-all cursor-pointer"
          >
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="What did you think of this course?"
            aria-label="Review text"
            className="w-full bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl px-3.5 py-2.5 text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all mb-2 resize-none"
            rows={2}
          />
          <Button size="sm" onClick={() => submit.mutate()} loading={submit.isPending}>Submit review</Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Loading reviews...</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="border-b border-[#E7E1D7] dark:border-[#2c2f2a] last:border-b-0 pb-3 last:pb-0">
              <p className="text-sm text-[#1F2421] dark:text-[#ece9e2] font-medium">
                <span className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true">★</span> {r.rating} — {r.reviewerName}
              </p>
              {r.review && <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mt-0.5">{r.review}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
