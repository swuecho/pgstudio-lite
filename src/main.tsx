import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { registerAppRouter } from '@/components/shared/navigation'
import { createAppRouter } from './router'

const router = createAppRouter()
registerAppRouter(router)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
