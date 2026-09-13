# ==============================================================================
# LinhSinhVN — DEMO-01-C / C-03: Organisms Presentation Overlay
# File: godot/scripts/presentation/organisms_overlay.gd
# Base: 4bdf2ae
#
# PRESENTATION-ONLY VISUAL LAYER.
# - Renders organism markers on the 800x800 world canvas via single _draw() call.
# - ZERO child nodes per organism (Option B locked).
# - ZERO visual scaling: fixed dimensions per lifecycle stage regardless of stack count.
# - ZERO simulation authority: no IPC calls, no movement, no lifecycle calculation.
# - ZERO biological inference: no thresholding on stored_energy or biomass.
# - Strict developmental_progress validation without source data mutation.
# - Pure, deterministic coordinate-to-pixel placement and same-cell stacking.
# - Pure Z-layer presentation filtering: visible if pos.z == active_z_layer, else skipped.
# - Dead organisms retain spatial representation with desaturated cross marker.
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

# --- Visual Styling Tokens ---
const STAGE_COLORS: Dictionary = {
	"STAGE_EGG": {
		"fill": Color(1.0, 0.976, 0.769, 1.0),    # #FFF9C4
		"outline": Color(0.984, 0.753, 0.176, 1.0) # #FBC02D
	},
	"STAGE_LARVA": {
		"fill": Color(0.784, 0.902, 0.788, 1.0),   # #C8E6C9
		"outline": Color(0.298, 0.686, 0.314, 1.0) # #4CAF50
	},
	"STAGE_PUPA": {
		"fill": Color(0.843, 0.800, 0.784, 1.0),   # #D7CCC8
		"outline": Color(0.553, 0.431, 0.388, 1.0) # #8D6E63
	},
	"STAGE_ADULT": {
		"fill": Color(0.553, 0.431, 0.388, 1.0),   # #8D6E63
		"outline": Color(0.306, 0.204, 0.180, 1.0) # #4E342E
	}
}

const SEX_ACCENT_COLORS: Dictionary = {
	"MALE": Color(0.161, 0.714, 0.965, 1.0),          # #29B6F6
	"FEMALE": Color(0.925, 0.251, 0.478, 1.0),        # #EC407A
	"ASEXUAL": Color(0.741, 0.741, 0.741, 1.0),       # #BDBDBD
	"HERMAPHRODITE": Color(0.741, 0.741, 0.741, 1.0)  # #BDBDBD
}

const ACTION_COLORS: Dictionary = {
	"FORAGE": Color(0.263, 0.627, 0.278, 1.0),       # #43A047
	"REST": Color(0.471, 0.565, 0.612, 1.0),         # #78909C
	"SEEK_SHELTER": Color(1.0, 0.627, 0.0, 1.0),     # #FFA000
	"FLEE": Color(0.898, 0.224, 0.208, 1.0),         # #E53935
	"SEEK_MATE": Color(0.671, 0.278, 0.737, 1.0),    # #AB47BC
	"EXPLORE": Color(0.118, 0.533, 0.898, 1.0),      # #1E88E5
	"NONE": Color(0.741, 0.741, 0.741, 1.0),         # #BDBDBD
	"IDLE": Color(0.741, 0.741, 0.741, 1.0)          # #BDBDBD
}

const DEAD_COLOR: Color = Color(0.459, 0.459, 0.459, 0.55) # #757575 (55% alpha)

# Presentation Cache
var active_z_layer: int = 0
var _cached_organisms: Array = []

func _ready() -> void:
	z_index = 20
	queue_redraw()

func set_active_z_layer(new_layer: int) -> void:
	if active_z_layer != new_layer:
		active_z_layer = new_layer
		queue_redraw()

func apply_snapshot_organisms(organisms: Array) -> void:
	# Store shallow copy of dictionaries to avoid mutating caller references
	_cached_organisms.clear()
	for org in organisms:
		if typeof(org) == TYPE_DICTIONARY:
			_cached_organisms.append(org)
	queue_redraw()

func _draw() -> void:
	if _cached_organisms.is_empty():
		return

	# 1. Group organisms by coordinate string key "x_y_z"
	var cell_groups: Dictionary = {}
	for org in _cached_organisms:
		var pos: Variant = org.get("position", null)
		if typeof(pos) != TYPE_DICTIONARY:
			continue
		var x: int = int(pos.get("x", 0))
		var y: int = int(pos.get("y", 0))
		var z: int = int(pos.get("z", 0))

		# Z-layer presentation filtering: only render organisms on active layer
		if z != active_z_layer:
			continue

		var key: String = "%d_%d_%d" % [x, y, z]
		if not cell_groups.has(key):
			cell_groups[key] = []
		cell_groups[key].append(org)

	# 2. Render each cell group with deterministic stacking (pure position offsets, zero scaling)
	for key in cell_groups.keys():
		var group: Array = cell_groups[key]
		# Deterministic sort by organism_id ASC (code-point lexical)
		group.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return String(a.get("organism_id", "")) < String(b.get("organism_id", ""))
		)

		var count: int = group.size()
		var first_pos: Dictionary = group[0].get("position", {})
		var cell_x: int = int(first_pos.get("x", 0))
		var cell_y: int = int(first_pos.get("y", 0))
		var origin: Vector2 = Config.world_to_pixel(Vector2i(cell_x, cell_y))

		if count == 1:
			_draw_organism(group[0], origin + Vector2(8.0, 8.0))
		elif count == 2:
			_draw_organism(group[0], origin + Vector2(5.0, 8.0))
			_draw_organism(group[1], origin + Vector2(11.0, 8.0))
		elif count == 3:
			_draw_organism(group[0], origin + Vector2(5.0, 5.0))
			_draw_organism(group[1], origin + Vector2(11.0, 5.0))
			_draw_organism(group[2], origin + Vector2(8.0, 11.0))
		elif count == 4:
			_draw_organism(group[0], origin + Vector2(5.0, 5.0))
			_draw_organism(group[1], origin + Vector2(11.0, 5.0))
			_draw_organism(group[2], origin + Vector2(5.0, 11.0))
			_draw_organism(group[3], origin + Vector2(11.0, 11.0))
		else:
			# N > 4: Render top deterministic organism centered + draw count badge with text
			_draw_organism(group[0], origin + Vector2(8.0, 8.0))
			_draw_stack_badge(origin, count - 1)

func _draw_organism(org: Dictionary, center: Vector2) -> void:
	var is_alive: bool = bool(org.get("is_alive", true))
	var stage_id: String = String(org.get("current_stage_id", "STAGE_EGG"))
	var sex: String = String(org.get("sex", "ASEXUAL"))
	var action_intent: String = String(org.get("action_intent", "IDLE"))
	var progress_variant: Variant = org.get("developmental_progress", null)

	# Determine palette based on alive status
	var fill_color: Color
	var outline_color: Color
	var sex_color: Color = SEX_ACCENT_COLORS.get(sex, Color(0.74, 0.74, 0.74, 1.0))

	if not is_alive:
		fill_color = DEAD_COLOR
		outline_color = DEAD_COLOR
		sex_color = DEAD_COLOR
	else:
		var colors: Dictionary = STAGE_COLORS.get(stage_id, STAGE_COLORS["STAGE_EGG"])
		fill_color = colors["fill"]
		outline_color = colors["outline"]

	# 1. Render 100% Fixed Stage Glyph Dimensions (ZERO scaling)
	match stage_id:
		"STAGE_EGG":
			var r: float = 3.5
			draw_circle(center, r, fill_color)
			draw_arc(center, r, 0.0, TAU, 16, outline_color, 1.0)
		"STAGE_LARVA":
			var sz: Vector2 = Vector2(10.0, 6.0)
			var rect: Rect2 = Rect2(center - sz * 0.5, sz)
			draw_rect(rect, fill_color, true)
			draw_rect(rect, outline_color, false, 1.0)
		"STAGE_PUPA":
			var sz: Vector2 = Vector2(10.0, 7.0)
			var rect: Rect2 = Rect2(center - sz * 0.5, sz)
			draw_rect(rect, fill_color, true)
			draw_rect(rect, outline_color, false, 1.2)
		"STAGE_ADULT":
			var sz: Vector2 = Vector2(12.0, 10.0)
			var rect: Rect2 = Rect2(center - sz * 0.5, sz)
			draw_rect(rect, fill_color, true)
			draw_rect(rect, outline_color, false, 1.5)
		_:
			# Fallback glyph
			draw_circle(center, 3.0, fill_color)

	# 2. Render Sex Accent Ring (Fixed Radius)
	if is_alive:
		var accent_r: float = 5.5
		draw_arc(center, accent_r, 0.0, TAU, 16, sex_color, 1.0)

	# 3. Render Developmental Progress Arc (Strict Contract Validation)
	# Valid: numeric, finite, not NaN, 0.0 <= p <= 1.0.
	# p == 0.0: valid -> do NOT draw arc, do NOT warn.
	# p > 0.0: valid -> draw arc from 0 to p * TAU.
	# Invalid: negative, >1, NaN, Inf, non-numeric -> push_warning, do NOT draw arc.
	if is_alive:
		var is_numeric: bool = (typeof(progress_variant) == TYPE_FLOAT or typeof(progress_variant) == TYPE_INT)
		var is_valid: bool = false
		var p: float = 0.0

		if is_numeric:
			p = float(progress_variant)
			if not is_nan(p) and not is_inf(p) and p >= 0.0 and p <= 1.0:
				is_valid = true

		if not is_valid:
			push_warning("[OrganismsOverlay] Invalid developmental_progress %s for organism %s — omitted arc" % [str(progress_variant), str(org.get("organism_id", "unknown"))])
		else:
			if p > 0.0:
				var arc_r: float = 6.8
				var end_angle: float = p * TAU
				draw_arc(center, arc_r, -PI * 0.5, -PI * 0.5 + end_angle, 20, Color(0.2, 0.8, 0.9, 0.8), 1.2)

	# 4. Render Action Intent Indicator Dot (Fixed Top-Right Offset & Radius)
	if is_alive:
		var action_color: Color = ACTION_COLORS.get(action_intent, Color(0.7, 0.7, 0.7, 1.0))
		var dot_pos: Vector2 = center + Vector2(4.5, -4.5)
		draw_circle(dot_pos, 1.5, action_color)

	# 5. Render Dead Organism 'X' Cross Marker (Fixed Extent)
	if not is_alive:
		var x_half: float = 4.0
		draw_line(center - Vector2(x_half, x_half), center + Vector2(x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)
		draw_line(center - Vector2(-x_half, x_half), center + Vector2(-x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)

func _draw_stack_badge(origin: Vector2, extra_count: int) -> void:
	# Visible badge at top-right corner of cell indicating hidden count "+N"
	var badge_pos: Vector2 = origin + Vector2(12.0, 4.0)
	var badge_text: String = "+%d" % extra_count

	# Circular badge backing
	draw_circle(badge_pos, 4.0, Color(0.15, 0.15, 0.15, 0.9))
	draw_arc(badge_pos, 4.0, 0.0, TAU, 12, Color(1.0, 1.0, 1.0, 0.95), 1.0)

	# Text rendering using Godot built-in fallback font
	var font: Font = ThemeDB.fallback_font
	if font != null:
		draw_string(font, badge_pos + Vector2(-3.0, 3.0), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color.WHITE)
