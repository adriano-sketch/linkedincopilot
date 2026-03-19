import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface LocationAutocompleteProps {
  selected: string[];
  onAdd: (location: string) => void;
  onRemove: (location: string) => void;
}

export default function LocationAutocomplete({ selected, onAdd, onRemove }: LocationAutocompleteProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('location-typeahead', {
        body: { query: query.trim() },
      });
      if (!error && data?.suggestions) {
        setSuggestions(data.suggestions.filter((s: string) => !selected.includes(s)));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const handleInputChange = (value: string) => {
    setInput(value);
    setShowSuggestions(true);
    setHighlightIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const addLocation = (loc: string) => {
    if (loc && !selected.includes(loc)) {
      onAdd(loc);
    }
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        addLocation(suggestions[highlightIndex]);
      } else if (input.trim()) {
        addLocation(input.trim());
      }
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          placeholder="Type a city, state or country..."
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((loc, i) => (
            <button
              key={loc}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors ${i === highlightIndex ? 'bg-accent text-accent-foreground' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); addLocation(loc); }}
            >
              {loc}
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selected.map(loc => (
            <Badge key={loc} variant="secondary" className="gap-1 pr-1">
              {loc}
              <button onClick={() => onRemove(loc)}><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
