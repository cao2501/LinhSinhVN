class_name OrganismMorphology
extends RefCounted

# Visual Presentation Constants (Local Pixel Dimensions at Scale = 1.0)
# These are visual rendering metrics, NOT biological dimensions.
const BASE_EGG_RADIUS_X: float = 3.5
const BASE_EGG_RADIUS_Y: float = 4.5

const BASE_LARVA_WIDTH: float = 10.0
const BASE_LARVA_HEIGHT: float = 6.0
const LARVA_SEGMENTS: int = 3

const BASE_PUPA_WIDTH: float = 10.0
const BASE_PUPA_HEIGHT: float = 7.0

const BASE_ADULT_ELYTRA_WIDTH: float = 12.0
const BASE_ADULT_ELYTRA_HEIGHT: float = 8.0
const BASE_ADULT_PRONOTUM_WIDTH: float = 8.0
const BASE_ADULT_PRONOTUM_HEIGHT: float = 5.0
const BASE_ADULT_HEAD_WIDTH: float = 5.0
const BASE_ADULT_HEAD_HEIGHT: float = 4.0

const BASE_CEPHALIC_HORN_LENGTH: float = 6.0
const BASE_THORACIC_HORN_LENGTH: float = 4.5

const BASE_LEG_LENGTH: float = 5.0
const BASE_CLAW_SPREAD: float = 2.0

# Chitin Pigment Presentation Palette Ramp (Presentation-Only Visual Ramp)
const CHITIN_LIGHT: Color = Color(0.68, 0.48, 0.28, 1.0) # Amber / Tan
const CHITIN_DARK: Color = Color(0.12, 0.07, 0.05, 1.0)  # Deep Mahogany / Obsidian

# Authoritative Visual Phenotype Bounds (for validation and safety detection)
const BOUND_BODY_SCALE_MIN: float = 0.42
const BOUND_BODY_SCALE_MAX: float = 1.50
const BOUND_PIGMENT_MIN: float = 0.0
const BOUND_PIGMENT_MAX: float = 1.0
const BOUND_CEPHALIC_HORN_MIN: float = 0.0
const BOUND_CEPHALIC_HORN_MAX: float = 2.25
const BOUND_THORACIC_HORN_MIN: float = 0.0
const BOUND_THORACIC_HORN_MAX: float = 1.80
const BOUND_TARSAL_GRIP_MIN: float = 0.80
const BOUND_TARSAL_GRIP_MAX: float = 2.50

## Validates whether an organism presentation dictionary contains valid, finite visual phenotype fields.
## Does NOT fabricate defaults on invalid input.
static func validate_phenotype(org: Dictionary) -> bool:
	var b: Variant = org.get("body_scale_index", null)
	var p: Variant = org.get("cuticle_pigment_ratio", null)
	var ch: Variant = org.get("cephalic_horn_scale", null)
	var th: Variant = org.get("thoracic_horn_scale", null)
	var tg: Variant = org.get("tarsal_grip_index", null)

	if b == null or p == null or ch == null or th == null or tg == null:
		return false

	if typeof(b) != TYPE_FLOAT and typeof(b) != TYPE_INT:
		return false
	if typeof(p) != TYPE_FLOAT and typeof(p) != TYPE_INT:
		return false
	if typeof(ch) != TYPE_FLOAT and typeof(ch) != TYPE_INT:
		return false
	if typeof(th) != TYPE_FLOAT and typeof(th) != TYPE_INT:
		return false
	if typeof(tg) != TYPE_FLOAT and typeof(tg) != TYPE_INT:
		return false

	var fb: float = float(b)
	var fp: float = float(p)
	var fch: float = float(ch)
	var fth: float = float(th)
	var ftg: float = float(tg)

	if is_nan(fb) or is_inf(fb) or is_nan(fp) or is_inf(fp) or is_nan(fch) or is_inf(fch) or is_nan(fth) or is_inf(fth) or is_nan(ftg) or is_inf(ftg):
		return false

	if fb < BOUND_BODY_SCALE_MIN or fb > BOUND_BODY_SCALE_MAX:
		return false
	if fp < BOUND_PIGMENT_MIN or fp > BOUND_PIGMENT_MAX:
		return false
	if fch < BOUND_CEPHALIC_HORN_MIN or fch > BOUND_CEPHALIC_HORN_MAX:
		return false
	if fth < BOUND_THORACIC_HORN_MIN or fth > BOUND_THORACIC_HORN_MAX:
		return false
	if ftg < BOUND_TARSAL_GRIP_MIN or ftg > BOUND_TARSAL_GRIP_MAX:
		return false

	return true

## Pure presentation projection: calculates local geometry parameters from authoritative phenotype fields.
## Contains zero simulation authority, zero RNG, zero internal genetics references, and zero biological logic.
static func calculate_morphology(org: Dictionary) -> Dictionary:
	var valid: bool = validate_phenotype(org)
	var stage_id: String = String(org.get("current_stage_id", "STAGE_EGG"))

	if not valid:
		return {
			"is_valid": false,
			"stage_id": stage_id,
			"body_scale": 1.0,
			"cuticle_color": Color(0.5, 0.5, 0.5, 1.0),
			"cephalic_horn_len": 0.0,
			"thoracic_horn_len": 0.0,
			"tarsal_leg_len": 0.0,
			"tarsal_claw_spread": 0.0,
			"egg_rx": BASE_EGG_RADIUS_X,
			"egg_ry": BASE_EGG_RADIUS_Y,
			"larva_width": BASE_LARVA_WIDTH,
			"larva_height": BASE_LARVA_HEIGHT,
			"pupa_width": BASE_PUPA_WIDTH,
			"pupa_height": BASE_PUPA_HEIGHT,
			"adult_elytra_w": BASE_ADULT_ELYTRA_WIDTH,
			"adult_elytra_h": BASE_ADULT_ELYTRA_HEIGHT,
			"adult_pronotum_w": BASE_ADULT_PRONOTUM_WIDTH,
			"adult_pronotum_h": BASE_ADULT_PRONOTUM_HEIGHT,
			"adult_head_w": BASE_ADULT_HEAD_WIDTH,
			"adult_head_h": BASE_ADULT_HEAD_HEIGHT
		}

	var body_scale: float = float(org.get("body_scale_index"))
	var pigment_ratio: float = float(org.get("cuticle_pigment_ratio"))
	var cephalic_horn: float = float(org.get("cephalic_horn_scale"))
	var thoracic_horn: float = float(org.get("thoracic_horn_scale"))
	var tarsal_grip: float = float(org.get("tarsal_grip_index"))

	# Presentation color ramp interpolation
	var cuticle_color: Color = CHITIN_LIGHT.lerp(CHITIN_DARK, pigment_ratio)

	# Pure multiplicative geometric transforms
	var cephalic_horn_len: float = BASE_CEPHALIC_HORN_LENGTH * cephalic_horn * body_scale
	var thoracic_horn_len: float = BASE_THORACIC_HORN_LENGTH * thoracic_horn * body_scale
	var tarsal_leg_len: float = BASE_LEG_LENGTH * (tarsal_grip / 1.50) * body_scale
	var tarsal_claw_spread: float = BASE_CLAW_SPREAD * (tarsal_grip / 1.50)

	return {
		"is_valid": true,
		"stage_id": stage_id,
		"body_scale": body_scale,
		"cuticle_color": cuticle_color,
		"cephalic_horn_len": cephalic_horn_len,
		"thoracic_horn_len": thoracic_horn_len,
		"tarsal_leg_len": tarsal_leg_len,
		"tarsal_claw_spread": tarsal_claw_spread,
		"egg_rx": BASE_EGG_RADIUS_X * body_scale,
		"egg_ry": BASE_EGG_RADIUS_Y * body_scale,
		"larva_width": BASE_LARVA_WIDTH * body_scale,
		"larva_height": BASE_LARVA_HEIGHT * body_scale,
		"pupa_width": BASE_PUPA_WIDTH * body_scale,
		"pupa_height": BASE_PUPA_HEIGHT * body_scale,
		"adult_elytra_w": BASE_ADULT_ELYTRA_WIDTH * body_scale,
		"adult_elytra_h": BASE_ADULT_ELYTRA_HEIGHT * body_scale,
		"adult_pronotum_w": BASE_ADULT_PRONOTUM_WIDTH * body_scale,
		"adult_pronotum_h": BASE_ADULT_PRONOTUM_HEIGHT * body_scale,
		"adult_head_w": BASE_ADULT_HEAD_WIDTH * body_scale,
		"adult_head_h": BASE_ADULT_HEAD_HEIGHT * body_scale
	}
