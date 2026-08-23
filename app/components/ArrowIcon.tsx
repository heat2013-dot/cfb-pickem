export default function ArrowIcon({
  direction,
  className,
}: {
  direction: "up" | "down";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
      style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M12 2.5 21.5 12a2 2 0 0 1-1.4 3.4H16v5.6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-5.6H3.9A2 2 0 0 1 2.5 12L12 2.5Z" />
    </svg>
  );
}
