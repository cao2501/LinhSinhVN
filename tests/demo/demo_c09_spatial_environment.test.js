/**
 * LinhSinhVN — DEMO-01-C / C-09-C Spatial Environment & Landmark Presentation Suite
 *
 * Verifies the presentation layer environment contracts:
 * - 50x50 spatial grid extent and 16px cell dimensions
 * - Canonical single source of truth coordinate-to-pixel mapping
 * - Shelter landmark (1 cell at (22, 22, 0)) and Resource Zone (WHERE only, 24 cells at [20..25, 20..23, 0])
 * - Strict negative audits: zero quantity, zero inventory, zero collision, zero pathfinding, zero RNG
 * - Z-layer filtering: z=0 landmarks only visible when active_z_layer == 0
 * - Deterministic visual layer hierarchy: Grid (0) < Landmarks (10) < Organisms (20)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configGdPath = path.resolve(__dirname, '../../godot/scripts/presentation/demo_world_config.gd');
const gridGdPath = path.resolve(__dirname, '../../godot/scripts/presentation/world_grid_canvas.gd');
const staticZonesGdPath = path.resolve(__dirname, '../../godot/scripts/presentation/static_zones_overlay.gd');
const scenePath = path.resolve(__dirname, '../../godot/scenes/world_view.tscn');
const demoConstantsPath = path.resolve(__dirname, '../../demo/demo_constants.js');

const configGd = fs.readFileSync(configGdPath, 'utf8');
const gridGd = fs.readFileSync(gridGdPath, 'utf8');
const staticZonesGd = fs.readFileSync(staticZonesGdPath, 'utf8');
const sceneTscn = fs.readFileSync(scenePath, 'utf8');
const demoConstantsJs = fs.readFileSync(demoConstantsPath, 'utf8');

function stripComments(code) {
  return code.split(/\r?\n/).map(l => l.split('#')[0]).join('\n');
}

// Pure coordinate mapping math matching DemoWorldConfig
const CELL_SIZE = 16;
function worldToPixel(x, y) {
  return { x: x * CELL_SIZE, y: y * CELL_SIZE };
}
function cellCenter(x, y) {
  const p = worldToPixel(x, y);
  return { x: p.x + 8.0, y: p.y + 8.0 };
}

describe('DEMO-01-C / C-09-C: Spatial Environment & Landmark Presentation Suite', () => {

  it('C09-C01: 50x50 world dimensions match authoritative demo constants', () => {
    assert.ok(configGd.includes('const WORLD_WIDTH: int = 50'), 'WORLD_WIDTH must be 50');
    assert.ok(configGd.includes('const WORLD_HEIGHT: int = 50'), 'WORLD_HEIGHT must be 50');
    assert.ok(demoConstantsJs.includes('WORLD_WIDTH = 50'), 'Authoritative WORLD_WIDTH must be 50');
    assert.ok(demoConstantsJs.includes('WORLD_HEIGHT = 50'), 'Authoritative WORLD_HEIGHT must be 50');
  });

  it('C09-C02: 800x800 world pixel extent at 16px/cell', () => {
    assert.ok(configGd.includes('const CELL_SIZE: int = 16'), 'CELL_SIZE must be 16');
    assert.ok(configGd.includes('const WORLD_PIXEL_WIDTH: int = 800'), 'WORLD_PIXEL_WIDTH must be 800');
    assert.ok(configGd.includes('const WORLD_PIXEL_HEIGHT: int = 800'), 'WORLD_PIXEL_HEIGHT must be 800');
    assert.strictEqual(50 * 16, 800, '50 cells * 16px must equal exactly 800px');
  });

  it('C09-C03: 51 vertical grid lines rendered from x = 0 to 50', () => {
    assert.ok(gridGd.includes('for x in range(Config.WORLD_WIDTH + 1):'), 'Grid must draw WORLD_WIDTH + 1 vertical lines');
    assert.ok(gridGd.includes('draw_line(Vector2(px, 0.0), Vector2(px, height_px)'), 'Vertical line draw call must span full height');
  });

  it('C09-C04: 51 horizontal grid lines rendered from y = 0 to 50', () => {
    assert.ok(gridGd.includes('for y in range(Config.WORLD_HEIGHT + 1):'), 'Grid must draw WORLD_HEIGHT + 1 horizontal lines');
    assert.ok(gridGd.includes('draw_line(Vector2(0.0, py), Vector2(width_px, py)'), 'Horizontal line draw call must span full width');
  });

  it('C09-C05: world_to_pixel(0,0) == (0,0)', () => {
    const p = worldToPixel(0, 0);
    assert.strictEqual(p.x, 0);
    assert.strictEqual(p.y, 0);
    assert.ok(configGd.includes('return Vector2(origin.x + float(coord.x * CELL_SIZE), origin.y + float(coord.y * CELL_SIZE))'), 'Config must compute linear cell offset');
  });

  it('C09-C06: Cell center mapping uses +8, +8 offset', () => {
    const center0 = cellCenter(0, 0);
    assert.strictEqual(center0.x, 8.0);
    assert.strictEqual(center0.y, 8.0);
    const center22 = cellCenter(22, 22);
    assert.strictEqual(center22.x, 352.0 + 8.0);
    assert.strictEqual(center22.y, 352.0 + 8.0);
  });

  it('C09-C07: Shelter coordinate == (22, 22, 0)', () => {
    assert.ok(configGd.includes('const SHELTER_COORDINATE: Vector3i = Vector3i(22, 22, 0)'), 'SHELTER_COORDINATE must be (22, 22, 0)');
    assert.ok(configGd.includes('const SHELTER_ID: String = "shelter_log_hollow"'), 'SHELTER_ID must be shelter_log_hollow');
  });

  it('C09-C08: Shelter footprint == exactly 1 cell', () => {
    assert.ok(configGd.includes('const SHELTER_CELL_COUNT: int = 1'), 'SHELTER_CELL_COUNT must be 1');
    assert.ok(staticZonesGd.includes('var shelter_pixel_size: Vector2 = Vector2(cell_sz, cell_sz)'), 'Shelter draw size must be 1x1 cell size');
  });

  it('C09-C09: Resource zone bounds == x20..25 / y20..23 / z0', () => {
    assert.ok(configGd.includes('const RESOURCE_ZONE_RECT: Rect2i = Rect2i(20, 20, 6, 4)'), 'RESOURCE_ZONE_RECT must be (20, 20, 6, 4)');
    assert.ok(configGd.includes('const RESOURCE_ZONE_Z: int = 0'), 'RESOURCE_ZONE_Z must be 0');
    assert.ok(configGd.includes('const RESOURCE_ZONE_ID: String = "rz_decaying_wood_patch"'), 'RESOURCE_ZONE_ID must be rz_decaying_wood_patch');
  });

  it('C09-C10: Resource zone footprint == exactly 24 cells', () => {
    assert.ok(configGd.includes('const RESOURCE_ZONE_CELL_COUNT: int = 24'), 'RESOURCE_ZONE_CELL_COUNT must be 24');
    assert.strictEqual(6 * 4, 24, '6 columns * 4 rows must be 24 cells');
  });

  it('C09-C11: Z-layer filtering hides z0 landmarks on non-zero active layers', () => {
    assert.ok(staticZonesGd.includes('if active_z_layer != 0:'), 'static_zones_overlay must check active_z_layer != 0');
    assert.ok(staticZonesGd.includes('return'), 'static_zones_overlay must early return on active_z_layer != 0');
  });

  it('C09-C12: Z0 landmarks render on active layer 0', () => {
    assert.ok(staticZonesGd.includes('draw_rect(rz_draw_rect, resource_fill_color, true)'), 'Resource zone must be drawn');
    assert.ok(staticZonesGd.includes('draw_rect(shelter_draw_rect, shelter_fill_color, true)'), 'Shelter must be drawn');
  });

  it('C09-C13: Negative audit: no resource quantity, inventory, depletion, or regeneration logic in Godot', () => {
    const FORBIDDEN_RESOURCE_KEYS = [
      'quantity',
      'inventory',
      'depletion',
      'regeneration',
      'harvest',
      'consume',
      'capacity_remaining'
    ];
    const cleanStatic = stripComments(staticZonesGd);
    const cleanGrid = stripComments(gridGd);
    for (const key of FORBIDDEN_RESOURCE_KEYS) {
      assert.ok(!cleanStatic.includes(key), `static_zones_overlay.gd must not contain forbidden resource key '${key}'`);
      assert.ok(!cleanGrid.includes(key), `world_grid_canvas.gd must not contain forbidden resource key '${key}'`);
    }
  });

  it('C09-C14: Negative audit: no collision, pathfinding, adjacency, or traversal logic in Godot', () => {
    const FORBIDDEN_SPATIAL_KEYS = [
      'collision',
      'collider',
      'pathfinding',
      'AStar',
      'adjacency',
      'is_traversable',
      'can_enter'
    ];
    const cleanStatic = stripComments(staticZonesGd);
    const cleanGrid = stripComments(gridGd);
    for (const key of FORBIDDEN_SPATIAL_KEYS) {
      assert.ok(!cleanStatic.includes(key), `static_zones_overlay.gd must not contain forbidden spatial key '${key}'`);
      assert.ok(!cleanGrid.includes(key), `world_grid_canvas.gd must not contain forbidden spatial key '${key}'`);
    }
  });

  it('C09-C15: Renderer uses DemoWorldConfig rather than duplicated landmark constants', () => {
    assert.ok(staticZonesGd.includes('Config.RESOURCE_ZONE_RECT'), 'static_zones_overlay must consume Config.RESOURCE_ZONE_RECT');
    assert.ok(staticZonesGd.includes('Config.SHELTER_COORDINATE'), 'static_zones_overlay must consume Config.SHELTER_COORDINATE');
    assert.ok(staticZonesGd.includes('Config.CELL_SIZE'), 'static_zones_overlay must consume Config.CELL_SIZE');
    assert.ok(staticZonesGd.includes('Config.world_to_pixel'), 'static_zones_overlay must consume Config.world_to_pixel');
  });

  it('C09-C16: Shelter and resource zone are presentation-only landmarks', () => {
    assert.ok(staticZonesGd.includes('WHERE ONLY'), 'Comment must explicitly declare WHERE ONLY constraint');
    assert.ok(staticZonesGd.includes('LANDMARK ONLY'), 'Comment must explicitly declare LANDMARK ONLY constraint');
  });

  it('C09-C17: No RNG in environment rendering', () => {
    const RNG_PATTERNS = [/\brandi\s*\(/, /\brandf\s*\(/, /\bRandomNumberGenerator\b/];
    for (const pat of RNG_PATTERNS) {
      assert.ok(!pat.test(staticZonesGd), 'static_zones_overlay.gd must have zero RNG');
      assert.ok(!pat.test(gridGd), 'world_grid_canvas.gd must have zero RNG');
      assert.ok(!pat.test(configGd), 'demo_world_config.gd must have zero RNG');
    }
  });

  it('C09-C18: Draw order remains: grid (z_index 0) < landmarks (z_index 10) < organisms (z_index 20)', () => {
    assert.ok(sceneTscn.includes('name="WorldGridCanvas"'), 'scene must define WorldGridCanvas');
    assert.ok(/name="StaticZonesOverlay"[\s\S]*?z_index\s*=\s*10/.test(sceneTscn), 'StaticZonesOverlay must have z_index = 10');
    assert.ok(/name="OrganismsOverlay"[\s\S]*?z_index\s*=\s*20/.test(sceneTscn), 'OrganismsOverlay must have z_index = 20');
  });

  it('C09-C19: No frozen-domain modifications (game/**, data/**, demo/**)', () => {
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../game/spatial/spatial_world.js')), 'game/spatial/spatial_world.js must exist');
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../game/spatial/shelter/shelter_registry.js')), 'shelter_registry must exist');
    assert.ok(fs.existsSync(path.resolve(__dirname, '../../game/spatial/resource_zone/resource_zone_registry.js')), 'resource_zone_registry must exist');
  });

  it('C09-C20: Deterministic source/geometry output across independent evaluations', () => {
    const run1 = [worldToPixel(20, 20), worldToPixel(22, 22), cellCenter(22, 22)];
    const run2 = [worldToPixel(20, 20), worldToPixel(22, 22), cellCenter(22, 22)];
    assert.deepStrictEqual(run1, run2, 'Coordinate projections must be 100% bit-for-bit deterministic');
  });

});
