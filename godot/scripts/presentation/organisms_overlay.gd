class_name OrganismsOverlay
extends Node2D

const Config = preload("res://scripts/presentation/demo_world_config.gd")
const Morphology = preload("res://scripts/presentation/organism_morphology.gd")

# Canonical Stage Colors (Fallback / Baseline Palettes)
const STAGE_COLORS: Dictionary = {
	"STAGE_EGG": {
		"fill": Color(0.961, 0.941, 0.863, 1.0),   # #F5F0DC
		"outline": Color(0.741, 0.706, 0.627, 1.0) # #BDB4A0
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

	# 2. Render each cell group with deterministic stacking (pure position offsets)
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
			_draw_organism(group[0], origin + Vector2(8.0, 8.0))
			_draw_stack_badge(origin, count - 1)

func _draw_ellipse(pos: Vector2, rx: float, ry: float, color: Color) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	const SEGMENTS: int = 16
	for i in range(SEGMENTS):
		var theta: float = float(i) * TAU / float(SEGMENTS)
		points.append(pos + Vector2(cos(theta) * rx, sin(theta) * ry))
	draw_colored_polygon(points, color)

func _draw_ellipse_outline(pos: Vector2, rx: float, ry: float, color: Color, width: float = 1.0) -> void:
	var points: PackedVector2Array = PackedVector2Array()
	const SEGMENTS: int = 16
	for i in range(SEGMENTS + 1):
		var theta: float = float(i) * TAU / float(SEGMENTS)
		points.append(pos + Vector2(cos(theta) * rx, sin(theta) * ry))
	draw_polyline(points, color, width)

func _draw_organism(org: Dictionary, center: Vector2) -> void:
	var is_alive: bool = bool(org.get("is_alive", true))
	var stage_id: String = String(org.get("current_stage_id", "STAGE_EGG"))
	var sex: String = String(org.get("sex", "ASEXUAL"))
	var action_intent: String = String(org.get("action_intent", "IDLE"))
	var progress_variant: Variant = org.get("developmental_progress", null)

	# Pure procedural morphology calculation
	var morph: Dictionary = Morphology.calculate_morphology(org)
	if not morph["is_valid"]:
		push_warning("[OrganismsOverlay] Invalid visual phenotype for organism %s; rendering safe baseline" % [str(org.get("organism_id", "unknown"))])

	var body_scale: float = float(morph["body_scale"])
	var sex_color: Color = SEX_ACCENT_COLORS.get(sex, Color(0.74, 0.74, 0.74, 1.0))
	var body_color: Color = morph["cuticle_color"]
	var outline_color: Color = body_color.darkened(0.4)

	if not is_alive:
		body_color = DEAD_COLOR
		outline_color = DEAD_COLOR
		sex_color = DEAD_COLOR

	# 1. Render Shadow (Local Ellipse)
	var shadow_rx: float = 5.0 * body_scale
	var shadow_ry: float = 3.0 * body_scale
	_draw_ellipse(center + Vector2(0.0, 2.0), shadow_rx, shadow_ry, Color(0.0, 0.0, 0.0, 0.20))

	# 2. Render Tarsal Legs / Claws (ADULT Stage Only)
	if stage_id == "STAGE_ADULT" and is_alive:
		var leg_len: float = float(morph["tarsal_leg_len"])
		var claw_spread: float = float(morph["tarsal_claw_spread"])
		var leg_color: Color = outline_color
		var leg_y_offsets: Array = [-2.0, 1.0, 4.0]
		for ly in leg_y_offsets:
			var y_pos: float = float(ly) * body_scale
			var left_joint: Vector2 = center + Vector2(-float(morph["adult_pronotum_w"]) * 0.4, y_pos)
			var left_tip: Vector2 = left_joint + Vector2(-leg_len, -claw_spread if float(ly) < 0.0 else claw_spread)
			draw_line(left_joint, left_tip, leg_color, 1.2)
			var right_joint: Vector2 = center + Vector2(float(morph["adult_pronotum_w"]) * 0.4, y_pos)
			var right_tip: Vector2 = right_joint + Vector2(leg_len, -claw_spread if float(ly) < 0.0 else claw_spread)
			draw_line(right_joint, right_tip, leg_color, 1.2)

	# 3..7. Render Stage-Specific Procedural Morphology
	match stage_id:
		"STAGE_EGG":
			var rx: float = float(morph["egg_rx"])
			var ry: float = float(morph["egg_ry"])
			_draw_ellipse(center, rx, ry, body_color)
			_draw_ellipse_outline(center, rx, ry, outline_color, 1.0)

		"STAGE_LARVA":
			var w: float = float(morph["larva_width"])
			var h: float = float(morph["larva_height"])
			var seg_w: float = w / 3.0
			for s in range(3):
				var seg_center: Vector2 = center + Vector2((float(s) - 1.0) * seg_w * 0.85, 0.0)
				var seg_radius: float = (h * 0.5) * (1.0 - abs(float(s) - 1.0) * 0.15)
				draw_circle(seg_center, seg_radius, body_color)
				draw_arc(seg_center, seg_radius, 0.0, TAU, 12, outline_color, 1.0)

		"STAGE_PUPA":
			var pw: float = float(morph["pupa_width"])
			var ph: float = float(morph["pupa_height"])
			var pupa_rect: Rect2 = Rect2(center - Vector2(pw * 0.5, ph * 0.5), Vector2(pw, ph))
			draw_rect(pupa_rect, body_color, true)
			draw_rect(pupa_rect, outline_color, false, 1.2)
			draw_line(Vector2(center.x - pw * 0.4, center.y), Vector2(center.x + pw * 0.4, center.y), outline_color, 1.0)

		"STAGE_ADULT":
			# Elytra / Abdomen
			var ew: float = float(morph["adult_elytra_w"])
			var eh: float = float(morph["adult_elytra_h"])
			var elytra_center: Vector2 = center + Vector2(0.0, 2.0 * body_scale)
			var elytra_rect: Rect2 = Rect2(elytra_center - Vector2(ew * 0.5, eh * 0.5), Vector2(ew, eh))
			draw_rect(elytra_rect, body_color, true)
			draw_rect(elytra_rect, outline_color, false, 1.2)
			draw_line(Vector2(elytra_center.x, elytra_rect.position.y), Vector2(elytra_center.x, elytra_rect.end.y), outline_color, 1.0)

			# Pronotum / Thorax
			var pw: float = float(morph["adult_pronotum_w"])
			var ph: float = float(morph["adult_pronotum_h"])
			var thorax_center: Vector2 = center + Vector2(0.0, -3.0 * body_scale)
			var thorax_rect: Rect2 = Rect2(thorax_center - Vector2(pw * 0.5, ph * 0.5), Vector2(pw, ph))
			draw_rect(thorax_rect, body_color.darkened(0.15), true)
			draw_rect(thorax_rect, outline_color, false, 1.2)

			# Thoracic Horn (projects anteriorly from thorax if scale > 0.0)
			var th_len: float = float(morph["thoracic_horn_len"])
			if th_len > 0.0 and is_alive:
				var th_base: Vector2 = thorax_center + Vector2(0.0, -ph * 0.4)
				var th_tip: Vector2 = th_base + Vector2(0.0, -th_len)
				draw_line(th_base, th_tip, outline_color, 2.0)

			# Head Plate
			var hw: float = float(morph["adult_head_w"])
			var hh: float = float(morph["adult_head_h"])
			var head_center: Vector2 = thorax_center + Vector2(0.0, -(ph * 0.5 + hh * 0.4))
			var head_rect: Rect2 = Rect2(head_center - Vector2(hw * 0.5, hh * 0.5), Vector2(hw, hh))
			draw_rect(head_rect, body_color.darkened(0.25), true)
			draw_rect(head_rect, outline_color, false, 1.0)

			# Cephalic Horn (projects anteriorly from head if scale > 0.0)
			var ch_len: float = float(morph["cephalic_horn_len"])
			if ch_len > 0.0 and is_alive:
				var ch_base: Vector2 = head_center + Vector2(0.0, -hh * 0.4)
				var ch_tip: Vector2 = ch_base + Vector2(0.0, -ch_len)
				draw_line(ch_base, ch_tip, outline_color, 2.0)
				var fork_span: float = 1.5 * body_scale
				draw_line(ch_tip, ch_tip + Vector2(-fork_span, -1.5), outline_color, 1.2)
				draw_line(ch_tip, ch_tip + Vector2(fork_span, -1.5), outline_color, 1.2)

		_:
			draw_circle(center, 3.0, body_color)

	# 8. Render Sex Accent Ring
	if is_alive:
		var accent_r: float = 6.0 * body_scale
		draw_arc(center, accent_r, 0.0, TAU, 16, sex_color, 1.0)

	# 9. Render Developmental Progress Arc
	if is_alive:
		var is_numeric: bool = (typeof(progress_variant) == TYPE_FLOAT or typeof(progress_variant) == TYPE_INT)
		var is_valid_p: bool = false
		var p: float = 0.0

		if is_numeric:
			p = float(progress_variant)
			if not is_nan(p) and not is_inf(p) and p >= 0.0 and p <= 1.0:
				is_valid_p = true

		if not is_valid_p:
			push_warning("[OrganismsOverlay] Invalid developmental_progress %s for organism %s — omitted arc" % [str(progress_variant), str(org.get("organism_id", "unknown"))])
		else:
			if p > 0.0:
				var arc_r: float = 7.5 * body_scale
				var end_angle: float = p * TAU
				draw_arc(center, arc_r, -PI * 0.5, -PI * 0.5 + end_angle, 20, Color(0.2, 0.8, 0.9, 0.8), 1.2)

	# 10. Render Action Intent Indicator Dot
	if is_alive:
		var action_color: Color = ACTION_COLORS.get(action_intent, Color(0.7, 0.7, 0.7, 1.0))
		var dot_pos: Vector2 = center + Vector2(5.5, -5.5) * body_scale
		draw_circle(dot_pos, 1.5, action_color)

	# 11. Render Dead Organism 'X' Cross Marker
	if not is_alive:
		var x_half: float = 4.5 * body_scale
		draw_line(center - Vector2(x_half, x_half), center + Vector2(x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)
		draw_line(center - Vector2(-x_half, x_half), center + Vector2(-x_half, x_half), Color(0.3, 0.3, 0.3, 0.9), 1.5)

func _draw_stack_badge(origin: Vector2, extra_count: int) -> void:
	var badge_pos: Vector2 = origin + Vector2(12.0, 4.0)
	var badge_text: String = "+%d" % extra_count
	draw_circle(badge_pos, 4.0, Color(0.15, 0.15, 0.15, 0.9))
	draw_arc(badge_pos, 4.0, 0.0, TAU, 12, Color(1.0, 1.0, 1.0, 0.95), 1.0)
	var font: Font = ThemeDB.fallback_font
	if font != null:
		draw_string(font, badge_pos + Vector2(-3.0, 3.0), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color.WHITE)
