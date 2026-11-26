/**
 * The icon set, drawn rather than imported.
 *
 * Everything is a 16-unit box on a 1.5 stroke in currentColor, with square
 * caps — the same hand as the rules, ticks and crosshairs elsewhere in the
 * system. Rounded caps and filled glyphs both read as a different product.
 *
 * Kept in-house on purpose: an icon library is the one dependency that would
 * otherwise have to travel with the design system into every CMHQ project.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </Icon>
)

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8h9" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
)

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
)

/** A location pin: the field app's GPS fix. */
export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 14.5s4.5-4.2 4.5-7.75a4.5 4.5 0 0 0-9 0C3.5 10.3 8 14.5 8 14.5Z" />
    <circle cx="8" cy="6.75" r="1.5" />
  </Icon>
)

/** A camera: taking an evidence photo. */
export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 5.25h3l1.25-2h3.5l1.25 2h3v8H2z" />
    <circle cx="8" cy="9" r="2.25" />
  </Icon>
)

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Icon>
)

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
)

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
  </Icon>
)

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" />
  </Icon>
)

/** A filled square: the universal "stop", and the only filled glyph here. */
export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="8" height="8" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" />
    <path d="M10.5 3.5h-8v8" />
  </Icon>
)

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.5V5h-2.5" />
  </Icon>
)

export const IconPaperclip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.5 7 7 11.5a2.1 2.1 0 0 1-3-3l5-5a3 3 0 0 1 4.2 4.2l-5 5" />
  </Icon>
)

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h4v4" />
    <path d="M13 3 7.5 8.5" />
    <path d="M12 9.5V13H3V4h3.5" />
  </Icon>
)

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 2.5h6L12.5 5.5v8h-9z" />
    <path d="M9.5 2.5v3h3" />
  </Icon>
)

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3.5" width="11" height="9" />
    <path d="m2.5 10 3-2.5 3 2.5 2-1.5 3 2" />
  </Icon>
)

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 7.5v3.5M8 5.2v.8" />
  </Icon>
)

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5 14 13H2z" />
    <path d="M8 6.5v3M8 11v.8" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4" />
    <path d="m10 10 3.5 3.5" />
  </Icon>
)

export const IconThumbUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7.5 8 2a1.8 1.8 0 0 1 1.7 2.3L9.2 6.5h3a1.3 1.3 0 0 1 1.2 1.7l-1.2 4a1.3 1.3 0 0 1-1.2.9H5" />
    <rect x="2" y="7" width="3" height="7" />
  </Icon>
)

export const IconThumbDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8.5 8 14a1.8 1.8 0 0 0 1.7-2.3L9.2 9.5h3a1.3 1.3 0 0 0 1.2-1.7l-1.2-4A1.3 1.3 0 0 0 11 3H5" />
    <rect x="2" y="2" width="3" height="7" />
  </Icon>
)

/**
 * The registration mark on a framed card: a corner bracket with a crosshair
 * inside it. Not an icon so much as a corner, and the same drawing the public
 * site puts on its frames — the two must not drift.
 *
 * width and height are declared as well as the viewBox. An SVG root carrying
 * only a viewBox has no intrinsic size, and inside a shrink-to-fit box that
 * resolves to 0×0 and the mark silently disappears.
 */
export const IconCrosshair = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 34 34"
    width={34}
    height={34}
    fill="none"
    stroke="currentColor"
    strokeWidth={1}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {/* inset by 1 so the stroke sits inside the box, not half outside it */}
    <path d="M22 1h11v11" />
    <path d="M27 6v9M22.5 10.5h9" />
  </svg>
)

/* ------------------------------------------------------------ application */

/** The sidebar toggle: a panel with its rail lit. */
export const IconPanel = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" />
    <path d="M6 3v10" />
  </Icon>
)

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.6v.8M8 7.6v.8M8 11.6v.8" />
  </Icon>
)

export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4h4.5l1.5 2H14v7.5H2z" />
  </Icon>
)

export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2 14 5.5 8 9 2 5.5z" />
    <path d="m2.5 9 5.5 3.2L13.5 9" />
  </Icon>
)

export const IconBook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 2.5h4A2 2 0 0 1 8 4v9a2 2 0 0 0-1.5-1h-4z" />
    <path d="M13.5 2.5h-4A2 2 0 0 0 8 4v9a2 2 0 0 1 1.5-1h4z" />
  </Icon>
)

export const IconLog = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="2.5" width="9" height="11" />
    <path d="M6 2.5V1.5h4v1" />
    <path d="M6 6.5h4M6 9h4M6 11.5h2" />
  </Icon>
)

export const IconBalance = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v11M5 13.5h6M3.5 4.5h9" />
    <path d="M3.5 4.5 1.5 9.5h4zM12.5 4.5l-2 5h4z" />
  </Icon>
)

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 4.8V8l2.4 1.6" />
  </Icon>
)

export const IconGauge = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
    <path d="M8 12 10.6 6.6" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4 4.8 4.8M11.2 11.2l1.4 1.4M12.6 3.4 11.2 4.8M4.8 11.2 3.4 12.6" />
  </Icon>
)

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6" />
    <path d="M2.5 10.5v3h11v-3" />
  </Icon>
)


/** A pyrolysis kiln: domed chamber, door, ground line. */
export const IconKiln = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 13V7.5a4 4 0 0 1 8 0V13" />
    <path d="M6.5 13v-2.5h3V13" />
    <path d="M2.5 13h11" />
  </Icon>
)

/** Field capture: a handset with a location fix. */
export const IconFieldApp = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="2" width="7" height="12" />
    <circle cx="8" cy="7" r="1.8" />
    <path d="M8 8.8v2.4" />
  </Icon>
)

/** A lab flask. */
export const IconFlask = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.6 2.5h2.8" />
    <path d="M7.3 2.5v4L4.6 11.9a1 1 0 0 0 .9 1.6h5a1 1 0 0 0 .9-1.6L8.7 6.5v-4" />
    <path d="M5.8 10h4.4" />
  </Icon>
)

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1" />
  </Icon>
)

export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6z" />
  </Icon>
)
