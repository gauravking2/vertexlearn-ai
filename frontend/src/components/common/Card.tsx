import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hover?: boolean;
}

export const Card = ({ children, hover = false, className = '', ...props }: CardProps) => {
  return (
    <div
      className={`bg-[#FFFFFF] dark:bg-[#1a1d17] border border-[#E7E1D7] dark:border-[#2c2f2a] text-[#1F2421] dark:text-[#ece9e2] rounded-xl p-6 ${
        hover ? 'hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
