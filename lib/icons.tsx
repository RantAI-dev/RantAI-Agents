/**
 * Icon Adapter Layer
 *
 * Wraps LineIcons (data-driven) into Lucide-compatible React components
 * so existing code patterns like <Item.icon className="h-5 w-5" /> work unchanged.
 */
import React from "react"
import { Lineicons } from "@lineiconshq/react-lineicons"
import {
  ChatBubble2Solid,
  BricksSolid,
  Route1Solid,
  Headphone1Solid,
  Book1Solid,
  Cart2Solid,
  Buildings1Solid,
  Gear1Solid,
  Bell1Solid,
  Search1Solid,
  PlusSolid,
  Trash3Solid,
  PenToSquareSolid,
  ChevronDownSolid,
  ChevronUpSolid,
  ChevronLeftSolid,
  Folder1Solid,
  Database2Solid,
  StarFatSolid,
  User4Solid,
  ExitSolid,
  Hammer1Solid,
  EyeSolid,
  Layout26Solid,
  MenuHamburger1Solid,
  AngleDoubleRightSolid,
  Code1Solid,
  Plug1Solid,
  Key1Solid,
  BarChart4Solid,
  CheckCircle1Solid,
  Shield2Solid,
  Globe1Solid,
  HeartSolid,
  Envelope1Solid,
  Cloud2Solid,
  Calculator1Solid,
  TrendUp1Solid,
  UserMultiple4Solid,
  ArrowRightSolid,
  XmarkSolid,
  CheckSolid,
  Pencil1Solid,
  Bolt2Solid,
  // Workflow-specific icons
  PlaySolid,
  Link2AngularRightSolid,
  Alarm1Solid,
  TowerBroadcast1Solid,
  Bulb2Solid,
  Hierarchy1Solid,
  ArrowBothDirectionHorizontal1Solid,
  RefreshCircle1ClockwiseSolid,
  VectorNodes6Solid,
  VectorNodes7Solid,
  Bug1Solid,
  HandMicSolid,
  StampSolid,
  HandShakeSolid,
  ShuffleSolid,
  Funnel1Solid,
  Layers1Solid,
  StorageHdd2Solid,
  DirectionLtrSolid,
  // Toolbar & general-purpose icon fixes
  ArrowAngularTopRightSolid,
  ArrowLeftSolid,
  CalendarDaysSolid,
  PauseSolid,
  Download1Solid,
  Upload1Solid,
  DashboardSquare1Solid,
  Layout9Solid,
  MapPin5Solid,
  PreviousStep2Solid,
  NextStep2Solid,
  HourglassSolid,
  Rocket5Solid,
  FloppyDisk1Solid,
  QuestionMarkCircleSolid,
  Spinner3Solid,
  ClipboardSolid,
  // Agent editor tab icons
  Gauge1Solid,
  BoxArchive1Solid,
  SlidersHorizontalSquare2Solid,
} from "@lineiconshq/free-icons"

// ─── Types ───────────────────────────────────────────────────────────

export type IconComponent = React.FC<{ className?: string; size?: number | string; style?: React.CSSProperties }>

interface IconData {
  name: string
  svg: string
  viewBox: string
  hasFill: boolean
  hasStroke: boolean
  hasStrokeWidth: boolean
  defaultFill?: string
  category?: string
  variant?: string
  style: string
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Converts a LineIcons icon data object into a Lucide-compatible React component.
 * Parses `className` for Tailwind size classes (h-N w-N) and maps to pixel size.
 */
function createIcon(iconData: IconData, displayName: string): IconComponent {
  const Icon: IconComponent = ({ className, size, style }) => {
    // Parse size from className if not explicitly provided
    let resolvedSize = size
    if (!resolvedSize && className) {
      const match = className.match(/(?:^|\s)(?:h|w)-(\[([^\]]+)\]|(\d+(?:\.\d+)?))/)
      if (match) {
        const bracket = match[2]
        const num = match[3]
        if (bracket) {
          resolvedSize = bracket
        } else if (num) {
          // Tailwind spacing: 1 = 0.25rem = 4px
          resolvedSize = parseFloat(num) * 4
        }
      }
    }
    if (!resolvedSize) resolvedSize = 20

    return (
      <Lineicons
        icon={iconData}
        size={resolvedSize}
        className={className}
        color={style?.color ?? "currentColor"}
        style={style}
      />
    )
  }
  Icon.displayName = displayName
  return Icon
}

// ─── Exported Icon Components ────────────────────────────────────────
// Named to match Lucide conventions used throughout the project

// Navigation
export const MessageSquare = createIcon(ChatBubble2Solid, "MessageSquare")
export const Blocks = createIcon(BricksSolid, "Blocks")
export const GitBranch = createIcon(Route1Solid, "GitBranch")
export const Headphones = createIcon(Headphone1Solid, "Headphones")
export const BookOpen = createIcon(Book1Solid, "BookOpen")
export const Store = createIcon(Cart2Solid, "Store")
export const Building2 = createIcon(Buildings1Solid, "Building2")
export const Settings = createIcon(Gear1Solid, "Settings")
export const Bell = createIcon(Bell1Solid, "Bell")

// Actions
export const Search = createIcon(Search1Solid, "Search")
export const Plus = createIcon(PlusSolid, "Plus")
export const Trash2 = createIcon(Trash3Solid, "Trash2")
export const Pencil = createIcon(PenToSquareSolid, "Pencil")
export const PenTool = createIcon(Pencil1Solid, "PenTool")

// Chevrons / Arrows
export const ChevronDown = createIcon(ChevronDownSolid, "ChevronDown")
export const ChevronUp = createIcon(ChevronUpSolid, "ChevronUp")
export const ChevronLeft = createIcon(ChevronLeftSolid, "ChevronLeft")
export const ChevronRight = createIcon(AngleDoubleRightSolid, "ChevronRight")
export const ArrowRight = createIcon(ArrowRightSolid, "ArrowRight")

// Data / Files
export const Folder = createIcon(Folder1Solid, "Folder")
export const Database = createIcon(Database2Solid, "Database")
export const FileText = createIcon(Book1Solid, "FileText")
export const FilePenLine = createIcon(PenToSquareSolid, "FilePenLine")

// Indicators
export const Star = createIcon(StarFatSolid, "Star")
export const Eye = createIcon(EyeSolid, "Eye")
export const Check = createIcon(CheckSolid, "Check")
export const CheckCircle = createIcon(CheckCircle1Solid, "CheckCircle")
export const X = createIcon(XmarkSolid, "X")

// User / Auth
export const User = createIcon(User4Solid, "User")
export const Users = createIcon(UserMultiple4Solid, "Users")
export const LogOut = createIcon(ExitSolid, "LogOut")
export const KeyRound = createIcon(Key1Solid, "KeyRound")
export const Shield = createIcon(Shield2Solid, "Shield")

// Tools / Dev
export const Wrench = createIcon(Hammer1Solid, "Wrench")
export const Code = createIcon(Code1Solid, "Code")
export const Plug = createIcon(Plug1Solid, "Plug")
export const Globe = createIcon(Globe1Solid, "Globe")

// Layout / UI
export const PanelLeft = createIcon(Layout26Solid, "PanelLeft")
export const PanelLeftClose = createIcon(MenuHamburger1Solid, "PanelLeftClose")
export const Menu = createIcon(MenuHamburger1Solid, "Menu")

// Analytics / Finance
export const BarChart3 = createIcon(BarChart4Solid, "BarChart3")
export const BarChart = createIcon(BarChart4Solid, "BarChart")
export const CreditCard = createIcon(Envelope1Solid, "CreditCard") // Closest available
export const TrendingUp = createIcon(TrendUp1Solid, "TrendingUp")

// Misc
export const Heart = createIcon(HeartSolid, "Heart")
export const Mail = createIcon(Envelope1Solid, "Mail")
export const Cloud = createIcon(Cloud2Solid, "Cloud")
export const Calculator = createIcon(Calculator1Solid, "Calculator")

// Aliases for specific Lucide names used in the codebase
export const Sparkles = createIcon(Bolt2Solid, "Sparkles")
export const Bot = createIcon(BricksSolid, "Bot")
export const Workflow = createIcon(Route1Solid, "Workflow")
export const ToggleLeft = createIcon(Gear1Solid, "ToggleLeft")
export const Brain = createIcon(BoxArchive1Solid, "Brain")
export const Info = createIcon(CheckCircle1Solid, "Info")
export const Zap = createIcon(Bolt2Solid, "Zap")
export const Box = createIcon(BricksSolid, "Box")
export const Clock = createIcon(Alarm1Solid, "Clock")
export const Languages = createIcon(Globe1Solid, "Languages")

// ─── Extended aliases (used across 150+ files) ──────────────────────
// Maps every Lucide icon name used in the project to the closest LineIcons solid variant

// Arrows / Navigation
export const ArrowLeft = createIcon(ArrowLeftSolid, "ArrowLeft")
export const ArrowUpRight = createIcon(ArrowRightSolid, "ArrowUpRight")
export const ArrowUpDown = createIcon(ChevronDownSolid, "ArrowUpDown")
export const ArrowRightLeft = createIcon(ArrowBothDirectionHorizontal1Solid, "ArrowRightLeft")
export const CornerDownRight = createIcon(AngleDoubleRightSolid, "CornerDownRight")
export const ChevronsUpDown = createIcon(ChevronDownSolid, "ChevronsUpDown")
export const RotateCcw = createIcon(ArrowRightSolid, "RotateCcw")
export const RefreshCw = createIcon(RefreshCircle1ClockwiseSolid, "RefreshCw")
export const Repeat = createIcon(RefreshCircle1ClockwiseSolid, "Repeat")
export const Shuffle = createIcon(ShuffleSolid, "Shuffle")

// Files / Documents
export const File = createIcon(Book1Solid, "File")
export const FileCode = createIcon(Code1Solid, "FileCode")
export const FileJson = createIcon(Code1Solid, "FileJson")
export const FileSearch = createIcon(Search1Solid, "FileSearch")
export const FileSpreadsheet = createIcon(BarChart4Solid, "FileSpreadsheet")
export const FileType = createIcon(Book1Solid, "FileType")
export const StickyNote = createIcon(Book1Solid, "StickyNote")

// UI Elements
export const Copy = createIcon(ClipboardSolid, "Copy")
export const Download = createIcon(Download1Solid, "Download")
export const Upload = createIcon(Upload1Solid, "Upload")
export const Save = createIcon(FloppyDisk1Solid, "Save")
export const Send = createIcon(DirectionLtrSolid, "Send")
export const Filter = createIcon(Funnel1Solid, "Filter")
export const FilterX = createIcon(XmarkSolid, "FilterX")
export const MoreHorizontal = createIcon(MenuHamburger1Solid, "MoreHorizontal")
export const MoreVertical = createIcon(MenuHamburger1Solid, "MoreVertical")
export const Maximize2 = createIcon(Layout26Solid, "Maximize2")
export const ZoomIn = createIcon(Search1Solid, "ZoomIn")
export const ZoomOut = createIcon(Search1Solid, "ZoomOut")
export const ExternalLink = createIcon(ArrowAngularTopRightSolid, "ExternalLink")
export const Link2 = createIcon(Route1Solid, "Link2")
export const Loader2 = createIcon(Spinner3Solid, "Loader2")
export const Paperclip = createIcon(Route1Solid, "Paperclip")
export const Image = createIcon(EyeSolid, "Image")
export const Play = createIcon(PlaySolid, "Play")
export const Power = createIcon(Gear1Solid, "Power")
export const Square = createIcon(BricksSolid, "Square")
export const List = createIcon(MenuHamburger1Solid, "List")
export const LayoutGrid = createIcon(DashboardSquare1Solid, "LayoutGrid")
export const Layers = createIcon(Layers1Solid, "Layers")
export const AlignLeft = createIcon(MenuHamburger1Solid, "AlignLeft")
export const SlidersHorizontal = createIcon(SlidersHorizontalSquare2Solid, "SlidersHorizontal")

// Status / Alerts
export const AlertCircle = createIcon(CheckCircle1Solid, "AlertCircle")
export const AlertTriangle = createIcon(CheckCircle1Solid, "AlertTriangle")
export const HelpCircle = createIcon(QuestionMarkCircleSolid, "HelpCircle")
export const ShieldAlert = createIcon(Bug1Solid, "ShieldAlert")
export const XCircle = createIcon(XmarkSolid, "XCircle")
export const CheckCircle2 = createIcon(CheckCircle1Solid, "CheckCircle2")
export const PauseCircle = createIcon(CheckCircle1Solid, "PauseCircle")
export const CircleDot = createIcon(CheckCircle1Solid, "CircleDot")

// User variants
export const UserPlus = createIcon(User4Solid, "UserPlus")
export const UserCheck = createIcon(HandMicSolid, "UserCheck")
export const UserCircle = createIcon(User4Solid, "UserCircle")

// Communication
export const MessageCircle = createIcon(ChatBubble2Solid, "MessageCircle")
export const MessageSquareText = createIcon(ChatBubble2Solid, "MessageSquareText")

// Dev / System
export const Terminal = createIcon(Code1Solid, "Terminal")
export const Code2 = createIcon(Code1Solid, "Code2")
export const Braces = createIcon(Code1Solid, "Braces")
export const Variable = createIcon(Code1Solid, "Variable")
export const Cpu = createIcon(Gauge1Solid, "Cpu")
export const HardDrive = createIcon(StorageHdd2Solid, "HardDrive")
export const Monitor = createIcon(Layout26Solid, "Monitor")
export const MonitorCog = createIcon(Gear1Solid, "MonitorCog")
export const Network = createIcon(Route1Solid, "Network")
export const Webhook = createIcon(Link2AngularRightSolid, "Webhook")
export const Wifi = createIcon(Globe1Solid, "Wifi")
export const WifiOff = createIcon(Globe1Solid, "WifiOff")
export const Radio = createIcon(TowerBroadcast1Solid, "Radio")
export const Airplay = createIcon(DirectionLtrSolid, "Airplay")

// Commerce / Business
export const Wallet = createIcon(Envelope1Solid, "Wallet")
export const Coins = createIcon(StarFatSolid, "Coins")
export const Receipt = createIcon(Book1Solid, "Receipt")
export const Crown = createIcon(StarFatSolid, "Crown")
export const Package = createIcon(BricksSolid, "Package")
export const Tag = createIcon(StarFatSolid, "Tag")

// Data / Charts
export const TrendingDown = createIcon(TrendUp1Solid, "TrendingDown")
export const Sigma = createIcon(BarChart4Solid, "Sigma")

// Misc
export const Calendar = createIcon(CalendarDaysSolid, "Calendar")
export const Camera = createIcon(EyeSolid, "Camera")
export const Presentation = createIcon(Layout26Solid, "Presentation")
export const ThumbsUp = createIcon(StarFatSolid, "ThumbsUp")
export const ThumbsDown = createIcon(StarFatSolid, "ThumbsDown")
export const HandHelping = createIcon(HandShakeSolid, "HandHelping")
export const Wand2 = createIcon(StarFatSolid, "Wand2")
export const FormInput = createIcon(PenToSquareSolid, "FormInput")
export const Table2 = createIcon(BarChart4Solid, "Table2")
export const Merge = createIcon(VectorNodes7Solid, "Merge")
export const GitFork = createIcon(Hierarchy1Solid, "GitFork")

// Additional missing exports (discovered during build)
export const ArrowDown = createIcon(ChevronDownSolid, "ArrowDown")
export const Archive = createIcon(Database2Solid, "Archive")
export const Command = createIcon(Gear1Solid, "Command")
export const DollarSign = createIcon(StarFatSolid, "DollarSign")
export const Edit = createIcon(PenToSquareSolid, "Edit")
export const EyeOff = createIcon(EyeSolid, "EyeOff")
export const Github = createIcon(Code1Solid, "Github")
export const GripVertical = createIcon(MenuHamburger1Solid, "GripVertical")
export const History = createIcon(HourglassSolid, "History")
export const Key = createIcon(Key1Solid, "Key")
export const LayoutDashboard = createIcon(Layout26Solid, "LayoutDashboard")
export const LayoutPanelLeft = createIcon(Layout26Solid, "LayoutPanelLeft")
export const MessageSquarePlus = createIcon(ChatBubble2Solid, "MessageSquarePlus")
export const Moon = createIcon(StarFatSolid, "Moon")
export const Sun = createIcon(StarFatSolid, "Sun")
export const MousePointerClick = createIcon(ArrowRightSolid, "MousePointerClick")
export const PanelRight = createIcon(Layout26Solid, "PanelRight")
export const Pause = createIcon(PauseSolid, "Pause")
export const PlayCircle = createIcon(PlaySolid, "PlayCircle")
export const Reply = createIcon(ArrowRightSolid, "Reply")
export const Rocket = createIcon(Rocket5Solid, "Rocket")
export const Server = createIcon(Database2Solid, "Server")
export const ShieldCheck = createIcon(Shield2Solid, "ShieldCheck")
export const ShoppingCart = createIcon(Cart2Solid, "ShoppingCart")
export const ToggleRight = createIcon(Gear1Solid, "ToggleRight")
export const Type = createIcon(PenToSquareSolid, "Type")
export const WrenchIcon = createIcon(Hammer1Solid, "WrenchIcon")
export const Map = createIcon(MapPin5Solid, "Map")
export const Minimize2 = createIcon(Layout26Solid, "Minimize2")
export const Settings2 = createIcon(Gear1Solid, "Settings2")
export const Undo2 = createIcon(PreviousStep2Solid, "Undo2")
export const Redo2 = createIcon(NextStep2Solid, "Redo2")
export const Grid3x3 = createIcon(Layout9Solid, "Grid3x3")

// ─── Workflow Node Icons ─────────────────────────────────────────────
// Dedicated icons for workflow node palette — each visually distinct

export const WfTriggerManual = createIcon(PlaySolid, "WfTriggerManual")
export const WfTriggerWebhook = createIcon(Link2AngularRightSolid, "WfTriggerWebhook")
export const WfTriggerSchedule = createIcon(Alarm1Solid, "WfTriggerSchedule")
export const WfTriggerEvent = createIcon(TowerBroadcast1Solid, "WfTriggerEvent")
export const WfLlm = createIcon(Bulb2Solid, "WfLlm")
export const WfCondition = createIcon(Hierarchy1Solid, "WfCondition")
export const WfSwitch = createIcon(ArrowBothDirectionHorizontal1Solid, "WfSwitch")
export const WfLoop = createIcon(RefreshCircle1ClockwiseSolid, "WfLoop")
export const WfParallel = createIcon(VectorNodes6Solid, "WfParallel")
export const WfMerge = createIcon(VectorNodes7Solid, "WfMerge")
export const WfErrorHandler = createIcon(Bug1Solid, "WfErrorHandler")
export const WfHumanInput = createIcon(HandMicSolid, "WfHumanInput")
export const WfApproval = createIcon(StampSolid, "WfApproval")
export const WfHandoff = createIcon(HandShakeSolid, "WfHandoff")
export const WfTransform = createIcon(ShuffleSolid, "WfTransform")
export const WfFilter = createIcon(Funnel1Solid, "WfFilter")
export const WfAggregate = createIcon(Layers1Solid, "WfAggregate")
export const WfStorage = createIcon(StorageHdd2Solid, "WfStorage")
export const WfStreamOutput = createIcon(DirectionLtrSolid, "WfStreamOutput")

// ─── Icon Map for DynamicIcon ────────────────────────────────────────

export const ICON_MAP: Record<string, IconComponent> = {
  BarChart,
  Calculator,
  Clock,
  Cloud,
  Code,
  FileText,
  GitBranch,
  Globe,
  Heart,
  Languages,
  Mail,
  PenTool,
  Search,
  Sparkles,
  TrendingUp,
  Wrench,
  Zap,
  Workflow,
  Box,
  Shield,
  Database,
  MessageSquare,
  BookOpen,
  // Additional commonly used
  Plus,
  Trash2,
  Pencil,
  Star,
  Eye,
  Check,
  User,
  Settings,
  Bell,
  Blocks,
  Store,
  Building2,
  Headphones,
  Bot,
  Plug,
  KeyRound,
}
