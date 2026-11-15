import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Asha's living room: procedural shell + NVIDIA SimReady furniture (CC-BY-4.0), ~4 MB total.
type Box = { min: number[]; max: number[] }
let manifest: Record<string, Box> | null = null
const mp = fetch('/m/manifest.json').then((r) => r.json()).then((m) => (manifest = m)).catch(() => (manifest = {}))
function useManifest() {
  const [m, setM] = useState(manifest)
  useEffect(() => {
    if (!m) {
      mp.then(setM)
    }
  }, [m])
  return m
}

function Sim({ name, position = [0, 0, 0], rotation = 0, scale = 1 }: { name: string; position?: [number, number, number]; rotation?: number; scale?: number }) {
  const { scene } = useGLTF(`/m/${name}.glb`)
  const m = useManifest()
  const obj = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return c
  }, [scene])
  const b = m?.[name]
  const off: [number, number, number] = b ? [-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2] : [0, 0, 0]
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <primitive object={obj} position={off} />
    </group>
  )
}

function tex(draw: (g: CanvasRenderingContext2D, n: number) => void, repeat: [number, number]) {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  draw(c.getContext('2d')!, 512)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

const MOOD = {
  good: { lamp: '#ffc98a', sky: '#ffb36b', amb: 0.55 },
  check: { lamp: '#ffb347', sky: '#f59e0b', amb: 0.5 },
  urgent: { lamp: '#ff5a5a', sky: '#ef4444', amb: 0.42 },
} as const

export default function LivingRoom({ status = 'good' }: { status?: 'good' | 'check' | 'urgent' }) {
  const mood = MOOD[status]
  const lamp = useRef<THREE.PointLight>(null)
  const invalidate = useThree((s) => s.invalidate)
  const floor = useMemo(
    () =>
      tex((g, n) => {
        const r = rng(21)
        for (let i = 0; i < 10; i++) {
          const v = 150 + r() * 25
          g.fillStyle = `rgb(${v},${v - 34},${v - 72})`
          g.fillRect(0, (i * n) / 10, n, n / 10)
          g.fillStyle = 'rgba(50,28,12,0.4)'
          g.fillRect(0, (i * n) / 10, n, 2)
          g.fillRect(((i * 0.37) % 1) * n, (i * n) / 10, 2, n / 10)
          for (let k = 0; k < 30; k++) {
            g.strokeStyle = `rgba(80,45,20,${0.04 + r() * 0.06})`
            g.beginPath()
            const y = (i * n) / 10 + r() * (n / 10)
            g.moveTo(0, y)
            g.bezierCurveTo(n * 0.3, y + r() * 4 - 2, n * 0.6, y + r() * 4 - 2, n, y)
            g.stroke()
          }
        }
      }, [3, 3]),
    [],
  )
  const rug = useMemo(
    () =>
      tex((g, n) => {
        g.fillStyle = '#c9b79a'
        g.fillRect(0, 0, n, n)
        g.strokeStyle = '#8c6b45'
        g.lineWidth = 14
        g.strokeRect(28, 28, n - 56, n - 56)
        g.strokeStyle = '#a8855a'
        g.lineWidth = 4
        g.strokeRect(56, 56, n - 112, n - 112)
        const r = rng(4)
        for (let i = 0; i < 6000; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,60,30'},0.06)`
          g.fillRect(r() * n, r() * n, 2, 2)
        }
      }, [1, 1]),
    [],
  )
  const wall = useMemo(
    () =>
      tex((g, n) => {
        g.fillStyle = '#e8dccb'
        g.fillRect(0, 0, n, n)
        const r = rng(8)
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,100,80'},0.035)`
          g.fillRect(r() * n, r() * n, 2, 2)
        }
      }, [3, 2]),
    [],
  )

  // urgent: the lamp pulses red
  useFrame(({ clock }) => {
    if (!lamp.current) return
    const base = 7
    lamp.current.intensity = status === 'urgent' ? base * (0.55 + 0.45 * Math.abs(Math.sin(clock.elapsedTime * 2.4))) : base
    if (status === 'urgent') invalidate()
  })

  const W = 6
  const D = 5.5
  const H = 2.8
  return (
    <group>
      <hemisphereLight args={['#ffe9d2', '#5a4130', mood.amb]} />
      <directionalLight position={[-2.2, 2.4, -4]} intensity={1.6} color={mood.sky} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <pointLight ref={lamp} position={[-1.85, 1.15, -1.75]} distance={7} decay={1.6} color={mood.lamp} castShadow shadow-mapSize={[512, 512]} />

      {/* shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={floor} roughness={0.45} />
      </mesh>
      <mesh position={[0, H / 2, -D / 2]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={wall} roughness={0.95} />
      </mesh>
      <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial map={wall} roughness={0.95} />
      </mesh>
      <mesh position={[W / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[D, H]} />
        <meshStandardMaterial map={wall} roughness={0.95} />
      </mesh>
      {/* baseboards */}
      {[[[0, 0.05, -D / 2 + 0.01], 0, W], [[-W / 2 + 0.01, 0.05, 0], Math.PI / 2, D]].map(([p, r, w], i) => (
        <mesh key={i} position={p as any} rotation={[0, r as number, 0]}>
          <planeGeometry args={[w as number, 0.1]} />
          <meshStandardMaterial color="#f4efe8" roughness={0.6} />
        </mesh>
      ))}
      {/* golden-hour window + SimReady blinds */}
      <mesh position={[0.6, 1.5, -D / 2 + 0.005]}>
        <planeGeometry args={[1.8, 1.5]} />
        <meshStandardMaterial color="#ffe1b8" emissive={mood.sky} emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <Sim name="blinds_window_2m_open_a01" position={[0.6, 0.15, -D / 2 + 0.06]} rotation={-Math.PI / 2} scale={0.95} />
      {/* framed photo on the side wall */}
      <group position={[-W / 2 + 0.02, 1.55, 0.3]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.62, 0.46, 0.03]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.017]}>
          <planeGeometry args={[0.5, 0.34]} />
          <meshStandardMaterial color="#c8a27a" roughness={0.3} />
        </mesh>
      </group>

      {/* rug + furniture */}
      <mesh position={[0.4, 0.006, -0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.8, 2.0]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      <Sim name="sofa_soft_b02" position={[0.5, 0, -1.85]} />
      <Sim name="sofa_soft_b01" position={[-1.35, 0, -0.1]} rotation={Math.PI / 2 - 0.35} />
      <Sim name="furniture_table_coffee_low_a01" position={[0.45, 0, -0.55]} rotation={Math.PI / 2} />
      <Sim name="dishware_mug_coffee_a01" position={[0.15, 0.443, -0.5]} rotation={0.8} />
      {/* side table + lamp by the armchair */}
      <mesh position={[-1.85, 0.28, -1.75]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.56, 32]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.45} />
      </mesh>
      <Sim name="lamp_table_bedside_a01" position={[-1.85, 0.56, -1.75]} scale={1.6} />
      {/* the hub: a laptop on the desk by the wall */}
      <Sim name="desk_a01" position={[2.4, 0, -1.6]} rotation={0} scale={0.9} />
      <group position={[2.4, 0.685, -1.55]} rotation={[0, -Math.PI / 2 - 0.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.34, 0.015, 0.24]} />
          <meshStandardMaterial color="#c7c9cc" metalness={0.8} roughness={0.3} />
        </mesh>
        <group position={[0, 0.008, -0.12]} rotation={[-0.28, 0, 0]}>
          <mesh position={[0, 0.115, 0]} castShadow>
            <boxGeometry args={[0.34, 0.23, 0.008]} />
            <meshStandardMaterial color="#c7c9cc" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.115, 0.0045]}>
            <planeGeometry args={[0.31, 0.2]} />
            <meshStandardMaterial color="#111" emissive="#f7e7cf" emissiveIntensity={1.1} toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* potted plant */}
      <group position={[2.45, 0, 0.6]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.13, 0.4, 24]} />
          <meshStandardMaterial color="#b3654a" roughness={0.8} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[Math.sin(i * 2.1) * 0.12, 0.62 + (i % 3) * 0.08, Math.cos(i * 2.1) * 0.12]} rotation={[Math.sin(i) * 0.5, i, Math.cos(i) * 0.5]} castShadow>
            <sphereGeometry args={[0.16, 10, 8]} />
            <meshStandardMaterial color={i % 2 ? '#3f7d3a' : '#4f9445'} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

;['sofa_soft_b02', 'sofa_soft_b01', 'furniture_table_coffee_low_a01', 'dishware_mug_coffee_a01', 'lamp_table_bedside_a01', 'desk_a01', 'blinds_window_2m_open_a01'].forEach((n) => useGLTF.preload(`/m/${n}.glb`))
