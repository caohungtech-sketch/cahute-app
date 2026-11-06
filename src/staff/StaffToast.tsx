import { Toast } from '../components/ui'

// Toast cho trang nhân viên: nằm trên thanh tab iOS (cao ~6rem + vùng an toàn).
export default function StaffToast({ message, onClose }: { message: string | null; onClose: () => void }) {
  return <Toast message={message} onClose={onClose} bottomClass="bottom-[calc(7rem+env(safe-area-inset-bottom))]" />
}
