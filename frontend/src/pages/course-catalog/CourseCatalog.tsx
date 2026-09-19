import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCourses } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Link } from 'react-router-dom';
import { BookOpen, Search, Star, Users, X } from 'lucide-react';
import { CourseFilters } from '@/types';
import { categoryCover, displayPercent, safePercent } from '@/utils/model';
import { SkeletonCards } from '@/components/common/Skeleton';

// Display labels map 1:1 to backend category values (exact match server-side).
const CATEGORIES = ['Programming', 'Design', 'Business', 'Data Science', 'Marketing'];
const DIFFICULTIES = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];
const RATING_OPTIONS = [0, 3, 4, 4.5];

function filtersFromSearch(search: URLSearchParams): CourseFilters {
  const minRating = Number(search.get('minRating') ?? 0);
  return {
    page: Math.max(1, Number(search.get('page') ?? 1) || 1),
    pageSize: 12,
    q: search.get('q') || undefined,
    category: search.get('category') || undefined,
    difficulty: search.get('difficulty') || undefined,
    minRating: Number.isFinite(minRating) && minRating > 0 ? minRating : undefined,
  };
}

export const CourseCatalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // Single filter state model, mirrored to the URL query string.
  const [filters, setFilters] = useState<CourseFilters>(() => filtersFromSearch(searchParams));
  const [searchInput, setSearchInput] = useState(filters.q ?? '');

  // Keep URL in sync (shareable links, back/forward navigation).
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.q) next.set('q', filters.q);
    if (filters.category) next.set('category', filters.category);
    if (filters.difficulty) next.set('difficulty', String(filters.difficulty));
    if (filters.minRating) next.set('minRating', String(filters.minRating));
    if ((filters.page ?? 1) > 1) next.set('page', String(filters.page));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Debounce search typing so each keystroke is not a request + URL rewrite.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => (prev.q !== (searchInput || undefined) ? { ...prev, q: searchInput || undefined, page: 1 } : prev));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, error, refetch } = useCourses(filters);

  const courses = useMemo(() => data?.courses ?? data?.data ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const hasActiveFilters = !!(filters.q || filters.category || filters.difficulty || filters.minRating);
  // "0 courses" is only real once loading settles; while fetching we keep the
  // previous list visible with a subtle indicator instead of flashing empty.
  const showEmpty = !isLoading && !isError && courses.length === 0;

  const setFilter = (patch: Partial<CourseFilters>) => setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  const clearFilters = () => {
    setSearchInput('');
    setFilters({ page: 1, pageSize: 12 });
  };

  const chipBase = 'px-3.5 py-1.5 rounded-full text-sm transition-all duration-200 ring-1 ring-inset';
  const chipOff = `${chipBase} bg-[#FBF9F5] dark:bg-[#23261f] text-[#5C635D] dark:text-[#b9beb4] ring-[#E7E1D7] dark:ring-[#2c2f2a] hover:bg-[#F2E3D6] dark:hover:bg-[#2c241c] hover:text-[#8A3E1C] dark:hover:text-[#e8a06f] hover:ring-[#C4612F]/30`;
  const chipOn = `${chipBase} bg-[#A94E22] text-white ring-[#A94E22] shadow-sm dark:bg-[#d3723f] dark:ring-[#d3723f] dark:text-[#14110c] font-medium`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Search */}
      <div className="relative">
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Course <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Catalog</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Discover courses to advance your skills</p>
      </div>

      {/* Search and Filters */}
      <Card variant="elevated" className="p-5 sm:p-6">
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5C635D] dark:text-[#b9beb4]" size={18} aria-hidden="true" />
            <label htmlFor="catalog-search" className="sr-only">Search courses</label>
            <input
              id="catalog-search"
              type="text"
              placeholder="Search courses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-xl text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] hover:border-[#C4612F]/40 focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all"
            />
          </div>

          {/* Category Filter */}
          <div>
            <p className="vl-eyebrow text-[#5C635D] dark:text-[#b9beb4] mb-2" id="filter-category-label">Category</p>
            <div className="flex flex-wrap gap-2 max-w-full" role="group" aria-labelledby="filter-category-label">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setFilter({ category: filters.category === category ? undefined : category })}
                  aria-pressed={filters.category === category}
                  className={filters.category === category ? chipOn : chipOff}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Filter */}
          <div>
            <p className="vl-eyebrow text-[#5C635D] dark:text-[#b9beb4] mb-2" id="filter-difficulty-label">Difficulty</p>
            <div className="flex flex-wrap gap-2 max-w-full" role="group" aria-labelledby="filter-difficulty-label">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setFilter({ difficulty: filters.difficulty === d.value ? undefined : (d.value as CourseFilters['difficulty']) })}
                  aria-pressed={filters.difficulty === d.value}
                  className={filters.difficulty === d.value ? chipOn : chipOff}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating Filter (real aggregated review data) */}
          <div>
            <p className="vl-eyebrow text-[#5C635D] dark:text-[#b9beb4] mb-2" id="filter-rating-label">Minimum rating</p>
            <div className="flex flex-wrap gap-2 max-w-full" role="group" aria-labelledby="filter-rating-label">
              {RATING_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setFilter({ minRating: r === 0 ? undefined : r })}
                  aria-pressed={(filters.minRating ?? 0) === r}
                  className={(filters.minRating ?? 0) === r ? chipOn : chipOff}
                >
                  {r === 0 ? 'Any' : `${r}+`}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-2">
              Ratings come from real student reviews of each course.
            </p>
          </div>
        </div>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]" role="status">
          {total} course{total !== 1 ? 's' : ''} found{isFetching && !isLoading ? ' — updating…' : ''}
        </p>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X size={14} /> Clear filters
          </Button>
        )}
      </div>

      {/* Course Grid */}
      {isError ? (
        <Card>
          <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">
            {(error as any)?.response?.data?.message ?? 'Unable to load courses. Try again.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      ) : courses.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 vl-stagger">
            {courses.map((course: any) => {
              const id = course?.id;
              if (!id) return null;
              const rating = Number(course.avgRating ?? 0);
              const ratingCount = Number(course.ratingCount ?? 0);
              return (
                <Card key={id} hover variant="elevated" className="overflow-hidden !p-0">
                  <Link to={`/courses/${id}`} aria-label={`Open ${course.title}`} className="flex flex-col h-full">
                    <div
                      className="h-36 flex items-end p-4 relative"
                      style={{ background: categoryCover(course.category) }}
                      role="img"
                      aria-label={`${course.category || 'Course'} cover`}
                    >
                      <div className="absolute inset-0 opacity-30" aria-hidden="true" style={{ background: 'radial-gradient(240px 100px at 85% 10%, rgba(255,255,255,0.35), transparent)' }} />
                      {course.category && (
                        <span className="relative px-2.5 py-1 rounded-full bg-[#1F2421]/60 text-white text-xs font-medium ring-1 ring-inset ring-white/20">
                          {course.category}
                        </span>
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {course.difficulty && (
                          <Badge variant="primary">{String(course.difficulty).charAt(0).toUpperCase() + String(course.difficulty).slice(1)}</Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-1 leading-snug">{course.title}</h3>
                      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-4 line-clamp-2 flex-1">
                        {course.description || 'No description yet.'}
                      </p>
                      <div className="flex items-center justify-between text-sm pt-3 border-t border-[#E7E1D7]/80 dark:border-[#2c2f2a]">
                        <span className="inline-flex items-center gap-1.5 text-[#5C635D] dark:text-[#b9beb4]">
                          <Star size={13} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
                          {ratingCount > 0 ? `${rating.toFixed(1)} (${ratingCount})` : 'No ratings yet'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[#5C635D] dark:text-[#b9beb4]">
                          <Users size={13} aria-hidden="true" />
                          {course.enrollmentCount || 0} enrolled
                        </span>
                      </div>
                      {typeof course.progress === 'number' && (
                        <div className="mt-3">
                          <div className="w-full bg-[#FBF9F5] dark:bg-[#23261f] rounded-full overflow-hidden h-1.5 ring-1 ring-inset ring-[#E7E1D7]/60 dark:ring-[#2c2f2a]">
                            <div
                              className="h-full bg-gradient-to-r from-[#C4612F] to-[#A94E22] rounded-full"
                              style={{ width: `${safePercent(course.progress)}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] mt-1">{displayPercent(course.progress)} complete</p>
                        </div>
                      )}
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex justify-center gap-2" aria-label="Catalog pages">
              <Button
                size="sm"
                variant="outline"
                disabled={(filters.page ?? 1) === 1}
                onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) - 1 }))}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setFilters((prev) => ({ ...prev, page }))}
                    aria-label={`Page ${page}`}
                    aria-current={(filters.page ?? 1) === page ? 'page' : undefined}
                    className={`w-8 h-8 rounded-lg text-sm transition-all ${
                      (filters.page ?? 1) === page
                        ? 'bg-[#A94E22] text-white shadow-sm dark:bg-[#d3723f] dark:text-[#14110c] font-medium'
                        : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6] dark:bg-[#23261f] dark:text-[#b9beb4] dark:hover:bg-[#2c241c]'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={(filters.page ?? 1) === totalPages}
                onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      ) : (
        showEmpty && (
          <Card>
            <EmptyState
              icon={BookOpen}
              title={hasActiveFilters ? 'No courses match these filters' : 'No courses found'}
              description={
                hasActiveFilters
                  ? 'Try widening the rating, removing a category, or clearing the search.'
                  : 'Check back soon — new courses are published regularly.'
              }
            />
          </Card>
        )
      )}
    </div>
  );
};
