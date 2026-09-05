import * as React from 'react'
import { cn } from '@/lib/utils'
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium', className)} {...props} /> }
