# @react-three/drei Component Reference

## Overview
Drei is the official companion library for React Three Fiber (R3F). It provides dozens of pre-built helper components. Always prefer Drei components over building from scratch.

## Loading 3D Models

### useGLTF
Load GLTF/GLB 3D models from a URL. Returns scene, nodes, materials, and animations.
```tsx
import { useGLTF } from '@react-three/drei'

function Model() {
  const { scene } = useGLTF('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb')
  return <primitive object={scene} scale={1.5} />
}
```

### useAnimations
Play animation clips from GLTF models that contain animations:
```tsx
import { useGLTF, useAnimations } from '@react-three/drei'

function AnimatedFox() {
  const { scene, animations } = useGLTF('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb')
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    actions['Walk']?.reset().fadeIn(0.5).play()
  }, [actions])

  return <primitive object={scene} scale={0.02} />
}
```

### Clone
Render multiple copies of the same GLTF model (avoids shared geometry issues):
```tsx
import { useGLTF, Clone } from '@react-three/drei'

function MultipleModels() {
  const { scene } = useGLTF(MODEL_URL)
  return (
    <group>
      <Clone object={scene} position={[-2, 0, 0]} />
      <Clone object={scene} position={[0, 0, 0]} />
      <Clone object={scene} position={[2, 0, 0]} />
    </group>
  )
}
```

## Camera Controls

### OrbitControls
Interactive camera orbiting with mouse/touch:
```tsx
import { OrbitControls } from '@react-three/drei'
<OrbitControls makeDefault dampingFactor={0.05} />
<OrbitControls enableZoom={false} autoRotate autoRotateSpeed={2} />
```

### PerspectiveCamera
Declarative camera setup:
```tsx
import { PerspectiveCamera } from '@react-three/drei'
<PerspectiveCamera makeDefault fov={60} position={[0, 5, 10]} />
```

## Environment & Lighting

### Environment
Pre-built HDR environment maps for reflections and ambient lighting:
```tsx
import { Environment } from '@react-three/drei'
<Environment preset="city" />
<Environment preset="sunset" />
<Environment preset="dawn" />
<Environment preset="night" />
<Environment preset="warehouse" />
<Environment preset="forest" />
<Environment preset="apartment" />
<Environment preset="studio" />
<Environment preset="lobby" />
<Environment preset="park" />
```

### Lightformer
Create custom light shapes inside Environment:
```tsx
<Environment>
  <Lightformer form="ring" intensity={2} position={[0, 5, -2]} scale={5} />
</Environment>
```

### ContactShadows
Ground contact shadows without shadow maps:
```tsx
import { ContactShadows } from '@react-three/drei'
<ContactShadows position={[0, -0.5, 0]} opacity={0.5} scale={10} blur={2} />
```

### AccumulativeShadows
Soft, realistic accumulated shadows:
```tsx
import { AccumulativeShadows, RandomizedLight } from '@react-three/drei'
<AccumulativeShadows temporal frames={100} position={[0, -0.5, 0]}>
  <RandomizedLight amount={8} position={[5, 5, -5]} />
</AccumulativeShadows>
```

## Shapes & Geometry Helpers

### RoundedBox
Box with rounded corners:
```tsx
import { RoundedBox } from '@react-three/drei'
<RoundedBox args={[1, 1, 1]} radius={0.1} smoothness={4}>
  <meshStandardMaterial color="royalblue" />
</RoundedBox>
```

### Sphere, Torus, Cone, Cylinder
Drei convenience shape components:
```tsx
import { Sphere, Torus, Cone, Cylinder } from '@react-three/drei'
<Sphere args={[1, 64, 64]}><meshStandardMaterial color="gold" /></Sphere>
<Torus args={[1, 0.4, 32, 100]}><meshStandardMaterial color="coral" /></Torus>
```

### TorusKnot
Mathematical tonus knot shape:
```tsx
<mesh>
  <torusKnotGeometry args={[1, 0.3, 128, 32]} />
  <meshStandardMaterial color="mediumpurple" />
</mesh>
```

## Text

### Text (Troika)
High-quality 3D text rendering:
```tsx
import { Text } from '@react-three/drei'
<Text
  position={[0, 2, 0]}
  fontSize={0.5}
  color="white"
  anchorX="center"
  anchorY="middle"
  font="/fonts/Inter-Bold.woff"
>
  Hello World
</Text>
```

### Text3D
Extruded 3D text with depth:
```tsx
import { Text3D, Center } from '@react-three/drei'
<Center>
  <Text3D font="/fonts/Inter_Bold.json" size={1} height={0.2} bevelEnabled bevelSize={0.02}>
    3D Text
    <meshStandardMaterial color="gold" />
  </Text3D>
</Center>
```

## Animation Helpers

### Float
Makes children float up and down gently:
```tsx
import { Float } from '@react-three/drei'
<Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
  <mesh><sphereGeometry /><meshStandardMaterial color="hotpink" /></mesh>
</Float>
```

### Trail
Creates a fading trail behind a moving object:
```tsx
import { Trail } from '@react-three/drei'
<Trail width={0.5} length={5} color="cyan" attenuation={(t) => t * t}>
  <mesh ref={movingRef}><sphereGeometry args={[0.1]} /><meshBasicMaterial /></mesh>
</Trail>
```

### MeshWobbleMaterial
A material that wobbles/distorts the surface:
```tsx
import { MeshWobbleMaterial } from '@react-three/drei'
<mesh>
  <torusGeometry args={[1, 0.4, 32, 100]} />
  <MeshWobbleMaterial color="hotpink" factor={1} speed={2} />
</mesh>
```

### MeshDistortMaterial
A material with organic-looking distortion:
```tsx
import { MeshDistortMaterial } from '@react-three/drei'
<mesh>
  <sphereGeometry args={[1, 64, 64]} />
  <MeshDistortMaterial color="#8B5CF6" distort={0.4} speed={2} roughness={0} />
</mesh>
```

## Visual Effects

### Sparkles
Floating particle sparkles:
```tsx
import { Sparkles } from '@react-three/drei'
<Sparkles count={100} scale={3} size={2} speed={0.5} color="gold" />
```

### Stars
A starfield background:
```tsx
import { Stars } from '@react-three/drei'
<Stars radius={100} depth={50} count={5000} factor={4} fade speed={1} />
```

### Cloud
Volumetric cloud effects:
```tsx
import { Cloud, Clouds } from '@react-three/drei'
<Clouds material={THREE.MeshBasicMaterial}>
  <Cloud segments={40} bounds={[10, 2, 2]} volume={6} color="white" />
</Clouds>
```

### Sky
Atmospheric sky with sun:
```tsx
import { Sky } from '@react-three/drei'
<Sky sunPosition={[100, 20, 100]} turbidity={8} rayleigh={6} />
```

## Advanced Materials

### MeshTransmissionMaterial
Glass/crystal with realistic refraction:
```tsx
import { MeshTransmissionMaterial } from '@react-three/drei'
<mesh>
  <sphereGeometry args={[1, 64, 64]} />
  <MeshTransmissionMaterial
    backside
    samples={16}
    resolution={512}
    transmission={1}
    roughness={0.0}
    thickness={0.5}
    ior={1.5}
    chromaticAberration={0.06}
    anisotropy={0.1}
    distortion={0.0}
    distortionScale={0.3}
    temporalDistortion={0.5}
    color="#ffffff"
  />
</mesh>
```

### MeshReflectorMaterial
Reflective floor/surface:
```tsx
import { MeshReflectorMaterial } from '@react-three/drei'
<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
  <planeGeometry args={[50, 50]} />
  <MeshReflectorMaterial
    blur={[300, 100]}
    resolution={1024}
    mixBlur={1}
    mixStrength={40}
    roughness={1}
    depthScale={1.2}
    minDepthThreshold={0.4}
    maxDepthThreshold={1.4}
    color="#101010"
    metalness={0.5}
  />
</mesh>
```

## Layout & Positioning

### Center
Centers children based on their bounding box:
```tsx
import { Center } from '@react-three/drei'
<Center>
  <mesh><boxGeometry args={[2, 1, 1]} /><meshStandardMaterial /></mesh>
</Center>
```

### Billboard
Makes children always face the camera:
```tsx
import { Billboard } from '@react-three/drei'
<Billboard follow={true}>
  <Text>Always facing you</Text>
</Billboard>
```

### Grid
A configurable ground grid:
```tsx
import { Grid } from '@react-three/drei'
<Grid
  position={[0, -0.01, 0]}
  args={[10, 10]}
  cellSize={0.5}
  cellThickness={0.5}
  cellColor="#6f6f6f"
  sectionSize={3}
  sectionThickness={1.5}
  sectionColor="#9d4b4b"
  fadeDistance={30}
  infiniteGrid
/>
```

## Performance

### Instances
Efficient rendering of many copies of the same geometry:
```tsx
import { Instances, Instance } from '@react-three/drei'
<Instances limit={1000}>
  <boxGeometry />
  <meshStandardMaterial />
  {positions.map((pos, i) => (
    <Instance key={i} position={pos} color="hotpink" />
  ))}
</Instances>
```

### Detailed
LOD (Level of Detail) based on camera distance:
```tsx
import { Detailed } from '@react-three/drei'
<Detailed distances={[0, 50, 150]}>
  <mesh><sphereGeometry args={[1, 64, 64]} /><meshStandardMaterial /></mesh>
  <mesh><sphereGeometry args={[1, 16, 16]} /><meshStandardMaterial /></mesh>
  <mesh><sphereGeometry args={[1, 4, 4]} /><meshStandardMaterial /></mesh>
</Detailed>
```

## Helpers

### Html
Embed HTML/CSS inside the 3D scene:
```tsx
import { Html } from '@react-three/drei'
<Html position={[0, 2, 0]} center transform>
  <div style={{ background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px', borderRadius: '8px' }}>
    <h3>Label</h3>
  </div>
</Html>
```

### Line
Draw lines between points:
```tsx
import { Line } from '@react-three/drei'
<Line
  points={[[0, 0, 0], [1, 1, 0], [2, 0, 0]]}
  color="cyan"
  lineWidth={2}
/>
```

### GradientTexture
Procedural gradient texture (no external URL needed):
```tsx
import { GradientTexture } from '@react-three/drei'
<mesh>
  <sphereGeometry args={[1, 64, 64]} />
  <meshBasicMaterial>
    <GradientTexture stops={[0, 0.5, 1]} colors={['#e63946', '#f1faee', '#a8dadc']} />
  </meshBasicMaterial>
</mesh>
```

## Common Scene Recipes

### Glass Sphere with Environment
```tsx
import { MeshTransmissionMaterial, Environment, Float } from '@react-three/drei'
export default function Scene() {
  return (
    <>
      <Float speed={1.5} rotationIntensity={0.5}>
        <mesh>
          <sphereGeometry args={[1, 64, 64]} />
          <MeshTransmissionMaterial backside transmission={1} thickness={0.5} roughness={0} ior={1.5} chromaticAberration={0.06} />
        </mesh>
      </Float>
      <Sparkles count={50} scale={5} size={1} color="gold" />
    </>
  )
}
```

### Particle Field
```tsx
import { useFrame } from '@react-three/fiber'
import { useRef, useMemo } from 'react'
import * as THREE from 'three'

export default function Scene() {
  const count = 500
  const meshRef = useRef()
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 10
    return pos
  }, [])

  useFrame((state) => {
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.05
  })

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#00ffff" sizeAttenuation />
    </points>
  )
}
```

### Animated Torus Knot with Distortion
```tsx
import { MeshDistortMaterial, Float } from '@react-three/drei'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function Scene() {
  const ref = useRef()
  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.3
  })
  return (
    <Float speed={2} rotationIntensity={0.5}>
      <mesh ref={ref}>
        <torusKnotGeometry args={[1, 0.3, 128, 32]} />
        <MeshDistortMaterial color="#8B5CF6" distort={0.3} speed={2} roughness={0.2} metalness={0.8} />
      </mesh>
    </Float>
  )
}
```
