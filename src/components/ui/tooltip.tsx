import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'
const TooltipProvider = TooltipPrimitive.Provider, Tooltip = TooltipPrimitive.Root, TooltipTrigger = TooltipPrimitive.Trigger
const TooltipContent = ({ className, sideOffset = 4, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) => <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn('z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-background', className)} {...props} /></TooltipPrimitive.Portal>
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
