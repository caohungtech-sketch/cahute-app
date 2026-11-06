import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/shadcn/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/shadcn/drawer'
import { useIsMobile } from '@/lib/useIsMobile'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

// Hộp thoại dùng chung: máy tính hiện giữa màn hình, điện thoại hiện ngăn trượt từ đáy (vuốt xuống để đóng).
// Có sẵn: Esc để đóng, giữ focus trong hộp thoại, khoá cuộn trang phía sau.
export default function ResponsiveDialog({ open, onClose, title, description, children }: Props) {
  const isMobile = useIsMobile()
  const onOpenChange = (next: boolean) => {
    if (!next) onClose()
  }

  if (isMobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base">{title}</DrawerTitle>
            <DrawerDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
        </DrawerContent>
      </Drawer>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
