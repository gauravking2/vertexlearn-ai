import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children correctly', () => {
    render(
      <Card>
        <div>Card content</div>
      </Card>
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Card className="custom-class">
        <div>Content</div>
      </Card>
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders with default styles', () => {
    const { container } = render(
      <Card>
        <div>Content</div>
      </Card>
    );
    expect(container.firstChild).toHaveClass('bg-[#FFFFFF]', 'rounded-xl', 'border');
  });
});
