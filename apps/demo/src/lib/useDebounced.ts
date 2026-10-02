import { useEffect, useState } from 'react'

/** 输入防抖：编辑时不必每一击都重跑分页，同时保证预览"感觉是实时"的。 */
export function useDebounced<T>(value: T, delayMs = 180): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
