import { useCallback, useState } from 'react'

// Chế độ sáng/tối: class "dark" trên <html>. Script trong index.html đặt class trước khi vẽ để không nháy.
export type Theme = 'light' | 'dark'

const KEY = 'theme'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current)

  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* bỏ qua */
    }
    setThemeState(next)
  }, [])

  return { theme, toggle }
}
