import { createRoot } from 'react-dom/client'
import 'react-diff-view/style/index.css'
import './styles.css'
import App from './App'

// Popup vs full-tab: the popup body is a fixed 780px; in a tab, let it flow.
if (window.innerWidth > 820) document.body.classList.add('as-tab')

createRoot(document.getElementById('root')!).render(<App />)
