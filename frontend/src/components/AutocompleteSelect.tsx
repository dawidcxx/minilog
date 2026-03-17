import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type AutocompleteSelectProps = {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function AutocompleteSelect(props: AutocompleteSelectProps) {
  const { value, options, onChange, placeholder = "", disabled = false, className = "" } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (!wrapperRef.current?.contains(target)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, []);

  const visibleOptions = useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((option) => option.toLowerCase().includes(trimmed));
  }, [inputValue, options]);

  function scrollToIndex(index: number) {
    const li = listRef.current?.children[index] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }

  function commitSelection(next: string) {
    setInputValue(next);
    onChange(next);
    setIsOpen(false);
    setFocusedIndex(-1);
  }

  function clearSelection() {
    setInputValue("");
    onChange("");
    setIsOpen(false);
    setFocusedIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setFocusedIndex(visibleOptions.length > 0 ? 0 : -1);
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        if (visibleOptions.length === 0) return;
        event.preventDefault();
        const next = (focusedIndex + 1 + visibleOptions.length) % visibleOptions.length;
        setFocusedIndex(next);
        queueMicrotask(() => scrollToIndex(next));
        break;
      }
      case "ArrowUp": {
        if (visibleOptions.length === 0) return;
        event.preventDefault();
        const next = (focusedIndex - 1 + visibleOptions.length) % visibleOptions.length;
        setFocusedIndex(next);
        queueMicrotask(() => scrollToIndex(next));
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (focusedIndex >= 0 && visibleOptions[focusedIndex]) {
          commitSelection(visibleOptions[focusedIndex]);
          return;
        }
        commitSelection(inputValue.trim());
        break;
      }
      case "Escape": {
        setIsOpen(false);
        setFocusedIndex(-1);
        setInputValue(value);
        break;
      }
    }
  }

  return (
    <div className={`relative mt-1 ${isOpen ? "z-30" : "z-0"} ${className}`} ref={wrapperRef}>
      <input
        type="text"
        disabled={disabled}
        value={inputValue}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setIsOpen(true);
          setFocusedIndex(-1);
        }}
        onBlur={() => {
          onChange(inputValue.trim());
        }}
        onInput={(event) => {
          const next = (event.target as HTMLInputElement).value;
          setInputValue(next);
          onChange(next);
          setIsOpen(true);
          setFocusedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-16 text-sm text-zinc-100 outline-none transition focus:border-sky-500 disabled:opacity-60"
      />

      {inputValue && !disabled && (
        <button
          type="button"
          onClick={clearSelection}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition hover:text-zinc-200"
          aria-label="Clear selection"
        >
          <X size={14} />
        </button>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition hover:text-zinc-200 disabled:opacity-60"
        aria-label="Toggle options"
      >
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
          onMouseDown={(event) => {
            event.preventDefault();
            const li = (event.target as HTMLElement).closest("li");
            const rawIndex = li?.getAttribute("data-index");
            if (!rawIndex) return;
            const index = Number(rawIndex);
            if (Number.isNaN(index) || !visibleOptions[index]) return;
            commitSelection(visibleOptions[index]);
          }}
          onMouseMove={(event) => {
            const li = (event.target as HTMLElement).closest("li");
            const rawIndex = li?.getAttribute("data-index");
            if (!rawIndex) return;
            const index = Number(rawIndex);
            if (!Number.isNaN(index) && index !== focusedIndex) {
              setFocusedIndex(index);
            }
          }}
        >
          {visibleOptions.length > 0 ? (
            visibleOptions.map((option, index) => (
              <li
                key={option}
                data-index={index}
                className={`cursor-pointer px-3 py-2 text-sm ${focusedIndex === index ? "bg-sky-900/40 text-zinc-100" : "text-zinc-300"}`}
              >
                {option}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-zinc-500">No matching services</li>
          )}
        </ul>
      )}
    </div>
  );
}
