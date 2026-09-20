import React from 'react';

interface BadgeProps {
  variant?: 'default' | 'urgent' | 'emergency' | 'success' | 'warning' | 'neutral';
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, icon, className = '' }: BadgeProps) {
  const styles = {
    default: 'bg-teal-50 text-teal-800 border-teal-200',
    urgent: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold',
    emergency: 'bg-red-100 text-red-900 border-red-300 font-bold animate-pulse-urgent',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${styles[variant]} ${className}`}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'emergency' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  isLoading,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3.5 text-base gap-2.5 font-semibold',
  };

  const variants = {
    primary: 'bg-teal-700 hover:bg-teal-800 text-white shadow-sm focus:ring-teal-600',
    secondary: 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm focus:ring-slate-700',
    emergency: 'bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg focus:ring-red-600 font-bold',
    outline: 'border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 focus:ring-teal-500',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 focus:ring-slate-300',
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
