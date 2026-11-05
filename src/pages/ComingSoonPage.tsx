import { Link } from 'react-router'

// Trang cho các mục menu chưa xây dựng.
export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-gray-500">Tính năng này đang được phát triển.</p>
      <Link to="/" className="mt-6 inline-flex min-h-12 items-center rounded-xl px-4 font-medium text-indigo-700 ring-1 ring-gray-300">
        Về trang Tổng quan
      </Link>
    </div>
  )
}
