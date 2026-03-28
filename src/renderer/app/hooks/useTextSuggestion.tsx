// useAutoComplete.ts
import { useState, useCallback } from 'react';

export interface Suggestion {
  text: string; // The text of the suggestion
  trigger: string; // The trigger word or phrase that leads to this suggestion
}

interface UseTextSuggestionProps {
  triggerMap: { [key: string]: string };
}

export const useTextSuggestion = ({ triggerMap }: UseTextSuggestionProps) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  const handleInputChange = useCallback(
    (newValue: string) => {
      setInputValue(newValue);

      for (const trigger in triggerMap) {
        const minLength = 5;
        for (let len = minLength; len < trigger.length; len++) {
          if (newValue.endsWith(trigger.slice(0, len))) {
            setSuggestion({
              text: triggerMap[trigger].slice(len, triggerMap[trigger].length),
              trigger
            });
            return;
          }
        }
      }
      setSuggestion(null);
    },
    [triggerMap]
  );

  return {
    inputValue,
    suggestion,
    handleInputChange
  };
};
