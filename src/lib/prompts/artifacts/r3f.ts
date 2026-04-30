export const r3fArtifact = {
  type: "application/3d" as const,
  label: "3D Scene",
  summary:
    "Interactive 3D scenes with React Three Fiber — primitives, glTF models, and animations inside a pre-existing Canvas with OrbitControls and Environment.",
  rules: `**application/3d — Interactive 3D R3F Scenes**

You write a single React component (the "Scene") that runs **inside** a pre-existing \`<Canvas>\`. The wrapper already provides the Canvas, camera, lights, orbit controls, and environment — your component only returns 3D content (\`<mesh>\`, \`<group>\`, drei helpers, etc.). Imports are stripped by the sanitizer and dependencies are injected as function arguments, so just use symbols directly.

## Runtime Environment

| Library | Version | Notes |
|---|---|---|
| React | 18.3.1 | All hooks available as direct symbols |
| Three.js | 0.170.0 | Available as \`THREE\` namespace |
| @react-three/fiber | 8.17.10 | \`useFrame\`, \`useThree\` |
| @react-three/drei | 9.117.0 | 19 helpers listed below |
| Babel standalone | 7.26.10 | JSX + TypeScript compiled before execution |

**What the wrapper provides (do NOT include these — they already exist):**
- \`<Canvas camera={{ position: [0, 2, 5], fov: 60 }}>\`
- \`<ambientLight intensity={0.5} />\`
- \`<directionalLight position={[5, 5, 5]} intensity={1} />\`
- \`<Environment preset="city" />\`
- \`<OrbitControls makeDefault dampingFactor={0.05} />\`
- \`<Suspense>\` wrapping your Scene component

Background is dark (\`#0a0a0f\`) by default. The scene renders in a full-viewport iframe.

**Override the background** (optional): emit \`<color attach="background" args={["#hex"]} />\` as a top-level child of your returned group to set a custom Canvas background. The renderer preserves this tag intentionally — it's the only \`<color>\` element supported. Example: \`<color attach="background" args={["#1a1a2e"]} />\`.

## Available Dependencies — Complete List

These are the **only** symbols available at runtime. Anything not in this table will throw \`ReferenceError\`.

### React
\`React\`, \`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`Suspense\`, \`forwardRef\`, \`memo\`, \`createContext\`, \`useContext\`, \`Fragment\`

### Three.js
\`THREE\` — the full Three.js namespace. Access via \`THREE.Vector3\`, \`THREE.Color\`, \`THREE.MathUtils\`, etc.

### @react-three/fiber
\`useFrame\` — render loop: \`useFrame((state, delta) => { ... })\`. Use \`delta\` for frame-rate-independent animation. **Never allocate objects inside useFrame** (no \`new THREE.Vector3()\` per frame — create outside and reuse).
\`useThree\` — access renderer state: \`const { camera, gl, scene, size, viewport } = useThree()\`.

### @react-three/drei helpers (19 total)
| Symbol | What it does |
|---|---|
| \`useGLTF\` | Load .glb/.gltf models: \`const { scene, animations } = useGLTF(url)\` |
| \`useAnimations\` | Play model animations: \`const { actions } = useAnimations(animations, ref)\` |
| \`Clone\` | Efficiently clone a loaded model: \`<Clone object={scene} />\` |
| \`Float\` | Gentle floating animation: \`<Float speed={1.5} floatIntensity={2}>...</Float>\` |
| \`Sparkles\` | Particle sparkles: \`<Sparkles count={100} scale={4} />\` |
| \`Stars\` | Starfield background: \`<Stars radius={100} count={5000} />\` |
| \`Text\` | 3D text (troika): \`<Text fontSize={0.5} color="white">Hello</Text>\` |
| \`Center\` | Auto-center children: \`<Center>...</Center>\` |
| \`Billboard\` | Always face camera: \`<Billboard>...</Billboard>\` |
| \`Grid\` | Ground grid: \`<Grid args={[20, 20]} />\` |
| \`Html\` | HTML overlay in 3D space: \`<Html position={[0, 2, 0]}>...</Html>\` |
| \`Line\` | 3D line: \`<Line points={[[0,0,0],[1,1,1]]} color="red" />\` |
| \`Trail\` | Motion trail behind moving objects |
| \`Sphere\` | Shorthand: \`<Sphere args={[1, 32, 32]}><meshStandardMaterial /></Sphere>\` |
| \`RoundedBox\` | Box with rounded edges: \`<RoundedBox args={[1, 1, 1]} radius={0.1}>...</RoundedBox>\` |
| \`MeshDistortMaterial\` | Wobbly distortion material: \`<MeshDistortMaterial distort={0.4} speed={2} />\` |
| \`MeshWobbleMaterial\` | Wave wobble material: \`<MeshWobbleMaterial factor={1} speed={2} />\` |
| \`MeshTransmissionMaterial\` | Glass/transmission: \`<MeshTransmissionMaterial transmission={1} thickness={0.5} />\` |
| \`GradientTexture\` | Gradient fill: \`<GradientTexture stops={[0, 1]} colors={["#e63946", "#1d3557"]} />\` |

**NOT available** (will crash): \`OrbitControls\`, \`Environment\`, \`PerspectiveCamera\`, \`Sky\`, \`Cloud\`, \`Bounds\`, \`PivotControls\`, \`TransformControls\`, \`Reflector\`, \`ContactShadows\`, \`AccumulativeShadows\`, \`RandomizedLight\`, \`Decal\`, \`useTexture\`, \`useProgress\`, \`Preload\`, \`Leva\`, and any other drei export not listed above.

## Required Component Shape

\`\`\`jsx
export default function Scene() {
  const ref = useRef()
  useFrame((state, delta) => {
    ref.current.rotation.y += delta * 0.5
  })
  return (
    <group>
      <mesh ref={ref}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>
    </group>
  )
}
\`\`\`

- **MUST** \`export default\` a function component. The renderer detects the component name from it.
- **MUST** be a function component, not a class.
- Top-level return should be \`<group>\`, \`<mesh>\`, or \`<>\` (Fragment). **NEVER** return \`<Canvas>\`.
- Use \`useFrame\` for animation, **NEVER** \`requestAnimationFrame\`.
- Use \`useRef\` for direct object access, **NEVER** \`document.querySelector\`.
- You can write helper components — just make sure one is the default export.

## Loading 3D Models

For real-world objects (animals, vehicles, furniture, characters) **always use \`useGLTF()\`** to load a pre-made model. Building complex objects from primitive boxes and spheres looks terrible.

### Verified working model URLs

**KhronosGroup glTF samples** (most reliable CDN):
\`https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb\`

| Name | Type | Notes |
|---|---|---|
| Fox | animated animal | scale 0.02, has Walk/Survey/Run animations |
| Duck | static object | classic yellow rubber duck |
| DamagedHelmet | static prop | sci-fi helmet, great for material showcase |
| Avocado | static food | small, scale up ~20 |
| BrainStem | animated character | skeletal animation |
| CesiumMan | animated character | walking human |
| CesiumMilkTruck | animated vehicle | milk truck with wheel animation |
| Lantern | static prop | Japanese lantern |
| ToyCar | static vehicle | toy car |
| BoomBox | static prop | retro boombox |
| WaterBottle | static object | PBR water bottle |
| AntiqueCamera | static prop | vintage camera |
| BarramundiFish | static animal | fish |
| CarConcept | static vehicle | concept car |
| DragonAttenuation | static creature | translucent dragon |
| MaterialsVariantsShoe | static object | shoe with material variants |
| ABeautifulGame | static scene | chess set |
| ChronographWatch | static object | watch |
| CommercialRefrigerator | static appliance | fridge |
| SheenChair | static furniture | chair |

**three.js examples via jsDelivr** (animated birds + characters):
\`https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb\`

| Name | Type | Notes |
|---|---|---|
| Parrot | animated bird | flying animation, colorful |
| Flamingo | animated bird | flying animation |
| Stork | animated bird | flying animation |
| Soldier | animated character | idle + walk |
| Xbot | animated character | humanoid |
| LittlestTokyo | animated scene | large city scene, heavy |

### Model loading patterns

**Static model (rotate slowly):**
\`\`\`jsx
function MyModel() {
  const { scene } = useGLTF("https://raw.githubusercontent.com/.../Duck/glTF-Binary/Duck.glb")
  const ref = useRef()
  useFrame((_, delta) => { ref.current.rotation.y += delta * 0.3 })
  return <primitive ref={ref} object={scene} scale={2} />
}
\`\`\`

**Animated model (play animation):**
\`\`\`jsx
function AnimatedFox() {
  const { scene, animations } = useGLTF("https://raw.githubusercontent.com/.../Fox/glTF-Binary/Fox.glb")
  const { actions } = useAnimations(animations, scene)
  useEffect(() => { actions["Walk"]?.play() }, [actions])
  return <primitive object={scene} scale={0.02} />
}
\`\`\`

## Animation Patterns

- **Rotation:** \`useFrame((_, delta) => { ref.current.rotation.y += delta * 0.5 })\`
- **Float effect:** wrap in \`<Float speed={1.5} floatIntensity={2}>...</Float>\`
- **Scale pulse:** \`ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime) * 0.1)\`
- **Orbit:** \`ref.current.position.set(Math.cos(t) * r, 0, Math.sin(t) * r)\` where \`t = state.clock.elapsedTime\`
- Always use \`delta\` for frame-rate-independent motion. Never hardcode per-frame increments like \`+= 0.01\`.

## Scale & Composition

- 1 unit ≈ 1 meter. Keep objects in the 0.5–5 range for good camera framing (camera at \`[0, 2, 5]\`).
- Place objects near the origin. The orbit controls target defaults to \`[0, 0, 0]\`.
- KhronosGroup models vary in scale — the Fox needs \`scale={0.02}\`, the Avocado needs \`scale={20}\`, most others are fine at \`scale={1-3}\`.
- The wrapper provides ambient + directional + environment lighting. You usually don't need extra lights. If the scene looks dark, add a point light: \`<pointLight position={[10, 10, 10]} intensity={1} />\`.

## Anti-Patterns

- ❌ \`<Canvas>\` — wrapper provides it, sanitizer strips it
- ❌ \`<OrbitControls>\` — wrapper provides it, sanitizer strips it
- ❌ \`<Environment>\` — wrapper provides it, sanitizer strips it
- ❌ \`import\` statements — stripped by sanitizer, deps are injected directly
- ❌ \`requestAnimationFrame\` — use \`useFrame\`
- ❌ \`document.querySelector\` / \`document.getElementById\` — use \`useRef\`
- ❌ \`new THREE.WebGLRenderer\` — Canvas handles this
- ❌ Allocating objects inside \`useFrame\` (\`new THREE.Vector3()\` per frame is a memory leak)
- ❌ Building real-world objects from primitive boxes/spheres — use glTF models
- ❌ Model URLs not from the verified CDN lists above
- ❌ Wrapping output in markdown fences
- ❌ Missing \`export default\`
- ❌ Truncation — output the complete scene`,
  examples: [
    {
      label: "Geometric primitives — floating shapes with materials and animation",
      code: `const SHAPES = [
  { pos: [-2, 0.5, 0], color: "#e63946", geo: "box" },
  { pos: [0, 1, 0], color: "#457b9d", geo: "sphere" },
  { pos: [2, 0.5, 0], color: "#2a9d8f", geo: "torus" },
]

function Shape({ position, color, geo }) {
  const ref = useRef()
  useFrame((state, delta) => {
    ref.current.rotation.x += delta * 0.3
    ref.current.rotation.y += delta * 0.5
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.3
  })
  return (
    <mesh ref={ref} position={position} castShadow>
      {geo === "box" && <boxGeometry args={[1, 1, 1]} />}
      {geo === "sphere" && <sphereGeometry args={[0.7, 32, 32]} />}
      {geo === "torus" && <torusGeometry args={[0.6, 0.25, 16, 48]} />}
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  )
}

export default function Scene() {
  const groupRef = useRef()
  useFrame((_, delta) => {
    groupRef.current.rotation.y += delta * 0.1
  })
  return (
    <group ref={groupRef}>
      {SHAPES.map((s, i) => (
        <Shape key={i} position={s.pos} color={s.color} geo={s.geo} />
      ))}
      <Grid args={[20, 20]} position={[0, -0.5, 0]} cellColor="#444" sectionColor="#666" fadeDistance={15} />
    </group>
  )
}`,
    },
    {
      label: "Animated Fox model — useGLTF + useAnimations + Float",
      code: `const FOX_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb"

function Fox() {
  const { scene, animations } = useGLTF(FOX_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    const walk = actions["Walk"]
    if (walk) {
      walk.reset().fadeIn(0.5).play()
    }
    return () => walk?.fadeOut(0.5)
  }, [actions])

  return <primitive object={scene} scale={0.02} position={[0, -0.5, 0]} />
}

function FloatingLabel() {
  return (
    <Billboard position={[0, 2.5, 0]}>
      <Text fontSize={0.4} color="#f8fafc" anchorY="bottom">
        Arctic Fox
      </Text>
    </Billboard>
  )
}

export default function Scene() {
  const platformRef = useRef()
  useFrame((_, delta) => {
    platformRef.current.rotation.y += delta * 0.15
  })
  return (
    <group ref={platformRef}>
      <Fox />
      <FloatingLabel />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <circleGeometry args={[2.5, 64]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.8} />
      </mesh>
      <Sparkles count={40} scale={5} size={2} speed={0.4} opacity={0.5} />
    </group>
  )
}`,
    },
  ] as { label: string; code: string }[],
}
