import { describe, it, expect } from "vitest"
import { parseOpenApiSpec } from "@/lib/openapi/parser"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const OPENAPI_V3_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pet Store", version: "1.0.0" },
  servers: [{ url: "https://api.petstore.com/v1" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer" }, description: "Max items" },
        ],
        responses: { "200": { description: "OK" } },
      },
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  tag: { type: "string" },
                },
                required: ["name"],
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/pets/{petId}": {
      get: {
        operationId: "getPet",
        summary: "Get a pet",
        parameters: [
          { name: "petId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
})

const SWAGGER_V2_SPEC = JSON.stringify({
  swagger: "2.0",
  info: { title: "Legacy API", version: "0.1.0" },
  host: "api.legacy.com",
  basePath: "/v2",
  schemes: ["https"],
  paths: {
    "/users": {
      get: {
        operationId: "listUsers",
        summary: "List users",
        parameters: [
          { name: "page", in: "query", type: "integer", description: "Page number" },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
})

const SPEC_WITH_REFS = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Ref Test", version: "1.0.0" },
  servers: [{ url: "https://api.test.com" }],
  paths: {
    "/items": {
      post: {
        operationId: "createItem",
        summary: "Create item",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Item" },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { $ref: "#/components/schemas/Category" },
        },
        required: ["name"],
      },
      Category: {
        type: "object",
        properties: {
          id: { type: "integer" },
          label: { type: "string" },
        },
      },
    },
  },
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("parseOpenApiSpec", () => {
  describe("OpenAPI 3.x", () => {
    it("parses title and version", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      expect(result.title).toBe("Pet Store")
      expect(result.version).toBe("1.0.0")
    })

    it("extracts server URL", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      expect(result.serverUrl).toBe("https://api.petstore.com/v1")
    })

    it("parses all endpoints", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      expect(result.endpoints).toHaveLength(3)
    })

    it("parses GET with query parameters", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      const listPets = result.endpoints.find((e) => e.operationId === "listPets")!
      expect(listPets.method).toBe("GET")
      expect(listPets.path).toBe("/pets")
      expect(listPets.summary).toBe("List all pets")
      expect(listPets.parameters.properties).toHaveProperty("limit")
    })

    it("parses POST with request body and merges into parameters", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      const createPet = result.endpoints.find((e) => e.operationId === "createPet")!
      expect(createPet.method).toBe("POST")
      expect(createPet.parameters.properties).toHaveProperty("name")
      expect(createPet.parameters.properties).toHaveProperty("tag")
      expect(createPet.parameters.required).toContain("name")
    })

    it("parses path parameters with required flag", () => {
      const result = parseOpenApiSpec(OPENAPI_V3_SPEC)
      const getPet = result.endpoints.find((e) => e.operationId === "getPet")!
      expect(getPet.parameters.properties).toHaveProperty("petId")
      expect(getPet.parameters.required).toContain("petId")
    })
  })

  describe("Swagger 2.x", () => {
    it("parses title and version", () => {
      const result = parseOpenApiSpec(SWAGGER_V2_SPEC)
      expect(result.title).toBe("Legacy API")
      expect(result.version).toBe("0.1.0")
    })

    it("constructs server URL from host + basePath + scheme", () => {
      const result = parseOpenApiSpec(SWAGGER_V2_SPEC)
      expect(result.serverUrl).toBe("https://api.legacy.com/v2")
    })

    it("parses endpoints with query params (type field instead of schema)", () => {
      const result = parseOpenApiSpec(SWAGGER_V2_SPEC)
      const listUsers = result.endpoints.find((e) => e.operationId === "listUsers")!
      expect(listUsers.parameters.properties).toHaveProperty("page")
    })
  })

  describe("$ref resolution", () => {
    it("resolves top-level $ref in request body", () => {
      const result = parseOpenApiSpec(SPEC_WITH_REFS)
      const createItem = result.endpoints.find((e) => e.operationId === "createItem")!
      expect(createItem.requestBody).toBeDefined()
      expect(createItem.requestBody!.properties).toHaveProperty("name")
    })

    it("resolves nested $ref (Category inside Item)", () => {
      const result = parseOpenApiSpec(SPEC_WITH_REFS)
      const createItem = result.endpoints.find((e) => e.operationId === "createItem")!
      const category = createItem.requestBody!.properties!.category as Record<string, unknown>
      expect(category.type).toBe("object")
      expect(category.properties).toHaveProperty("id")
      expect(category.properties).toHaveProperty("label")
    })
  })

  describe("YAML format", () => {
    it("parses YAML input", () => {
      const yamlSpec = `
openapi: "3.0.0"
info:
  title: YAML API
  version: "2.0.0"
servers:
  - url: https://yaml.api.com
paths:
  /health:
    get:
      operationId: healthCheck
      summary: Health check
      responses:
        "200":
          description: OK
`
      const result = parseOpenApiSpec(yamlSpec)
      expect(result.title).toBe("YAML API")
      expect(result.endpoints).toHaveLength(1)
      expect(result.endpoints[0].operationId).toBe("healthCheck")
    })
  })

  describe("error handling", () => {
    it("throws for invalid JSON/YAML", () => {
      expect(() => parseOpenApiSpec("{{{bad")).toThrow("Invalid spec")
    })

    it("throws for missing version field", () => {
      expect(() => parseOpenApiSpec(JSON.stringify({ info: { title: "No version" } }))).toThrow(
        "missing openapi or swagger version"
      )
    })

    it("throws for unsupported version", () => {
      expect(() =>
        parseOpenApiSpec(JSON.stringify({ openapi: "1.0", info: { title: "Old" } }))
      ).toThrow("Unsupported spec version")
    })

    it("generates operationId when not provided", () => {
      const spec = JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/users/{userId}": {
            get: {
              summary: "Get user",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      })
      const result = parseOpenApiSpec(spec)
      expect(result.endpoints[0].operationId).toBe("get_users_by_id")
    })

    it("defaults title to 'Untitled API' when missing", () => {
      const spec = JSON.stringify({
        openapi: "3.0.0",
        info: {},
        paths: {},
      })
      const result = parseOpenApiSpec(spec)
      expect(result.title).toBe("Untitled API")
    })
  })
})
