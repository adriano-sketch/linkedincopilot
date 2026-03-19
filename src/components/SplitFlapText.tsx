import React, { useEffect, useState, useRef } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-\' ';

interface SplitFlapCharProps {
  targetChar: string;
  delay: number;
  duration: number;
}

const SplitFlapChar: React.FC<SplitFlapCharProps> = ({ targetChar, delay, duration }) => {
  const [currentChar, setCurrentChar] = useState(' ');
  const [isFlipping, setIsFlipping] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const target = targetChar.toUpperCase();
    if (target === ' ') {
      setCurrentChar(' ');
      return;
    }

    const startTimeout = setTimeout(() => {
      let iterations = 0;
      const maxIterations = Math.floor(duration / 40);

      intervalRef.current = setInterval(() => {
        iterations++;
        setIsFlipping(true);

        if (iterations >= maxIterations) {
          setCurrentChar(target);
          setIsFlipping(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          return;
        }

        // Pick a random char, cycling through
        const randomIdx = Math.floor(Math.random() * CHARS.length);
        setCurrentChar(CHARS[randomIdx]);

        // Brief flip reset
        setTimeout(() => setIsFlipping(false), 20);
      }, 40);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetChar, delay, duration]);

  return (
    <span
      className={`inline-block relative ${isFlipping ? 'split-flap-flip' : ''}`}
      style={{
        width: currentChar === ' ' ? '0.25em' : undefined,
      }}
    >
      {currentChar}
    </span>
  );
};

interface SplitFlapLineProps {
  text: string;
  baseDelay: number;
  className?: string;
}

const SplitFlapLine: React.FC<SplitFlapLineProps> = ({ text, baseDelay, className }) => {
  const chars = text.split('');

  return (
    <span className={className}>
      {chars.map((char, i) => (
        <SplitFlapChar
          key={`${i}-${char}`}
          targetChar={char}
          delay={baseDelay + i * 35}
          duration={300 + Math.random() * 200}
        />
      ))}
    </span>
  );
};

interface SplitFlapTextProps {
  lines: { text: string; className?: string }[];
  className?: string;
  style?: React.CSSProperties;
}

const SplitFlapText: React.FC<SplitFlapTextProps> = ({ lines, className, style }) => {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (!started) {
    return (
      <div className={className} style={{ ...style, visibility: 'hidden' }}>
        {lines.map((line, i) => (
          <span key={i} className={line.className}>
            {line.text}
          </span>
        ))}
      </div>
    );
  }

  let charOffset = 0;
  return (
    <div className={className} style={style}>
      {lines.map((line, i) => {
        const baseDelay = charOffset * 35;
        charOffset += line.text.length;
        return (
          <SplitFlapLine
            key={i}
            text={line.text}
            baseDelay={baseDelay}
            className={line.className}
          />
        );
      })}
    </div>
  );
};

export default SplitFlapText;
