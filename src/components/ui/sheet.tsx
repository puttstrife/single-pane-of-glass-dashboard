import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
const Sheet = Dialog.Root, SheetTrigger = Dialog.Trigger, SheetClose = Dialog.Close
const SheetContent = ({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof Dialog.Content>) => <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" /><Dialog.Content className={cn('fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card p-6 shadow-2xl outline-none', className)} {...props}>{children}<Dialog.Close className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"><X className="h-4 w-4" /><span className="sr-only">Close</span></Dialog.Close></Dialog.Content></Dialog.Portal>
const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('mb-5 space-y-1', className)} {...props} />
const SheetTitle = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Dialog.Title>) => <Dialog.Title className={cn('text-lg font-semibold', className)} {...props} />
export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle }
