import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import LivingRoom from './LivingRoom'

/** Lazy-loaded 3D window into Mom's living room; lighting follows her status. */
export default function RoomHero({ status, camera = { position: [1.9, 1.35, 1.6], target: [-0.2, 0.55, -1.2] }, demand = true }: { status: 'good' | 'check' | 'urgent'; camera?: { position: number[]; target: number[] }; demand?: boolean }) {
  return (
    <Canvas
      shadows="soft"
      frameloop={demand && status !== 'urgent' ? 'demand' : 'always'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, alpha: true }}
      camera={{ position: camera.position as [number, number, number], fov: 42 }}
      onCreated={({ camera: c }) => c.lookAt(...(camera.target as [number, number, number]))}
    >
      <Suspense fallback={null}>
        <LivingRoom status={status} />
        <Environment resolution={64} frames={1}>
          <Lightformer form="rect" intensity={1.2} color="#ffd9a8" position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[6, 6, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#ffb070" position={[0, 2, -5]} scale={[6, 3, 1]} />
        </Environment>
      </Suspense>
    </Canvas>
  )
}
