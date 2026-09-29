import { Search, X } from "lucide-react";
import { tr } from "../services/language";

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({
  value,
  onChange,
  placeholder = tr("Search cocktails…", "Cocktails suchen…"),
}: SearchBarProps) {
  return (
    <label className="search-bar">
      <Search aria-hidden="true" size={21} />
      <span className="sr-only">{placeholder.replace("…", "")}</span>
      <input
        aria-label={placeholder.replace("…", "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
      {value && (
        <button
          aria-label="Clear search"
          onClick={() => onChange("")}
          type="button"
        >
          <X size={18} />
        </button>
      )}
    </label>
  );
}
