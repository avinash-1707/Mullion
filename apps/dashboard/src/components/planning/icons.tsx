// Icon set for Phase 1 — one visual vocabulary shared by node kinds, actor
// chips, and status strips. Sourced from Lucide (via `react-icons/lu`)
// rather than hand-rolled paths: Lucide's restrained, geometric stroke
// style is the closest existing match to MullionMark's own construction
// (see mullion-mark.tsx), so drawing every glyph from one coherent family
// keeps the product's iconography reading as one hand. Stroke width is
// nudged down from Lucide's default (2) to 1.75 — a single constant across
// every icon here, not a per-icon guess — to sit closer to MullionMark's
// 1.6 without fighting Lucide's own geometry. All are decorative alongside
// adjacent text, so aria-hidden.
import type { IconType } from "react-icons";
import {
  LuServer,
  LuDatabase,
  LuExternalLink,
  LuSquareCheckBig,
  LuChevronRight,
  LuTriangleAlert,
  LuLock,
  LuCheck,
  LuCopy,
  LuDownload,
  LuHammer,
  LuUser,
  LuSparkles,
  LuEye,
  LuLayoutDashboard,
  LuSettings,
  LuMenu,
  LuX,
  LuLogOut,
  LuBuilding2,
  LuCamera,
  LuTrash2,
  LuEllipsis,
  LuChartColumn,
} from "react-icons/lu";

interface IconProps {
  className?: string;
}

const base = "h-4 w-4";
const strokeWidth = 1.75;

// Wraps a react-icons component so every glyph in the set shares the same
// default size, stroke weight, and decorative (aria-hidden) handling, while
// keeping each export's name + `{ className? }` contract identical to the
// hand-rolled icons this replaces.
function wrapIcon(Icon: IconType, displayName: string) {
  function IconComponent({ className = base }: IconProps) {
    return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
  }
  IconComponent.displayName = displayName;
  return IconComponent;
}

// node kind: service/box
export const ServiceIcon = wrapIcon(LuServer, "ServiceIcon");
// node kind: datastore/cylinder
export const DatastoreIcon = wrapIcon(LuDatabase, "DatastoreIcon");
// node kind: external dependency
export const ExternalIcon = wrapIcon(LuExternalLink, "ExternalIcon");
// node kind: task
export const TaskIcon = wrapIcon(LuSquareCheckBig, "TaskIcon");
// expand/collapse toggle — points right by default, same as the icon it
// replaces, so existing rotate-on-expand transforms in consumers still work
export const ChevronIcon = wrapIcon(LuChevronRight, "ChevronIcon");
// consistency-check / escalation warning
export const WarningIcon = wrapIcon(LuTriangleAlert, "WarningIcon");
// sealed/frozen Build Spec
export const LockIcon = wrapIcon(LuLock, "LockIcon");
// confirm / done state
export const CheckIcon = wrapIcon(LuCheck, "CheckIcon");
// copy-to-clipboard action
export const CopyIcon = wrapIcon(LuCopy, "CopyIcon");
// download archive action
export const DownloadIcon = wrapIcon(LuDownload, "DownloadIcon");
// Fork B / automated build
export const BuildIcon = wrapIcon(LuHammer, "BuildIcon");
// actor: human/user
export const PersonIcon = wrapIcon(LuUser, "PersonIcon");
// actor: agent thinking/generating
export const SparkIcon = wrapIcon(LuSparkles, "SparkIcon");
// view-only state
export const EyeIcon = wrapIcon(LuEye, "EyeIcon");

// Nav rail/drawer (app shell) — extends the same set rather than a
// parallel icon file, so the shell reads as the same visual family as
// planning/build iconography.
// nav: dashboard home
export const DashboardIcon = wrapIcon(LuLayoutDashboard, "DashboardIcon");
// nav: settings
export const SettingsIcon = wrapIcon(LuSettings, "SettingsIcon");
// nav: mobile drawer open trigger
export const MenuIcon = wrapIcon(LuMenu, "MenuIcon");
// nav: mobile drawer close trigger — swaps in place of MenuIcon, same slot
export const CloseIcon = wrapIcon(LuX, "CloseIcon");
// nav: sign out
export const SignOutIcon = wrapIcon(LuLogOut, "SignOutIcon");
// nav: organization switcher
export const OrgIcon = wrapIcon(LuBuilding2, "OrgIcon");
// settings: avatar upload trigger
export const CameraIcon = wrapIcon(LuCamera, "CameraIcon");
// settings: per-row actions trigger (ui/dropdown-menu.tsx)
export const MoreIcon = wrapIcon(LuEllipsis, "MoreIcon");
// settings: destructive remove-photo action
export const TrashIcon = wrapIcon(LuTrash2, "TrashIcon");
// settings: analytics empty state
export const ChartIcon = wrapIcon(LuChartColumn, "ChartIcon");
