class_name WorldGridCanvas
extends Node2D

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01 World Grid Canvas Renderer
#
# Checkpoint: DEMO-01-C / C-02 Spatial Grid Presentation
# Responsible solely for drawing 50x50 grid lines, outer world boundary,
# and visual layer context.
#
# PRESENTATION ONLY: ZERO simulation authority.
# No movement, no adjacency, no pathfinding, no topology calculation.
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

# Visual Styling
@export var grid_line_color: Color = Color(0.2, 0.25, 0.32, 0.35)
@export var boundary_color: Color = Color(0.35, 0.45, 0.6, 0.85)
@export var origin_marker_color: Color = Color(0.8, 0.3, 0.3, 0.8)
@export var grid_line_width: float = 1.0
@export var boundary_line_width: float = 2.0

var active_z_layer: int = 0

func _ready() -> void:
	queue_redraw()

func set_active_z_layer(z: int) -> void:
	if active_z_layer != z:
		active_z_layer = z
		queue_redraw()

func _draw() -> void:
	var width_px: float = float(Config.WORLD_PIXEL_WIDTH)
	var height_px: float = float(Config.WORLD_PIXEL_HEIGHT)
	var cell_sz: float = float(Config.CELL_SIZE)

	# 1. Draw 50x50 grid lines
	# Vertical lines (from x = 0 to 50)
	for x in range(Config.WORLD_WIDTH + 1):
		var px: float = float(x) * cell_sz
		draw_line(Vector2(px, 0.0), Vector2(px, height_px), grid_line_color, grid_line_width)

	# Horizontal lines (from y = 0 to 50)
	for y in range(Config.WORLD_HEIGHT + 1):
		var py: float = float(y) * cell_sz
		draw_line(Vector2(0.0, py), Vector2(width_px, py), grid_line_color, grid_line_width)

	# 2. Draw outer world boundary rect (crisp border)
	draw_rect(Rect2(0.0, 0.0, width_px, height_px), boundary_color, false, boundary_line_width)

	# 3. Draw origin marker indicator at (0, 0)
	draw_rect(Rect2(0.0, 0.0, cell_sz, cell_sz), origin_marker_color, false, 1.5)
