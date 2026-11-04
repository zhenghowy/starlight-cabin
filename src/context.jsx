import { createContext, useContext } from 'react'

export const CabinContext = createContext(null)

export function useCabin() {
  const value = useContext(CabinContext)
  if (!value) throw new Error('useCabin 需要放在营地里')
  return value
}
