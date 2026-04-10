# Phase 5b — `application/3d` Quality Upgrade

Bring `application/3d` from a 3.5/10 stub instruction up to the depth of the other upgraded artifact types. Phase 2 shipped `validate3d`; Phase 3 hardened the sanitizer. This phase rewrites the prompt with renderer-accurate guidance, a verified dep table, and working model URLs.

---

## Critical finding: Supabase model CDN is dead

The entire Supabase storage bucket used by the old prompt (`vazxmixjsiawhamofees.supabase.co`) **does not resolve at DNS level**. All 33 model URLs the old instruction listed (dog, cat, car, etc.) return DNS failure. Every model-loading artifact produced by the current system is broken on first render.

**Fix:** removed all Supabase URLs and replaced with verified-working KhronosGroup + three.js jsDelivr URLs. See "Verified model URLs" below.

---

## Renderer ground truth (from `r3f-renderer.tsx`)

### EXACT library versions (from importmap, lines 187-194)

| Library | Version | CDN |
|---|---|---|
| React | 18.3.1 | esm.sh |
| ReactDOM | 18.3.1 | esm.sh |
| Three.js | 0.170.0 | esm.sh |
| @react-three/fiber | 8.17.10 | esm.sh |
| @react-three/drei | 9.117.0 | esm.sh |
| Babel standalone | 7.26.10 | unpkg.com |

### Wrapper-provided elements (from `buildSrcdoc` App component, lines 303-316)

```jsx
<Canvas camera={{ position: [0, 2, 5], fov: 60 }}>
  <ambientLight intensity={0.5} />
  <directionalLight position={[5, 5, 5]} intensity={1} />
  <Environment preset="city" />
  <Suspense fallback={null}>
    <SceneErrorBoundary>
      <SceneComp />         ← your component here
    </SceneErrorBoundary>
  </Suspense>
  <OrbitControls makeDefault dampingFactor={0.05} />
</Canvas>
```

Background: `body { background: #0a0a0f }` (very dark, nearly black).

### EXACT DEP_NAMES (lines 139-147 — verbatim)

**React (12):** `React`, `useState`, `useEffect`, `useRef`, `useMemo`, `useCallback`, `Suspense`, `forwardRef`, `memo`, `createContext`, `useContext`, `Fragment`

**Three.js (1):** `THREE`

**@react-three/fiber (2):** `useFrame`, `useThree`

**@react-three/drei (20):** `useGLTF`, `useAnimations`, `Clone`, `Float`, `Sparkles`, `MeshDistortMaterial`, `MeshWobbleMaterial`, `Text`, `Sphere`, `RoundedBox`, `MeshTransmissionMaterial`, `Stars`, `Trail`, `Center`, `Billboard`, `Grid`, `Html`, `Line`, `GradientTexture`

**Total: 35 symbols.** Anything else → `ReferenceError`.

### Sanitizer behavior (Phase 3 hardened version)

1. Strip `'use client'`
2. Strip ALL `import ... from '...'` and `import '...'`
3. Strip `export default` (keep declaration)
4. Strip named `export`
5. Replace `<Canvas>...</Canvas>` with `<>...</>` (paired JSX-tag stripper)
6. Remove `<OrbitControls>` (self-closing and paired)
7. Remove `<Environment>` (self-closing and paired)
8. **Keep** `<color>` (Phase 3 fix — allows user-set scene backgrounds)

---

## Verified model URLs

### KhronosGroup (20 models verified — HTTP 200)

`https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/{Name}/glTF-Binary/{Name}.glb`

Fox, Duck, DamagedHelmet, Avocado, BrainStem, CesiumMan, CesiumMilkTruck, Lantern, ToyCar, BoomBox, WaterBottle, AntiqueCamera, BarramundiFish, CarConcept, DragonAttenuation, MaterialsVariantsShoe, ABeautifulGame, ChronographWatch, CommercialRefrigerator, SheenChair

**Dropped (404 at .glb path):** FlightHelmet (only .gltf multi-file), Suzanne (only .gltf multi-file), Engine, Sponza

### three.js jsDelivr (6 models verified — HTTP 200)

`https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/{Name}.glb`

Parrot, Flamingo, Stork, Soldier, Xbot, LittlestTokyo

### Supabase (REMOVED — entire bucket dead)

`vazxmixjsiawhamofees.supabase.co` DNS does not resolve. All 33 previously-listed models are gone. Zero replacements available from this CDN.

---

## Changes shipped

### `src/lib/prompts/artifacts/r3f.ts` — full rewrite

1. **Runtime Environment** — exact library versions, what the wrapper provides (camera position, fov, lights, environment preset, controls)
2. **Available Dependencies — Complete List** — every one of the 35 symbols, grouped by source, with example usage per drei helper (table)
3. **NOT available list** — explicitly names 15+ popular drei exports that are NOT in DEP_NAMES to prevent hallucination
4. **Required Component Shape** — export default, no Canvas, useFrame not RAF, useRef not document
5. **Loading 3D Models** — verified URL table (26 models), pattern code for static + animated models
6. **Animation Patterns** — rotation, float, scale pulse, orbit, delta-based motion
7. **Scale & Composition** — 1 unit ≈ 1m, per-model scale hints, lighting guidance
8. **Anti-Patterns** — 13 explicit items

**Examples:** two complete scenes
1. **Geometric primitives** — spinning shapes + Grid + materials + animation
2. **Animated Fox** — useGLTF + useAnimations + Billboard text + Sparkles

Both pass `validateArtifactContent("application/3d", ...)` with zero errors and zero warnings.

### `summary` updated

Old: "React Three Fiber Scene component rendered inside a pre-existing Canvas, with Drei helpers and glTF model loading."

New: "Interactive 3D scenes with React Three Fiber — primitives, glTF models, and animations inside a pre-existing Canvas with OrbitControls and Environment."

### No validator changes needed

The Phase 2 `validate3d` validator already checks everything the new instruction requires: forbidden elements, export default, non-whitelisted imports, document access, requestAnimationFrame. No gaps found.

---

## Validator ↔ instruction alignment

| Instruction rule | Validator | Notes |
|---|---|---|
| No `<Canvas>` | error | aligned |
| No `<OrbitControls>` | error | aligned |
| No `<Environment>` | error | aligned |
| No `document.*` | error | aligned |
| No `requestAnimationFrame` | error | aligned |
| No `new THREE.WebGLRenderer` | error | aligned |
| `export default` required | error | aligned |
| Non-whitelisted imports | warning | aligned (imports from unknown packages + unknown drei symbols) |
| No markdown fences | error | aligned |
| Only verified model URLs | NOT checked | instruction-only (would require HTTP HEAD at validation time) |
| delta-based animation | NOT checked | instruction-only (style guidance) |
| No allocations in useFrame | NOT checked | instruction-only (perf guidance) |

---

## Top 3 improvements vs prior stub

1. **Complete dep table with per-helper examples** — LLM now knows exactly which 35 symbols exist and how to use each one. The old stub listed deps as a wall of comma-separated names with no usage guidance.
2. **Dead Supabase CDN removed, 26 verified model URLs** — the old prompt's entire model library was broken. Every real-world object request would fail on render. The new prompt only lists URLs verified with HTTP 200 on 2026-04-10.
3. **Wrapper contract documented** — camera position `[0, 2, 5]`, fov 60, ambient+directional+Environment provided. LLM can now compose scenes that fit the camera frame instead of guessing.

## Architectural note

The R3F iframe has **no `sandbox` attribute** (audit Critical-2). LLM-authored code runs same-origin with `window.parent` access. This is an architectural risk that the prompt rewrite cannot fix — it needs a renderer-level change in a future phase.
