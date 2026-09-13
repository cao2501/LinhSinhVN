class_name DemoWorldConfig
extends RefCounted

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 Static Presentation Fixture
#
# WARNING: NON-AUTHORITATIVE PRESENTATION FIXTURE
# This file exists solely to provide static layout and geometry data to the
# Godot presentation shell for DEMO-01. It has ZERO simulation authority.
# It does NOT advance simulation time, mutate coordinates, execute biology,
# or manage demographic state.
#
# Authoritative simulation state resides exclusively in Node.js headless core.
# ==============================================================================

# --- World Geometry (Canonical Demo Dimensions) ---
const WORLD_WIDTH: int = 50
const WORLD_HEIGHT: int = 50
const Z_MIN: int = -1
const Z_MAX: int = 2
const Z_LAYERS: Array[int] = [-1, 0, 1, 2]

# --- Rendering Layout ---
const CELL_SIZE: int = 16
const WORLD_PIXEL_WIDTH: int = 800
const WORLD_PIXEL_HEIGHT: int = 800
const WORLD_CENTER_PIXEL: Vector2 = Vector2(400.0, 400.0)

# --- Canonical Static Shelter Fixture ---
# Canonical shelter: shelter_log_hollow at (22, 22, 0)
# Canonical footprint: EXACTLY ONE CELL. Never 2x2.
const SHELTER_ID: String = "shelter_log_hollow"
const SHELTER_COORDINATE: Vector3i = Vector3i(22, 22, 0)
const SHELTER_CELL_COUNT: int = 1

# --- Canonical Static Resource Zone Fixture ---
# Canonical resource zone: rz_decaying_wood_patch at x=20..25, y=20..23, z=0
# Canonical footprint: 6 cols x 4 rows = 24 cells.
const RESOURCE_ZONE_ID: String = "rz_decaying_wood_patch"
const RESOURCE_ZONE_RECT: Rect2i = Rect2i(20, 20, 6, 4)
const RESOURCE_ZONE_Z: int = 0
const RESOURCE_ZONE_CELL_COUNT: int = 24

# --- Pure Coordinate Mapping (Deterministic & Lossless) ---
static func world_to_pixel(coord: Vector2i, origin: Vector2 = Vector2.ZERO) -> Vector2:
	return Vector2(origin.x + float(coord.x * CELL_SIZE), origin.y + float(coord.y * CELL_SIZE))

static func pixel_to_world(pixel: Vector2, origin: Vector2 = Vector2.ZERO) -> Vector2i:
	return Vector2i(int(floor((pixel.x - origin.x) / float(CELL_SIZE))), int(floor((pixel.y - origin.y) / float(CELL_SIZE))))

static func is_in_bounds(coord: Vector3i) -> bool:
	return coord.x >= 0 and coord.x < WORLD_WIDTH and coord.y >= 0 and coord.y < WORLD_HEIGHT and coord.z >= Z_MIN and coord.z <= Z_MAX

static func get_world_pixel_size() -> Vector2:
	return Vector2(float(WORLD_PIXEL_WIDTH), float(WORLD_PIXEL_HEIGHT))

static func get_world_center_pixel() -> Vector2:
	return WORLD_CENTER_PIXEL
