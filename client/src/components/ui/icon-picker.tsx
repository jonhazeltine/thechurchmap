import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

import * as LucideIcons from "lucide-react";
import * as FaIcons from "react-icons/fa";
import * as Fa6Icons from "react-icons/fa6";
import * as MdIcons from "react-icons/md";
import * as HiIcons from "react-icons/hi";
import * as Hi2Icons from "react-icons/hi2";
import * as BiIcons from "react-icons/bi";
import * as BsIcons from "react-icons/bs";
import * as AiIcons from "react-icons/ai";
import * as FiIcons from "react-icons/fi";
import * as IoIcons from "react-icons/io5";
import * as RiIcons from "react-icons/ri";
import * as TbIcons from "react-icons/tb";
import * as GiIcons from "react-icons/gi";
import * as SiIcons from "react-icons/si";

type IconComponent = React.ComponentType<{ className?: string; size?: number }>;

interface IconSet {
  name: string;
  prefix: string;
  icons: Record<string, IconComponent>;
  displayName: string;
}

const iconSets: IconSet[] = [
  { name: "lucide", prefix: "Lu", icons: LucideIcons as unknown as Record<string, IconComponent>, displayName: "Lucide" },
  { name: "fa", prefix: "Fa", icons: FaIcons as unknown as Record<string, IconComponent>, displayName: "Font Awesome" },
  { name: "fa6", prefix: "Fa6", icons: Fa6Icons as unknown as Record<string, IconComponent>, displayName: "Font Awesome 6" },
  { name: "md", prefix: "Md", icons: MdIcons as unknown as Record<string, IconComponent>, displayName: "Material Design" },
  { name: "hi", prefix: "Hi", icons: HiIcons as unknown as Record<string, IconComponent>, displayName: "Heroicons" },
  { name: "hi2", prefix: "Hi2", icons: Hi2Icons as unknown as Record<string, IconComponent>, displayName: "Heroicons 2" },
  { name: "bi", prefix: "Bi", icons: BiIcons as unknown as Record<string, IconComponent>, displayName: "BoxIcons" },
  { name: "bs", prefix: "Bs", icons: BsIcons as unknown as Record<string, IconComponent>, displayName: "Bootstrap" },
  { name: "ai", prefix: "Ai", icons: AiIcons as unknown as Record<string, IconComponent>, displayName: "Ant Design" },
  { name: "fi", prefix: "Fi", icons: FiIcons as unknown as Record<string, IconComponent>, displayName: "Feather" },
  { name: "io", prefix: "Io", icons: IoIcons as unknown as Record<string, IconComponent>, displayName: "Ionicons" },
  { name: "ri", prefix: "Ri", icons: RiIcons as unknown as Record<string, IconComponent>, displayName: "Remix" },
  { name: "tb", prefix: "Tb", icons: TbIcons as unknown as Record<string, IconComponent>, displayName: "Tabler" },
  { name: "gi", prefix: "Gi", icons: GiIcons as unknown as Record<string, IconComponent>, displayName: "Game Icons" },
  { name: "si", prefix: "Si", icons: SiIcons as unknown as Record<string, IconComponent>, displayName: "Simple Icons" },
];

function getIconsFromSet(iconSet: IconSet): Array<{ name: string; component: IconComponent }> {
  const icons: Array<{ name: string; component: IconComponent }> = [];
  
  for (const [name, component] of Object.entries(iconSet.icons)) {
    if (
      typeof component === "function" &&
      name !== "default" &&
      !name.startsWith("create") &&
      !name.includes("Context") &&
      !name.includes("Provider")
    ) {
      icons.push({ name: `${iconSet.prefix}:${name}`, component: component as IconComponent });
    }
  }
  
  return icons;
}

const allIconsBySet = iconSets.map(set => ({
  ...set,
  iconList: getIconsFromSet(set),
}));

const totalIconCount = allIconsBySet.reduce((acc, set) => acc + set.iconList.length, 0);

export function getIconComponent(iconKey: string): IconComponent | null {
  if (!iconKey) return null;
  
  const [prefix, name] = iconKey.split(":");
  if (!prefix || !name) return null;
  
  const iconSet = iconSets.find(s => s.prefix === prefix);
  if (!iconSet) return null;
  
  const component = iconSet.icons[name];
  return component || null;
}

export function renderIcon(iconKey: string, props?: { className?: string; size?: number }) {
  const IconComponent = getIconComponent(iconKey);
  if (!IconComponent) return null;
  return <IconComponent {...props} />;
}

interface IconPickerProps {
  value?: string;
  onChange?: (iconKey: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function IconPicker({
  value,
  onChange,
  placeholder = "Select an icon",
  className,
  disabled = false,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const filteredIcons = useMemo(() => {
    const searchLower = search.toLowerCase();
    
    if (activeTab === "all") {
      if (!search) {
        return allIconsBySet.flatMap(set => set.iconList.slice(0, 50));
      }
      return allIconsBySet.flatMap(set =>
        set.iconList.filter(icon => 
          icon.name.toLowerCase().includes(searchLower)
        )
      ).slice(0, 200);
    }
    
    const activeSet = allIconsBySet.find(s => s.name === activeTab);
    if (!activeSet) return [];
    
    if (!search) {
      return activeSet.iconList.slice(0, 100);
    }
    
    return activeSet.iconList
      .filter(icon => icon.name.toLowerCase().includes(searchLower))
      .slice(0, 200);
  }, [search, activeTab]);

  const handleSelect = useCallback((iconKey: string) => {
    onChange?.(iconKey);
    setOpen(false);
    setSearch("");
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  }, [onChange]);

  const SelectedIcon = value ? getIconComponent(value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between", className)}
          data-testid="button-icon-picker"
        >
          <div className="flex items-center gap-2">
            {SelectedIcon ? (
              <>
                <SelectedIcon className="h-4 w-4" />
                <span className="text-sm truncate max-w-[150px]">{value}</span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {value && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${totalIconCount.toLocaleString()} icons...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              data-testid="input-icon-search"
            />
          </div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b px-2 overflow-x-auto">
            <TabsList className="h-9 bg-transparent p-0 gap-1 flex-nowrap inline-flex w-max">
              <TabsTrigger
                value="all"
                className="text-xs px-2 py-1 data-[state=active]:bg-muted rounded-sm"
              >
                All
              </TabsTrigger>
              {allIconsBySet.map(set => (
                <TabsTrigger
                  key={set.name}
                  value={set.name}
                  className="text-xs px-2 py-1 data-[state=active]:bg-muted rounded-sm whitespace-nowrap"
                >
                  {set.displayName}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          
          <TabsContent value={activeTab} className="m-0">
            <ScrollArea className="h-[300px]">
              <div className="p-3">
                {filteredIcons.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No icons found for "{search}"
                  </div>
                ) : (
                  <div className="grid grid-cols-8 gap-1">
                    {filteredIcons.map(({ name, component: IconComp }) => (
                      <Tooltip key={name} delayDuration={300}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleSelect(name)}
                            className={cn(
                              "p-2 rounded-md hover-elevate flex items-center justify-center",
                              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                              value === name && "bg-primary text-primary-foreground"
                            )}
                            data-testid={`button-icon-${name}`}
                          >
                            <IconComp className="h-5 w-5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {name}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                )}
                {filteredIcons.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Showing {filteredIcons.length} icons
                    {search && ` matching "${search}"`}
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

export function IconDisplay({ 
  iconKey, 
  className,
  size = 16,
  fallback = null 
}: { 
  iconKey?: string; 
  className?: string;
  size?: number;
  fallback?: React.ReactNode;
}) {
  if (!iconKey) return <>{fallback}</>;
  
  const IconComponent = getIconComponent(iconKey);
  if (!IconComponent) return <>{fallback}</>;
  
  return <IconComponent className={className} size={size} />;
}
