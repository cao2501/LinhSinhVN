class_name OrganismInterpolator
extends RefCounted

# ==============================================================================
# LinhSinhVN Presentation Shell — DEMO-01-C / C-09-D Organism Interpolator
#
# PURE MATHEMATICAL HELPER FOR PRESENTATION-ONLY VISUAL INTERPOLATION.
# - Pure, stateless mathematical utilities.
# - ZERO scene tree, node, or IPC dependencies.
# - ZERO SnapshotSynchronizer or simulation world knowledge.
# - ZERO RNG, zero pathfinding, zero collision, zero biological inference.
# ==============================================================================

const Config = preload("res://scripts/presentation/demo_world_config.gd")

static func calculate_pixel_center(grid_x: int, grid_y: int) -> Vector2:
	return Config.world_to_pixel(Vector2i(grid_x, grid_y)) + Vector2(float(Config.CELL_SIZE) * 0.5, float(Config.CELL_SIZE) * 0.5)

static func interpolate_position(source_px: Vector2, target_px: Vector2, alpha: float) -> Vector2:
	var clamped_alpha: float = clampf(alpha, 0.0, 1.0)
	return source_px.lerp(target_px, clamped_alpha)

static func advance_alpha(current_alpha: float, delta: float, duration: float) -> float:
	if duration <= 0.0:
		return 1.0
	return minf(1.0, current_alpha + delta / duration)
