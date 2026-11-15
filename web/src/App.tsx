import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Dashboard from './screens/Dashboard'

const Hub = lazy(() => import('./screens/Hub'))
const DocReview = lazy(() => import('./screens/DocReview'))
const Debug = lazy(() => import('./screens/Debug'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/hub" element={<Hub />} />
        <Route path="/doc/:id" element={<DocReview />} />
        <Route path="/debug" element={<Debug />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Suspense>
  )
}
