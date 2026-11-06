import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Gộp class Tailwind, class sau ghi đè class trước (dùng cho component shadcn/ui).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
