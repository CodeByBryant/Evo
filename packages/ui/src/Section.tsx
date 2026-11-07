/** A titled block of the left column: text on the world, no box. `aside` is a quiet note beside the title. */
export function Section({
  id,
  title,
  aside,
  children
}: {
  id: string
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="evo-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="evo-section-title">
        <span>{title}</span>
        {aside !== undefined && <em>{aside}</em>}
      </h2>
      {children}
    </section>
  )
}
