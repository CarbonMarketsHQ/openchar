import { cx } from '../cx'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')

/**
 * Who. Initials in a ruled box by default, a photograph when there is one.
 *
 * The box is the same stamp the transcript uses for a speaker, so a person and
 * a model are marked in the same language and the difference between them is
 * the accent border rather than a cartoon face.
 */
export function Avatar({
  name,
  src,
  size,
  accent,
  className,
}: {
  name: string
  src?: string
  size?: 'lg'
  /** Marks it as the system rather than a person. */
  accent?: boolean
  className?: string
}) {
  return (
    <span
      className={cx('ui-avatar', className)}
      data-size={size}
      data-accent={accent || undefined}
      title={name}
    >
      {src ? (
        // A caller-supplied URL that may be a blob: or a remote host, so it
        // stays a plain img rather than requiring next/image configuration.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      <span className="u-sr">{name}</span>
    </span>
  )
}
