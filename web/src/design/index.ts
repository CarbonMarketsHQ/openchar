/**
 * Instrument — the CarbonMarketsHQ design system, carried into this project.
 *
 * One import for everything. Deep imports work too — `@/design/ui/button` —
 * and are worth using in a route that only needs one or two pieces.
 *
 * The two stylesheets are not imported here. A stylesheet imported by a
 * module is a stylesheet you cannot order, and theme.css has to land before
 * system.css. Import them once, in the layout:
 *
 *   import '@/design/theme.css'
 *   import '@/design/system.css'
 */

export { cx } from './cx'
export type { ClassValue } from './cx'

export { Instrument, SystemProvider, useSystemTheme, usePortalSurface } from './context'
export type { Theme } from './context'

export * from './icons'
export { Logo } from './logo'

/* ---------------------------------------------------------------- primitives */

export { Button, ButtonGroup, Glyph, LinkButton, TextLink, Ticks } from './ui/button'
export type { ButtonProps, ButtonSize, ButtonVariant, LinkButtonProps } from './ui/button'

export { Field, Hint, Input, InputGroup, Label, Textarea } from './ui/field'
export type { FieldProps } from './ui/field'

export { Select, SelectGroup, SelectItem, SelectSeparator } from './ui/select'

export { Checkbox, Switch } from './ui/toggle'

export { Badge } from './ui/badge'
export type { BadgeProps, Tone } from './ui/badge'

export { Card, CardBody, CardFoot, CardHead, CardTitle, KeyValues } from './ui/card'
export type { CardProps } from './ui/card'

export { Notice } from './ui/notice'

export { Dialog, DialogClose, DialogContent, DialogTrigger } from './ui/dialog'

export { Tab, TabList, TabPanel, Tabs } from './ui/tabs'

export { Tooltip } from './ui/tooltip'

export { Table } from './ui/table'
export type { Column } from './ui/table'

export { Skeleton, SkeletonText } from './ui/skeleton'

export { Separator, TickScale } from './ui/separator'

export { ToastProvider, useToast } from './ui/toast'
export type { Toast } from './ui/toast'

/* ---------------------------------------------------------- app shell */

export {
  Breadcrumbs,
  Sidebar,
  SidebarBody,
  SidebarBrand,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarItem,
  SidebarProvider,
  SidebarTrigger,
  Topbar,
  TopbarEnd,
  useSidebar,
} from './ui/sidebar'

export { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from './ui/menu'

export { Progress } from './ui/progress'

export { Avatar } from './ui/avatar'

export { Trend } from './ui/trend'
export type { Series } from './ui/trend'
