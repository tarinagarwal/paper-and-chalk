import type { FolderIcon as FolderIconName } from "@pc/schema";
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Code,
  FlaskConical,
  Folder,
  GraduationCap,
  Heart,
  Lightbulb,
  Music,
  Palette,
  Star,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const FOLDER_ICON_COMPONENTS: Record<FolderIconName, LucideIcon> = {
  folder: Folder,
  book: BookOpen,
  "graduation-cap": GraduationCap,
  flask: FlaskConical,
  briefcase: Briefcase,
  palette: Palette,
  music: Music,
  code: Code,
  heart: Heart,
  star: Star,
  calendar: CalendarDays,
  lightbulb: Lightbulb,
};

export const FOLDER_ICON_LABELS: Record<FolderIconName, string> = {
  folder: "Folder",
  book: "Book",
  "graduation-cap": "Graduation cap",
  flask: "Flask",
  briefcase: "Briefcase",
  palette: "Palette",
  music: "Music",
  code: "Code",
  heart: "Heart",
  star: "Star",
  calendar: "Calendar",
  lightbulb: "Light bulb",
};

export const COLOR_NAMES: Record<string, string> = {
  "#c43e18": "Vermilion",
  "#c98a1b": "Ochre",
  "#5b7a3a": "Moss",
  "#2f7d74": "Teal",
  "#2f5d8a": "Ink blue",
  "#6b4fa0": "Violet",
  "#a8466f": "Plum",
  "#6f6a60": "Graphite",
};

/** A folder's icon in its colour (or the default folder icon). */
export function FolderGlyph({
  icon,
  color,
  className,
}: {
  icon: FolderIconName | null;
  color: string | null;
  className?: string;
}) {
  const Icon = FOLDER_ICON_COMPONENTS[icon ?? "folder"];
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0", className)}
      style={color ? { color } : undefined}
    />
  );
}
