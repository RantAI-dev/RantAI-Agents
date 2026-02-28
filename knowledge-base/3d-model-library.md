# 3D Model Library — Free GLB/GLTF Models for R3F Scenes

This is a catalog of free, CORS-enabled 3D models you can load with `useGLTF` in React Three Fiber scenes. All URLs are direct links that work in sandboxed iframes.

## How to Load Models

```tsx
// Basic model loading
const { scene } = useGLTF(MODEL_URL);
return <primitive object={scene} scale={1} />;

// With animations
const { scene, animations } = useGLTF(MODEL_URL);
const { actions } = useAnimations(animations, scene);
useEffect(() => { actions['Walk']?.play(); }, [actions]);
return <primitive object={scene} scale={1} />;

// Clone for multiple instances (prevents shared geometry issues)
const { scene } = useGLTF(MODEL_URL);
return <Clone object={scene} scale={1} />;
```

---

## Source 1: Pmndrs Market (Supabase CDN)

Base URL: `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/`
Pattern: `{model-name}/model.gltf`
CORS: Yes (public Supabase bucket)
License: CC0 / MIT

### Animals
| Model | URL |
|-------|-----|
| Dog | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/dog/model.gltf` |
| Cat | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/cat/model.gltf` |
| Bear | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bear/model.gltf` |
| Horse | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/horse/model.gltf` |
| Fish | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/fish/model.gltf` |
| Parrot | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/parrot/model.gltf` |
| Flamingo | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/flamingo/model.gltf` |
| Stork | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/stork/model.gltf` |

### Vehicles
| Model | URL |
|-------|-----|
| Car | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/car/model.gltf` |
| Low Poly Car | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/low-poly-car/model.gltf` |
| Truck | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/truck/model.gltf` |
| Spaceship | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/spaceship/model.gltf` |
| Rocket | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/rocket/model.gltf` |
| Airplane | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/airplane/model.gltf` |
| Boat | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/boat/model.gltf` |
| Bicycle | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bicycle/model.gltf` |

### Furniture
| Model | URL |
|-------|-----|
| Chair (Wood) | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/chair-wood/model.gltf` |
| Armchair | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/armchair/model.gltf` |
| Sofa | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/sofa/model.gltf` |
| Table | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/table/model.gltf` |
| Desk | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/desk/model.gltf` |
| Bookshelf | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bookshelf/model.gltf` |
| Bed | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bed/model.gltf` |
| Lamp | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/lamp/model.gltf` |
| Bench | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bench-2/model.gltf` |

### Nature & Plants
| Model | URL |
|-------|-----|
| Tree (Pine) | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-pine/model.gltf` |
| Tree (Beech) | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-beech/model.gltf` |
| Tree (Lime) | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-lime/model.gltf` |
| Flower | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/flower/model.gltf` |
| Cactus | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/cactus/model.gltf` |
| Mushroom | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/mushroom/model.gltf` |
| Rock | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/rock/model.gltf` |

### Buildings & Architecture
| Model | URL |
|-------|-----|
| House | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/house/model.gltf` |
| Castle | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/castle/model.gltf` |
| Windmill | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/windmill/model.gltf` |
| Tower | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tower/model.gltf` |
| Bridge | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/bridge/model.gltf` |

### Food
| Model | URL |
|-------|-----|
| Apple | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/apple/model.gltf` |
| Banana | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/banana/model.gltf` |
| Pizza | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/pizza/model.gltf` |
| Donut | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/donut/model.gltf` |
| Cake | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/cake/model.gltf` |
| Cup | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/cup/model.gltf` |

### Characters & People
| Model | URL |
|-------|-----|
| Robot | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/robot/model.gltf` |
| Astronaut | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/astronaut/model.gltf` |
| Knight | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/knight/model.gltf` |

### Objects & Props
| Model | URL |
|-------|-----|
| Sword | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/sword/model.gltf` |
| Shield | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/shield/model.gltf` |
| Chest | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/chest/model.gltf` |
| Guitar | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/guitar/model.gltf` |
| Camera | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/camera/model.gltf` |
| Phone | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/phone/model.gltf` |
| Laptop | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/laptop/model.gltf` |
| Globe | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/globe/model.gltf` |
| Diamond | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/diamond/model.gltf` |
| Crown | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/crown/model.gltf` |
| Key | `https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/key/model.gltf` |

---

## Source 2: KhronosGroup glTF Sample Assets (GitHub)

Base URL: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/`
Pattern: `{ModelName}/glTF-Binary/{ModelName}.glb`
CORS: Yes (`access-control-allow-origin: *`)
License: Various CC / Public Domain

### Animated Models (with animation clips)
| Model | URL | Notes |
|-------|-----|-------|
| Fox | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb` | Walk, Run, Survey animations |
| BrainStem | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BrainStem/glTF-Binary/BrainStem.glb` | Robot character with walk animation |
| CesiumMan | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb` | Walking humanoid |
| RiggedFigure | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/RiggedFigure/glTF-Binary/RiggedFigure.glb` | Simple rigged humanoid |

### Showcase Models (PBR quality)
| Model | URL | Notes |
|-------|-----|-------|
| DamagedHelmet | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb` | Iconic PBR test model |
| FlightHelmet | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/FlightHelmet/glTF-Binary/FlightHelmet.glb` | Detailed flight helmet |
| Lantern | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb` | Old lantern prop |
| WaterBottle | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/WaterBottle/glTF-Binary/WaterBottle.glb` | Glass water bottle |
| Corset | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Corset/glTF-Binary/Corset.glb` | Corset garment |
| SheenChair | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/SheenChair/glTF-Binary/SheenChair.glb` | Fabric sheen chair |
| MaterialsVariantsShoe | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb` | Sneaker with material variants |
| IridescenceLamp | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/IridescenceLamp/glTF-Binary/IridescenceLamp.glb` | Lamp with iridescence |
| ToyCar | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb` | Toy car |
| AntiqueCamera | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AntiqueCamera/glTF-Binary/AntiqueCamera.glb` | Vintage camera |

### Simple Objects
| Model | URL | Notes |
|-------|-----|-------|
| Duck | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Duck/glTF-Binary/Duck.glb` | Classic rubber duck |
| Avocado | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb` | Small avocado |
| BarramundiFish | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BarramundiFish/glTF-Binary/BarramundiFish.glb` | Textured fish |
| BoomBox | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoomBox/glTF-Binary/BoomBox.glb` | Retro boombox |
| Suzanne | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Suzanne/glTF-Binary/Suzanne.glb` | Blender monkey head |

---

## Source 3: three.js Examples (jsDelivr CDN — VERIFIED CORS)

Base URL: `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/`
Pattern: `{ModelName}.glb`
CORS: Verified `access-control-allow-origin: *`
License: Various open source

### Animated Birds & Characters
| Model | URL | Notes |
|-------|-----|-------|
| Parrot | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Parrot.glb` | Animated flying parrot |
| Flamingo | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Flamingo.glb` | Animated flying flamingo |
| Stork | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Stork.glb` | Animated flying stork |
| Soldier | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Soldier.glb` | Animated walking soldier |
| Xbot | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/Xbot.glb` | Animated robot character |
| LittlestTokyo | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/LittlestTokyo.glb` | Animated Japanese scene |

---

## Source 4: Pmndrs Market CDN (DigitalOcean Spaces)

Base URL: `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/`
Pattern: `{model-name}/model.gltf`
CORS: Yes
License: CC0

| Model | URL |
|-------|-----|
| Suzanne (High Poly) | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/suzanne-high-poly/model.gltf` |
| Macbook | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/macbook/model.gltf` |
| iPhone | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/iphone-x/model.gltf` |
| Watch | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/watch/model.gltf` |
| Headphones | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/headphones/model.gltf` |
| Shoe | `https://market-assets.fra1.cdn.digitaloceanspaces.com/market-assets/models/shoe/model.gltf` |

---

## Usage Examples

### Load a Fox with Walk Animation
```tsx
function AnimatedFox() {
  const { scene, animations } = useGLTF('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb');
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    actions['Walk']?.reset().fadeIn(0.5).play();
  }, [actions]);

  return <primitive object={scene} scale={0.02} position={[0, 0, 0]} />;
}
```

### Load a Dog Model
```tsx
function Dog() {
  const { scene } = useGLTF('https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/dog/model.gltf');
  return <primitive object={scene} scale={1} position={[0, 0, 0]} />;
}
```

### Load a Damaged Helmet (PBR showcase)
```tsx
function Helmet() {
  const { scene } = useGLTF('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb');
  const ref = useRef();
  useFrame((state, delta) => {
    ref.current.rotation.y += delta * 0.3;
  });
  return <primitive ref={ref} object={scene} scale={1.5} />;
}
```

### Load a Model with Auto-Rotate
```tsx
function RotatingModel({ url, scale = 1 }) {
  const { scene } = useGLTF(url);
  const ref = useRef();
  useFrame((_, delta) => { ref.current.rotation.y += delta * 0.5; });
  return <primitive ref={ref} object={scene} scale={scale} />;
}
```

## Tips for the AI
- Always wrap model components in `<Suspense fallback={null}>` (already provided by the App wrapper)
- Use `<primitive object={scene} />` to render loaded models
- Adjust `scale` based on model size — Khronos models vary wildly in scale (Fox needs ~0.02, DamagedHelmet is ~1.5)
- Use `useAnimations` to play animation clips from models that have them
- Use `Clone` component when you need multiple copies of the same model
- For models from Supabase CDN, the URL pattern is predictable: replace the model name in the URL slug
- For KhronosGroup models, use the `/glTF-Binary/{Name}.glb` path for fastest loading (single file)
- Always position models using `position={[x, y, z]}` on the primitive, not on a parent group (to avoid transform stacking issues)
