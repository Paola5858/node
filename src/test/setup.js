import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: () => 'blob:test-image',
})

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: () => {},
})

if (typeof window !== 'undefined' && !window.scrollTo) {
  window.scrollTo = vi.fn()
} else if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}
