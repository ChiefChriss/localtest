interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const Logo = ({ size = 'md', showText = true, className = '' }: LogoProps) => {
  const sizeClasses = {
    sm: { box: 'w-10 h-10', text: 'text-2xl' },
    md: { box: 'w-12 h-12', text: 'text-3xl' },
    lg: { box: 'w-14 h-14', text: 'text-4xl' },
    xl: { box: 'w-20 h-20', text: 'text-5xl' }
  };

  const textSizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* OM Symbol with gradient background */}
      <div 
        className={`${sizeClasses[size].box} rounded-xl bg-gradient-to-br from-purple-600 via-pink-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-900/30`}
      >
        {/* Unicode OM Symbol: ॐ */}
        <span className={`${sizeClasses[size].text} text-white font-bold leading-none`} style={{ fontFamily: 'serif' }}>
          ॐ
        </span>
      </div>
      
      {showText && (
        <span className={`${textSizeClasses[size]} font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400`}>
          Sonara
        </span>
      )}
    </div>
  );
};

export default Logo;
