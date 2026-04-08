export const r3fArtifact = {
  type: "application/3d" as const,
  label: "R3F 3D Scene",
  summary:
    "React Three Fiber Scene component rendered inside a pre-existing Canvas, with Drei helpers and glTF model loading.",
  rules: `**application/3d — Interactive 3D R3F Scenes**
Write ONLY the Scene component — your code runs INSIDE an already-existing <Canvas>. NEVER EVER import or render <Canvas>, <OrbitControls>, or <Environment> — they crash the scene because they already exist in the parent wrapper.
Your component must only return 3D elements like <mesh>, <group>, <points>, Drei helpers, etc.
Example: export default function Scene() { return (<group><mesh><boxGeometry /><meshStandardMaterial color='hotpink' /></mesh></group>) }
Allowed imports: react (all hooks), @react-three/fiber (useFrame, useThree — but NOT Canvas), @react-three/drei (useGLTF, useAnimations, Clone, Float, Sparkles, MeshDistortMaterial, MeshWobbleMaterial, Text, Sphere, RoundedBox, MeshTransmissionMaterial, Stars, Trail, Center, Billboard, Grid, Html, Line, GradientTexture — but NOT OrbitControls, NOT Environment).
PREFER LOADING REAL 3D MODELS: When the user asks for a real-world object (animal, vehicle, furniture, food, character, etc.), ALWAYS use useGLTF() to load a pre-made 3D model instead of building from primitive geometries. Building dogs/cats/cars from boxes and spheres looks terrible — use the model library instead. Only use primitive geometries for abstract/geometric scenes.
Available model CDNs: (1) Supabase (PREFERRED for common objects): https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/{name}/model.gltf — models: dog, cat, bear, horse, fish, car, truck, spaceship, rocket, airplane, chair-wood, armchair, sofa, table, tree-pine, tree-beech, flower, cactus, rock, house, castle, robot, astronaut, sword, guitar, laptop, globe, diamond, crown, apple, banana, pizza, donut. (2) KhronosGroup: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb — models: Fox (animated, scale 0.02), Duck, DamagedHelmet, Avocado, BrainStem, CesiumMan, FlightHelmet, Lantern, ToyCar, Suzanne, BoomBox, WaterBottle. (3) three.js via jsDelivr: https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb — models: Parrot, Flamingo, Stork (animated birds), Soldier, Xbot (animated characters), LittlestTokyo.
Usage: const { scene } = useGLTF(url); return <primitive object={scene} scale={1} />. For animations: const { scene, animations } = useGLTF(url); const { actions } = useAnimations(animations, scene); useEffect(() => { actions['Walk']?.play(); }, [actions]); return <primitive object={scene} />.
CRITICAL RULES: (1) Do NOT import Canvas. (2) Do NOT import OrbitControls or Environment. (3) Do NOT wrap output in <Canvas>. (4) Use useFrame for animations, never requestAnimationFrame. (5) Always export default your scene component. (6) Only use URLs from the CDNs listed above. (7) ALWAYS prefer useGLTF models over primitive geometry for real objects.`,
  examples: [] as { label: string; code: string }[],
}
