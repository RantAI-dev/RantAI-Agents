# React Three Fiber (R3F) Reference Guide

## Overview
React Three Fiber (R3F) is a React renderer for Three.js. It lets you build 3D scenes using React components and hooks. R3F v9 works with React 19 and has full WebGPU support.

## Core Concepts

### Canvas
The `<Canvas>` component is the root of a R3F scene. It creates a WebGL context and a Three.js scene.
```tsx
import { Canvas } from '@react-three/fiber'
<Canvas camera={{ position: [0, 2, 5], fov: 60 }}>
  {/* 3D content goes here */}
</Canvas>
```

### useFrame Hook
The `useFrame` hook runs a callback on every frame. It is the primary way to animate objects. **Never use `requestAnimationFrame` — always use `useFrame`.**
```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

function SpinningBox() {
  const meshRef = useRef()
  useFrame((state, delta) => {
    meshRef.current.rotation.y += delta
    meshRef.current.rotation.x += delta * 0.5
  })
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  )
}
```

### useThree Hook
Access the Three.js state (camera, scene, size, clock, etc.):
```tsx
import { useThree } from '@react-three/fiber'
const { camera, scene, size, clock } = useThree()
```

### Primitive Geometries
R3F provides JSX wrappers for all Three.js geometries:
- `<boxGeometry args={[width, height, depth]} />`
- `<sphereGeometry args={[radius, widthSegments, heightSegments]} />`
- `<torusGeometry args={[radius, tube, radialSegments, tubularSegments]} />`
- `<torusKnotGeometry args={[radius, tube, tubularSegments, radialSegments]} />`
- `<planeGeometry args={[width, height]} />`
- `<cylinderGeometry args={[radiusTop, radiusBot, height, segments]} />`
- `<dodecahedronGeometry args={[radius]} />`
- `<icosahedronGeometry args={[radius]} />`
- `<octahedronGeometry args={[radius]} />`
- `<coneGeometry args={[radius, height, segments]} />`
- `<ringGeometry args={[innerRadius, outerRadius, segments]} />`

### Materials
- `<meshStandardMaterial>` — PBR material (most common, supports roughness/metalness)
- `<meshPhysicalMaterial>` — Extended PBR (transmission, clearcoat, sheen)
- `<meshBasicMaterial>` — Unlit, ignores lights (useful for wireframes, flat colors)
- `<meshNormalMaterial>` — Debug material showing normals as colors
- `<meshToonMaterial>` — Cel-shaded / cartoon look
- `<meshLambertMaterial>` — Non-shiny diffuse material
- `<meshPhongMaterial>` — Shiny with specular highlights
- `<shaderMaterial>` — Custom GLSL shaders

### Lights
```tsx
<ambientLight intensity={0.5} />
<directionalLight position={[5, 5, 5]} intensity={1} castShadow />
<pointLight position={[0, 3, 0]} intensity={1} color="white" />
<spotLight position={[10, 10, 10]} angle={0.3} penumbra={1} />
<hemisphereLight skyColor="blue" groundColor="green" intensity={0.5} />
```

### Groups
Use `<group>` to group and transform objects together:
```tsx
<group position={[0, 1, 0]} rotation={[0, Math.PI / 4, 0]}>
  <mesh><boxGeometry /><meshStandardMaterial /></mesh>
  <mesh position={[2, 0, 0]}><sphereGeometry /><meshStandardMaterial /></mesh>
</group>
```

### Events (Pointer / Click)
```tsx
<mesh
  onClick={(e) => console.log('clicked', e.point)}
  onPointerOver={(e) => setHovered(true)}
  onPointerOut={(e) => setHovered(false)}
>
```

### Common Animation Patterns

#### Sine Wave Motion
```tsx
useFrame((state) => {
  meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.5
})
```

#### Orbit Around a Point
```tsx
useFrame((state) => {
  const t = state.clock.elapsedTime
  meshRef.current.position.x = Math.cos(t) * 2
  meshRef.current.position.z = Math.sin(t) * 2
})
```

#### Color Change Over Time
```tsx
useFrame((state) => {
  const hue = (state.clock.elapsedTime * 0.1) % 1
  meshRef.current.material.color.setHSL(hue, 0.8, 0.5)
})
```

#### Scale Breathing
```tsx
useFrame((state) => {
  const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1
  meshRef.current.scale.setScalar(scale)
})
```
