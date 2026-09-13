import * as Progress from "@radix-ui/react-progress";
export function ProgressMeter({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <Progress.Root
      className="progress-meter"
      value={value}
      max={100}
      aria-label={label}
    >
      <Progress.Indicator
        className="progress-meter-fill"
        style={{
          transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)`,
        }}
      />
    </Progress.Root>
  );
}
