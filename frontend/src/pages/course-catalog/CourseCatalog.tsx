import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCourses } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Link } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { CourseFilters } from '@/types';
import { categoryCover, categoryInitial, displayPercent, safePercent } from '@/utils/model';

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

  if (isLoading) {
    return <LoadingSpinner text="Loading courses..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] mb-2">
          Course <span className="italic text-[#C4612F]">Catalog</span>
        </h1>
        <p className="text-[#5C635D]">Discover courses to advance your skills</p>
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C635D]" size={18} aria-hidden="true" />
            <label htmlFor="catalog-search" className="sr-only">Search courses</label>
            <input
              id="catalog-search"
              type="text"
              placeholder="Search courses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#FBF9F5] border border-[#E7E1D7] rounded-lg text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-2" id="filter-category-label">Category</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="filter-category-label">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setFilter({ category: filters.category === category ? undefined : category })}
                  aria-pressed={filters.category === category}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    filters.category === category
                      ? 'bg-[#A94E22] text-white'
                      : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Filter */}
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-2" id="filter-difficulty-label">Difficulty</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="filter-difficulty-label">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setFilter({ difficulty: filters.difficulty === d.value ? undefined : (d.value as CourseFilters['difficulty']) })}
                  aria-pressed={filters.difficulty === d.value}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    filters.difficulty === d.value
                      ? 'bg-[#A94E22] text-white'
                      : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating Filter (real aggregated review data) */}
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-2" id="filter-rating-label">Minimum rating</p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="filter-rating-label">
              {RATING_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setFilter({ minRating: r === 0 ? undefined : r })}
                  aria-pressed={(filters.minRating ?? 0) === r}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    (filters.minRating ?? 0) === r
                      ? 'bg-[#A94E22] text-white'
                      : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
                  }`}
                >
                  {r === 0 ? 'Any' : `${r}+`}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#5C635D] mt-2">
              Ratings come from real student reviews of each course.
            </p>
          </div>
        </div>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5C635D]" role="status">
          {total} course{total !== 1 ? 's' : ''} found{isFetching && !isLoading ? ' — updating…' : ''}
        </p>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Course Grid */}
      {isError ? (
        <Card>
          <p className="text-sm text-red-700 mb-2" role="alert">
            {(error as any)?.response?.data?.message ?? 'Unable to load courses. Try again.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      ) : courses.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {courses.map((course: any) => {
              const id = course?.id;
              if (!id) return null;
              const rating = Number(course.avgRating ?? 0);
              const ratingCount = Number(course.ratingCount ?? 0);
              return (
                <Card key={id} hover className="overflow-hidden !p-0">
                  <Link to={`/courses/${id}`} aria-label={`Open ${course.title}`}>
                    <div
                      className="h-36 flex items-end p-4"
                      style={{ background: categoryCover(course.category) }}
                      role="img"
                      aria-label={`${course.category || 'Course'} cover`}
                    >
                      <span className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-2xl font-serif text-white border border-white/20">
                        {categoryInitial(course.title)}
                      </span>
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        {course.category && <Badge variant="neutral">{course.category}</Badge>}
                        {course.difficulty && (
                          <Badge variant="primary">{String(course.difficulty).charAt(0).toUpperCase() + String(course.difficulty).slice(1)}</Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-serif text-[#1F2421] mb-1">{course.title}</h3>
                      <p className="text-sm text-[#5C635D] mb-3 line-clamp-2">
                        {course.description || 'No description yet.'}
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#5C635D]">
                          {ratingCount > 0 ? `★ ${rating.toFixed(1)} (${ratingCount})` : 'No ratings yet'}
                        </span>
                        <span className="text-[#5C635D]">{course.enrollmentCount || 0} enrolled</span>
                      </div>
                      {typeof course.progress === 'number' && (
                        <div className="mt-3">
                          <div className="w-full bg-[#FBF9F5] rounded-full overflow-hidden h-1.5">
                            <div
                              className="h-full bg-gradient-to-r from-[#C4612F] to-[#A94E22]"
                              style={{ width: `${safePercent(course.progress)}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#5C635D] mt-1">{displayPercent(course.progress)} complete</p>
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
                        ? 'bg-[#A94E22] text-white'
                        : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
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
          <EmptyState
            icon={BookOpen}
            title={hasActiveFilters ? 'No courses match these filters' : 'No courses found'}
            description={
              hasActiveFilters
                ? 'Try widening the rating, removing a category, or clearing the search.'
                : 'Check back soon — new courses are published regularly.'
            }
          />
        )
      )}
    </div>
  );
};
