export function StreamingCursor() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 2,
        height: '1em',
        background: 'var(--color-primary)',
        borderRadius: 1,
        marginLeft: 2,
        verticalAlign: 'text-bottom',
        animation: 'streaming-blink 1s step-end infinite',
      }}
    />
  );
}
