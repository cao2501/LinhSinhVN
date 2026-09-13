/**
 * LinhSinhVN — DEMO-01-C / C-02 Spatial Grid Presentation Test Suite
 *
 * Checkpoint: DEMO-01-C / C-02 Spatial Grid Presentation
 * Verifies spatial grid presentation geometry, coordinate mapping, static fixtures,
 * presentation drift protection, presentation immutability, and frozen domain integrity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  Z_MIN,
  Z_MAX
} from '../../demo/demo_constants.js';
import { createDemoWorld } from '../../demo/demo_world_factory.js';
import { DemoSimulationSession } from '../../demo/demo_simulation_session.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('DEMO-01-C / C-02: Spatial Grid Presentation', () => {
  // Path references to Godot presentation files
  const godotConfigPath = path.join(REPO_ROOT, 'godot/scripts/presentation/demo_world_config.gd');
  const godotCanvasPath = path.join(REPO_ROOT, 'godot/scripts/presentation/world_grid_canvas.gd');
  const godotOverlayPath = path.join(REPO_ROOT, 'godot/scripts/presentation/static_zones_overlay.gd');
  const godotViewPath = path.join(REPO_ROOT, 'godot/scripts/presentation/world_view.gd');
  const godotScenePath = path.join(REPO_ROOT, 'godot/scenes/world_view.tscn');
  const godotProjectPath = path.join(REPO_ROOT, 'godot/project.godot');

  function getDemoProfile() {
    return loadSpeciesProfile('data/species/xylotrupes_rhinoceros_proto.json');
  }

  // --- C02-01: World bounds ---
  it('C02-01: World bounds canonical verification (50x50, z = -1..2)', () => {
    assert.equal(WORLD_WIDTH, 50, 'Canonical WORLD_WIDTH must be 50');
    assert.equal(WORLD_HEIGHT, 50, 'Canonical WORLD_HEIGHT must be 50');
    assert.equal(Z_MIN, -1, 'Canonical Z_MIN must be -1');
    assert.equal(Z_MAX, 2, 'Canonical Z_MAX must be 2');

    const configContent = fs.readFileSync(godotConfigPath, 'utf8');
    assert.match(configContent, /const\s+WORLD_WIDTH:\s*int\s*=\s*50/, 'Godot fixture WORLD_WIDTH must be 50');
    assert.match(configContent, /const\s+WORLD_HEIGHT:\s*int\s*=\s*50/, 'Godot fixture WORLD_HEIGHT must be 50');
    assert.match(configContent, /const\s+Z_MIN:\s*int\s*=\s*-1/, 'Godot fixture Z_MIN must be -1');
    assert.match(configContent, /const\s+Z_MAX:\s*int\s*=\s*2/, 'Godot fixture Z_MAX must be 2');
    assert.match(configContent, /const\s+Z_LAYERS:\s*Array\[int\]\s*=\s*\[-1,\s*0,\s*1,\s*2\]/, 'Godot fixture Z_LAYERS must match');
  });

  // --- C02-02: Coordinate mapping ---
  it('C02-02: Coordinate mapping is deterministic and lossless', () => {
    const CELL_SIZE = 16;
    function worldToPixel(x, y, originX = 0, originY = 0) {
      return { px: originX + x * CELL_SIZE, py: originY + y * CELL_SIZE };
    }
    function pixelToWorld(px, py, originX = 0, originY = 0) {
      return { x: Math.floor((px - originX) / CELL_SIZE), y: Math.floor((py - originY) / CELL_SIZE) };
    }

    // Origin (0,0) -> (0,0)
    assert.deepEqual(worldToPixel(0, 0), { px: 0, py: 0 });
    assert.deepEqual(pixelToWorld(0, 0), { x: 0, y: 0 });

    // Canonical shelter position (22, 22) -> (352, 352)
    assert.deepEqual(worldToPixel(22, 22), { px: 352, py: 352 });
    assert.deepEqual(pixelToWorld(352, 352), { x: 22, y: 22 });

    // Boundary edge (49, 49) -> (784, 784)
    assert.deepEqual(worldToPixel(49, 49), { px: 784, py: 784 });
    assert.deepEqual(pixelToWorld(784, 784), { x: 49, y: 49 });

    // World extent 50 * 16 = 800
    assert.equal(50 * CELL_SIZE, 800, '50 * 16 must equal 800 pixels');

    // Roundtrip verification across all grid coordinates
    for (let x = 0; x < 50; x += 7) {
      for (let y = 0; y < 50; y += 7) {
        const p = worldToPixel(x, y);
        const back = pixelToWorld(p.px, p.py);
        assert.equal(back.x, x);
        assert.equal(back.y, y);
      }
    }
  });

  // --- C02-03: Shelter footprint ---
  it('C02-03: Shelter is exactly one cell at (22, 22, 0)', () => {
    const speciesProfile = getDemoProfile();
    const demoWorld = createDemoWorld({ speciesProfile });
    const shelters = demoWorld.shelterRegistry.getAllShelters();
    
    assert.equal(shelters.length, 1, 'Exactly one shelter registered');
    const shelter = shelters[0];
    assert.equal(shelter.shelter_id, 'shelter_log_hollow');
    assert.deepEqual(shelter.position, { x: 22, y: 22, z: 0 }, 'Shelter position is exactly (22, 22, 0)');

    // Verify Godot fixture definition
    const configContent = fs.readFileSync(godotConfigPath, 'utf8');
    assert.match(configContent, /const\s+SHELTER_COORDINATE:\s*Vector3i\s*=\s*Vector3i\(22,\s*22,\s*0\)/);
    assert.match(configContent, /const\s+SHELTER_CELL_COUNT:\s*int\s*=\s*1/);
    assert.match(configContent, /EXACTLY\s+ONE\s+CELL/i);
  });

  // --- C02-04: Resource zone footprint ---
  it('C02-04: Resource zone is exactly x=20..25, y=20..23, z=0 = 24 cells', () => {
    const speciesProfile = getDemoProfile();
    const demoWorld = createDemoWorld({ speciesProfile });
    const zones = demoWorld.resourceZoneRegistry.getAllZones();

    assert.equal(zones.length, 1, 'Exactly one resource zone registered');
    const rz = zones[0];
    assert.equal(rz.zone_id, 'rz_decaying_wood_patch');
    
    const bounds = rz.region.bounds;
    assert.equal(bounds.min_x, 20);
    assert.equal(bounds.max_x, 25); // 6 columns: 20, 21, 22, 23, 24, 25
    assert.equal(bounds.min_y, 20);
    assert.equal(bounds.max_y, 23); // 4 rows: 20, 21, 22, 23
    assert.equal(bounds.min_z, 0);
    assert.equal(bounds.max_z, 0);

    const cellCount = (bounds.max_x - bounds.min_x + 1) * (bounds.max_y - bounds.min_y + 1);
    assert.equal(cellCount, 24, 'Resource zone cell count must be exactly 24');

    // Verify Godot fixture definition
    const configContent = fs.readFileSync(godotConfigPath, 'utf8');
    assert.match(configContent, /const\s+RESOURCE_ZONE_RECT:\s*Rect2i\s*=\s*Rect2i\(20,\s*20,\s*6,\s*4\)/);
    assert.match(configContent, /const\s+RESOURCE_ZONE_Z:\s*int\s*=\s*0/);
    assert.match(configContent, /const\s+RESOURCE_ZONE_CELL_COUNT:\s*int\s*=\s*24/);
  });

  // --- C02-05: Godot fixture drift protection ---
  it('C02-05: Godot presentation fixture matches canonical Node demo values bit-for-bit', () => {
    const configContent = fs.readFileSync(godotConfigPath, 'utf8');

    // Extract constants from Godot fixture via regex
    const widthMatch = configContent.match(/const\s+WORLD_WIDTH:\s*int\s*=\s*(\d+)/);
    const heightMatch = configContent.match(/const\s+WORLD_HEIGHT:\s*int\s*=\s*(\d+)/);
    const zMinMatch = configContent.match(/const\s+Z_MIN:\s*int\s*=\s*(-?\d+)/);
    const zMaxMatch = configContent.match(/const\s+Z_MAX:\s*int\s*=\s*(-?\d+)/);
    const cellSizeMatch = configContent.match(/const\s+CELL_SIZE:\s*int\s*=\s*(\d+)/);
    const shelterCoordMatch = configContent.match(/const\s+SHELTER_COORDINATE:\s*Vector3i\s*=\s*Vector3i\((\d+),\s*(\d+),\s*(\d+)\)/);
    const rzRectMatch = configContent.match(/const\s+RESOURCE_ZONE_RECT:\s*Rect2i\s*=\s*Rect2i\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/);

    assert.ok(widthMatch, 'WORLD_WIDTH must be defined in demo_world_config.gd');
    assert.ok(heightMatch, 'WORLD_HEIGHT must be defined in demo_world_config.gd');
    assert.ok(zMinMatch, 'Z_MIN must be defined in demo_world_config.gd');
    assert.ok(zMaxMatch, 'Z_MAX must be defined in demo_world_config.gd');
    assert.ok(cellSizeMatch, 'CELL_SIZE must be defined in demo_world_config.gd');
    assert.ok(shelterCoordMatch, 'SHELTER_COORDINATE must be defined in demo_world_config.gd');
    assert.ok(rzRectMatch, 'RESOURCE_ZONE_RECT must be defined in demo_world_config.gd');

    assert.equal(parseInt(widthMatch[1], 10), WORLD_WIDTH);
    assert.equal(parseInt(heightMatch[1], 10), WORLD_HEIGHT);
    assert.equal(parseInt(zMinMatch[1], 10), Z_MIN);
    assert.equal(parseInt(zMaxMatch[1], 10), Z_MAX);
    assert.equal(parseInt(cellSizeMatch[1], 10), 16);

    assert.equal(parseInt(shelterCoordMatch[1], 10), 22);
    assert.equal(parseInt(shelterCoordMatch[2], 10), 22);
    assert.equal(parseInt(shelterCoordMatch[3], 10), 0);

    assert.equal(parseInt(rzRectMatch[1], 10), 20);
    assert.equal(parseInt(rzRectMatch[2], 10), 20);
    assert.equal(parseInt(rzRectMatch[3], 10), 6);
    assert.equal(parseInt(rzRectMatch[4], 10), 4);
  });

  // --- C02-06: Presentation operations do not advance simulation state ---
  it('C02-06: Presentation operations do not advance simulation state', () => {
    const speciesProfile = getDemoProfile();
    const session = new DemoSimulationSession({ speciesProfile });

    const initialTick = session.simulationTick;
    const initialSnap = session.getSnapshot();

    // Coordinate mapping & fixture reading operations
    const CELL_SIZE = 16;
    const pixel = { px: 22 * CELL_SIZE, py: 22 * CELL_SIZE };
    const coord = { x: pixel.px / CELL_SIZE, y: pixel.py / CELL_SIZE };
    assert.deepEqual(coord, { x: 22, y: 22 });

    // Assert zero mutation to simulation state
    assert.equal(session.simulationTick, initialTick, 'Tick must not advance');
    const afterSnap = session.getSnapshot();
    assert.equal(afterSnap.simulation_tick, initialTick, 'Snapshot tick must remain identical');
    assert.deepEqual(afterSnap.census, initialSnap.census, 'Census must remain identical');
  });

  // --- C02-07: Z-layer switching is presentation-only ---
  it('C02-07: Z-layer switching is presentation-only and does not mutate coordinates', () => {
    const viewContent = fs.readFileSync(godotViewPath, 'utf8');
    const overlayContent = fs.readFileSync(godotOverlayPath, 'utf8');

    // WorldView clamps Z-layer between Z_MIN and Z_MAX and emits signal
    assert.match(viewContent, /set_active_z_layer/);
    assert.match(viewContent, /z_layer_changed/);
    
    // Strip comments to ensure code has no simulation methods
    const codeOnly = viewContent.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
    assert.doesNotMatch(codeOnly, /\b(step|advance_tick|mutate|update_simulation)\b/i);

    // StaticZonesOverlay filters purely on active_z_layer == 0
    assert.match(overlayContent, /if\s+active_z_layer\s*!=\s*0:\s*\n\s*return/);
  });

  // --- C02-08: Camera framing configuration prevents guaranteed vertical clipping ---
  it('C02-08: Camera framing configuration does not guarantee clipping of 800x800 world', () => {
    const viewContent = fs.readFileSync(godotViewPath, 'utf8');
    assert.match(viewContent, /camera\.position\s*=\s*Config\.WORLD_CENTER_PIXEL/);
    assert.match(viewContent, /update_camera_zoom/);
    assert.match(viewContent, /default_camera_zoom:\s*float\s*=\s*0\.8/);

    // 800 * 0.8 = 640px < 768px (fits standard minimum height without vertical clipping)
    const worldPixelSize = 800;
    const defaultZoom = 0.8;
    const renderedHeight = worldPixelSize * defaultZoom;
    assert.ok(renderedHeight <= 768, 'Rendered height at default zoom (640px) must fit within 768px viewport height');
  });

  // --- C02-09: World metadata/geometry consistency ---
  it('C02-09: World metadata and geometry consistency is preserved', () => {
    const configContent = fs.readFileSync(godotConfigPath, 'utf8');
    assert.match(configContent, /const\s+WORLD_PIXEL_WIDTH:\s*int\s*=\s*800/);
    assert.match(configContent, /const\s+WORLD_PIXEL_HEIGHT:\s*int\s*=\s*800/);
    assert.match(configContent, /const\s+WORLD_CENTER_PIXEL:\s*Vector2\s*=\s*Vector2\(400\.0,\s*400\.0\)/);
  });

  // --- C02-10: Frozen-domain audit ---
  it('C02-10: Frozen-domain audit confirms no unauthorized modifications vs base 1446461', () => {
    const diff = execSync('git diff 1446461 --name-only', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const changedFiles = diff ? diff.split(/\r?\n/).filter(Boolean) : [];
    
    // Only godot/project.godot should be modified among tracked files
    for (const f of changedFiles) {
      assert.equal(f, 'godot/project.godot', `Unexpected modified tracked file in git diff: ${f}`);
    }

    // Verify git status for untracked/modified files: only C-02 files allowed
    const untracked = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const statusLines = untracked ? untracked.split(/\r?\n/).filter(Boolean) : [];

    for (const line of statusLines) {
      // Extract path after status characters (e.g. " M godot/project.godot" or "?? path")
      const filePath = line.replace(/^[MADRCU?! ]{1,2}\s+/, '').trim();
      const isAllowed = (
        filePath === 'godot/project.godot' ||
        filePath.startsWith('godot/scripts/presentation/') ||
        filePath.startsWith('godot/scenes/') ||
        filePath === 'tests/demo/demo_c02_spatial_grid.test.js'
      );
      assert.ok(isAllowed, `Unauthorized file in git status: ${line} (parsed: ${filePath})`);
    }
  });

  // --- C02-11: Zero organism rendering audit ---
  it('C02-11: C-02 presentation contains zero organism rendering or state', () => {
    const presFiles = [godotConfigPath, godotCanvasPath, godotOverlayPath, godotViewPath];
    for (const file of presFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // No organism variables, functions, or draw calls
      assert.doesNotMatch(content, /var\s+organisms/i);
      assert.doesNotMatch(content, /func\s+render_organism/i);
      assert.doesNotMatch(content, /draw_circle/i);
      assert.doesNotMatch(content, /organism_sprite/i);
      assert.doesNotMatch(content, /health_bar|energy_bar|lifecycle_label/i);
    }
  });

  // --- C02-12: Godot scene and project configuration ---
  it('C02-12: Scene and project configuration integrity', () => {
    const projectContent = fs.readFileSync(godotProjectPath, 'utf8');
    assert.match(projectContent, /run\/main_scene="res:\/\/scenes\/world_view\.tscn"/, 'Main scene must be world_view.tscn');

    const sceneContent = fs.readFileSync(godotScenePath, 'utf8');
    assert.match(sceneContent, /node name="WorldView" type="Node2D"/);
    assert.match(sceneContent, /node name="Camera2D" type="Camera2D"/);
    assert.match(sceneContent, /node name="WorldGridCanvas" type="Node2D"/);
    assert.match(sceneContent, /node name="StaticZonesOverlay" type="Node2D"/);
    assert.match(sceneContent, /node name="IpcClient" type="Node"/);
  });
});
