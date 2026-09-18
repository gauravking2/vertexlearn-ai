import { useState } from 'react';
import { useCourses } from '@/hooks/useCourses';
import { Card } from '@/components/common/Card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { Link } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { CourseFilters } from '@/types';

export const CourseCatalog = () => {
  const [filters, setFilters] = useState<CourseFilters>({
    search: '',
    category: '',
    difficulty: '',
    minRating: 0,
    page: 1,
    limit: 12,
  });

  const { data, isLoading } = useCourses(filters);

  const categories = ['Programming', 'Design', 'Business', 'Data Science', 'Marketing'];
  const difficulties = ['Beginner', 'Intermediate', 'Advanced'];
  const ratingOptions = [0, 3, 4, 4.5];

  const handleSearchChange = (value: string) => {
    setFilters((prev) => ({ ...prev, search: value, page: 1 }));
  };

  const handleCategoryFilter = (category: string) => {
    setFilters((prev) => ({
      ...prev,
      category: prev.category === category ? '' : category,
      page: 1,
    }));
  };

  const handleDifficultyFilter = (difficulty: string) => {
    setFilters((prev) => ({
      ...prev,
      difficulty: prev.difficulty === difficulty ? '' : difficulty,
      page: 1,
    }));
  };

  const handleRatingFilter = (minRating: number) => {
    setFilters((prev) => ({ ...prev, minRating, page: 1 }));
  };

  if (isLoading) {
    return <LoadingSpinner text="Loading courses..." />;
  }

  const courses = data?.courses || [];
  const totalPages = data?.totalPages || 1;
  // Phase 6: category/difficulty/minRating are real server-side filters
  // (migration 005 + aggregated course_reviews). The list endpoint returns
  // category/difficulty/avg_rating/rating_count per course.
  const visibleCourses = courses;

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C635D]" size={18} />
            <input
              type="text"
              placeholder="Search courses..."
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#FBF9F5] border border-[#E7E1D7] rounded-lg text-[#1F2421] placeholder:text-[#5C635D] focus:outline-none focus:ring-2 focus:ring-[#C4612F] focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-2">Category</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryFilter(category)}
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
            <p className="text-sm font-medium text-[#1F2421] mb-2">Difficulty</p>
            <div className="flex flex-wrap gap-2">
              {difficulties.map((difficulty) => (
                <button
                  key={difficulty}
                  onClick={() => handleDifficultyFilter(difficulty)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    filters.difficulty === difficulty
                      ? 'bg-[#A94E22] text-white'
                      : 'bg-[#FBF9F5] text-[#5C635D] hover:bg-[#F2E3D6]'
                  }`}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>

          {/* Rating Filter (real aggregated review data) */}
          <div>
            <p className="text-sm font-medium text-[#1F2421] mb-2">Minimum rating</p>
            <div className="flex flex-wrap gap-2">
              {ratingOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => handleRatingFilter(r)}
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
        <p className="text-sm text-[#5C635D]">
          {data?.total || 0} course{data?.total !== 1 ? 's' : ''} found
        </p>
        {(filters.category || filters.difficulty || filters.search || (filters.minRating ?? 0) > 0) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFilters({ search: '', category: '', difficulty: '', minRating: 0, page: 1, limit: 12 })}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Course Grid */}
      {visibleCourses.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {visibleCourses.map((course) => (
              <Card key={course.id} hover>
                <Link to={`/courses/${course.id}`}>
                  {course.thumbnailUrl && (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="w-full h-48 object-cover rounded-lg mb-4"
                    />
                  )}
                  <h3 className="text-lg font-serif text-[#1F2421] mb-2">{course.title}</h3>
                  <p className="text-sm text-[#5C635D] mb-4 line-clamp-2">
                    {course.description}
                  </p>
                  <div className="flex items-center gap-2 mb-3">
                    {course.category && <Badge variant="neutral">{course.category}</Badge>}
                    {course.difficulty && (
                      <Badge variant="primary">{course.difficulty}</Badge>
                    )}
                    {typeof course.avg_rating === 'number' && (course.rating_count ?? 0) > 0 && (
                      <span className="text-xs text-[#5C635D]">
                        ★ {course.avg_rating.toFixed(1)} ({course.rating_count})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm text-[#5C635D]">
                    <span>{course.enrollmentCount || 0} enrolled</span>
                    {course.instructor && <span>by {course.instructor.name}</span>}
                  </div>
                </Link>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={filters.page === 1}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
              >
                Previous
              </Button>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setFilters((prev) => ({ ...prev, page }))}
                    className={`w-8 h-8 rounded-lg text-sm transition-all ${
                      filters.page === page
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
                disabled={filters.page === totalPages}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          description="Try adjusting your search or filters"
        />
      )}
    </div>
  );
};
