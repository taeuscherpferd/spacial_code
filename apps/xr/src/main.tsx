import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { App } from '@/app/App'
import { store } from '@/app/store'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Spatial Code root element is missing')
}

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
