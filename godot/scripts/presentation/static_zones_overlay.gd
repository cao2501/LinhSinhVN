class_name StaticZonesOverlay
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 Static Scenario Zones Overlay
#
# Checkpoint: DEMO-01-C / C-09-C Spatial Environment & Landmark Presentation
# Renders static scenario features using pure CanvasItem primitives:
# - Canonical Shelter: EXACTLY 1 cell at (22, 22, z=0) (shelter_log_hollow)
# - Canonical Resource Zone: EXACTLY 24 cells at [20..25, 20..23, z=0] (rz_decaying_wood_patch)
#
# PRESENTATION ONLY:
# - WHERE ONLY: Zero resource storage, tracking, or depletion mechanics.
# - LANDMARK ONLY: Zero physics blocking or traversal mechanics.
# - Layer filtering is visual only: features only appear when active_z_layer == 0.
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

# Styling Tokens (Presentation-Only Palette)
@export var shelter_fill_color: Color = Color(0.65, 0.42, 0.22, 0.55)
@export var shelter_border_color: Color = Color(0.85, 0.60, 0.35, 0.95)
@export var shelter_cavity_color: Color = Color(0.20, 0.12, 0.08, 0.90)

@export var resource_fill_color: Color = Color(0.20, 0.60, 0.35, 0.35)
@export var resource_border_color: Color = Color(0.30, 0.85, 0.50, 0.80)
@export var resource_grain_color: Color = Color(0.25, 0.70, 0.40, 0.40)

var active_z_layer: int = 0

func _ready() -> void:
	queue_redraw()

func set_active_z_layer(z: int) -> void:
	if active_z_layer != z:
		active_z_layer = z
		queue_redraw()

func _draw() -> void:
	# Both canonical shelter and resource zone exist on layer z = 0.
	# Z-filtering is presentation-only: if active layer is not 0, do not draw layer 0 static features.
	if active_z_layer != 0:
		return

	var cell_sz: float = float(Config.CELL_SIZE)

	# 1. Render Resource Zone (rz_decaying_wood_patch): WHERE ONLY (24 cells = 6x4)
	var rz_rect: Rect2i = Config.RESOURCE_ZONE_RECT
	var rz_pixel_pos: Vector2 = Config.world_to_pixel(Vector2i(rz_rect.position.x, rz_rect.position.y))
	var rz_pixel_size: Vector2 = Vector2(float(rz_rect.size.x * Config.CELL_SIZE), float(rz_rect.size.y * Config.CELL_SIZE))
	var rz_draw_rect: Rect2 = Rect2(rz_pixel_pos, rz_pixel_size)

	# Base fill + Perimeter border
	draw_rect(rz_draw_rect, resource_fill_color, true)
	draw_rect(rz_draw_rect, resource_border_color, false, 1.5)

	# Deterministic organic texture grain lines (WHERE-only visual landmark indication)
	var step_y: float = float(Config.CELL_SIZE)
	for i in range(1, rz_rect.size.y):
		var line_y: float = rz_pixel_pos.y + float(i) * step_y
		draw_line(Vector2(rz_pixel_pos.x + 4.0, line_y), Vector2(rz_pixel_pos.x + rz_pixel_size.x - 4.0, line_y), resource_grain_color, 1.0)

	# 2. Render Shelter (shelter_log_hollow): EXACTLY ONE CELL at (22, 22)
	var shelter_coord: Vector3i = Config.SHELTER_COORDINATE
	var shelter_pixel_pos: Vector2 = Config.world_to_pixel(Vector2i(shelter_coord.x, shelter_coord.y))
	var shelter_pixel_size: Vector2 = Vector2(cell_sz, cell_sz)
	var shelter_draw_rect: Rect2 = Rect2(shelter_pixel_pos, shelter_pixel_size)

	# Timber body fill + Perimeter border
	draw_rect(shelter_draw_rect, shelter_fill_color, true)
	draw_rect(shelter_draw_rect, shelter_border_color, false, 2.0)

	# Hollow cavity entrance (darker centered cavity representing log interior)
	var cavity_inset: float = 3.5
	var cavity_rect: Rect2 = Rect2(
		shelter_pixel_pos + Vector2(cavity_inset, cavity_inset),
		shelter_pixel_size - Vector2(cavity_inset * 2.0, cavity_inset * 2.0)
	)
	draw_rect(cavity_rect, shelter_cavity_color, true)
