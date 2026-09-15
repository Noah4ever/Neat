interface Option<T extends string | number> {
  label: string;
  value: T;
  disabled?: boolean;
}

interface SegmentedOptionGroupProps<T extends string | number> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedOptionGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedOptionGroupProps<T>) {
  return (
    <div aria-label={label} className="segmented-options" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
