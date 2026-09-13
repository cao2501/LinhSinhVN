/**
 * LinhSinhVN — DEMO-01-C / C-09-A Visual Phenotype Presentation Contract Suite
 *
 * Verifies that the presentation tier reflects authoritative genetics phenotypes
 * without mutation, without biological recalculation, without genotype leakage,
 * and with strict adherence to the presentation_snapshot schema.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DemoSimulationSession } from '../../demo/demo_simulation_session.js';
import { buildPresentationSnapshot } from '../../demo/demo_snapshot_builder.js';
import { loadSpeciesProfile } from '../../game/lifecycle/profile_loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../../data/demo/schema/presentation_snapshot.schema.json');
const profilePath = path.resolve(__dirname, '../../data/species/xylotrupes_rhinoceros_proto.json');

const VISUAL_FIELDS = [
  'body_scale_index',
  'cuticle_pigment_ratio',
  'cephalic_horn_scale',
  'thoracic_horn_scale',
  'tarsal_grip_index'
];

const CANONICAL_BOUNDS = {
  body_scale_index: { min: 0.42, max: 1.50 },
  cuticle_pigment_ratio: { min: 0.0, max: 1.0 },
  cephalic_horn_scale: { min: 0.0, max: 2.25 },
  thoracic_horn_scale: { min: 0.0, max: 1.80 },
  tarsal_grip_index: { min: 0.80, max: 2.50 }
};

describe('DEMO-01-C / C-09-A: Visual Phenotype Presentation Contract', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const organismSchema = schema.properties.organisms.items;
  const orgProps = organismSchema.properties;
  const orgRequired = organismSchema.required;
  const profile = loadSpeciesProfile(profilePath);

  it('C09-A01: Schema defines all 5 visual phenotype properties in organisms.items.properties', () => {
    for (const field of VISUAL_FIELDS) {
      assert.ok(orgProps[field], `Field '${field}' must be defined in organism properties`);
      assert.equal(orgProps[field].type, 'number', `Field '${field}' must be typed as number`);
    }
  });

  it('C09-A02: Schema mandates all 5 visual phenotype properties in organisms.items.required', () => {
    for (const field of VISUAL_FIELDS) {
      assert.ok(orgRequired.includes(field), `Field '${field}' must be in required organism list`);
    }
  });

  it('C09-A03: Schema bounds for body_scale_index enforce [0.42, 1.50]', () => {
    const prop = orgProps.body_scale_index;
    assert.equal(prop.minimum, 0.42);
    assert.equal(prop.maximum, 1.50);
  });

  it('C09-A04: Schema bounds for cuticle_pigment_ratio enforce [0.0, 1.0]', () => {
    const prop = orgProps.cuticle_pigment_ratio;
    assert.equal(prop.minimum, 0.0);
    assert.equal(prop.maximum, 1.0);
  });

  it('C09-A05: Schema bounds for cephalic_horn_scale enforce [0.0, 2.25]', () => {
    const prop = orgProps.cephalic_horn_scale;
    assert.equal(prop.minimum, 0.0);
    assert.equal(prop.maximum, 2.25);
  });

  it('C09-A06: Schema bounds for thoracic_horn_scale enforce [0.0, 1.80]', () => {
    const prop = orgProps.thoracic_horn_scale;
    assert.equal(prop.minimum, 0.0);
    assert.equal(prop.maximum, 1.80);
  });

  it('C09-A07: Schema bounds for tarsal_grip_index enforce [0.80, 2.50]', () => {
    const prop = orgProps.tarsal_grip_index;
    assert.equal(prop.minimum, 0.80);
    assert.equal(prop.maximum, 2.50);
  });

  it('C09-A08: Session snapshot validates all organisms against canonical schema bounds', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile, seed: '0x1234567890abcdef' });
    session.step(5);
    const snap = session.getSnapshot();

    assert.ok(snap.organisms.length > 0, 'Must contain organisms');
    for (const org of snap.organisms) {
      for (const [field, bounds] of Object.entries(CANONICAL_BOUNDS)) {
        const val = org[field];
        assert.equal(typeof val, 'number', `${field} on ${org.organism_id} must be a number`);
        assert.ok(Number.isFinite(val), `${field} on ${org.organism_id} must be finite`);
        assert.ok(
          val >= bounds.min && val <= bounds.max,
          `${field} value ${val} on ${org.organism_id} must be within [${bounds.min}, ${bounds.max}]`
        );
      }
    }
  });

  it('C09-A09: Direct 1:1 projection: snapshot strictly matches authoritative genetics.phenotype', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile, seed: '0x1234567890abcdef' });
    const snap = session.getSnapshot();

    for (const orgView of snap.organisms) {
      const liveOrg = session.simWorld.registry.getOrganism(orgView.organism_id);
      assert.ok(liveOrg, `Organism ${orgView.organism_id} must exist in registry`);
      const authoritativePhenotype = liveOrg.genetics.phenotype;

      for (const field of VISUAL_FIELDS) {
        assert.equal(
          orgView[field],
          authoritativePhenotype[field],
          `Field '${field}' on ${orgView.organism_id} must match authoritative phenotype`
        );
      }
    }
  });

  it('C09-A10: Zero recalculation: values match authoritative phenotype to IEEE 754 precision', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile, seed: '0xcafebeef01234567' });
    session.step(10);
    const snap = session.getSnapshot();

    for (const orgView of snap.organisms) {
      const liveOrg = session.simWorld.registry.getOrganism(orgView.organism_id);
      const auth = liveOrg.genetics.phenotype;

      // Exact strict identity check — zero mathematical transformation, rounding, or clamping
      assert.strictEqual(orgView.body_scale_index, auth.body_scale_index);
      assert.strictEqual(orgView.cuticle_pigment_ratio, auth.cuticle_pigment_ratio);
      assert.strictEqual(orgView.cephalic_horn_scale, auth.cephalic_horn_scale);
      assert.strictEqual(orgView.thoracic_horn_scale, auth.thoracic_horn_scale);
      assert.strictEqual(orgView.tarsal_grip_index, auth.tarsal_grip_index);
    }
  });

  it('C09-A11: Upstream female horn masking is preserved without presentation logic branching', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile, seed: '0x1234567890abcdef' });
    const snap = session.getSnapshot();

    const females = snap.organisms.filter(o => o.sex === 'FEMALE');
    const males = snap.organisms.filter(o => o.sex === 'MALE');

    assert.ok(females.length > 0, 'Must have female organisms');
    assert.ok(males.length > 0, 'Must have male organisms');

    for (const female of females) {
      assert.strictEqual(female.cephalic_horn_scale, 0.0, 'Female cephalic horn must be strictly 0.0');
      assert.strictEqual(female.thoracic_horn_scale, 0.0, 'Female thoracic horn must be strictly 0.0');
    }

    // Males should exhibit positive horns reflecting their genotype
    const positiveMaleHorns = males.some(m => m.cephalic_horn_scale > 0.0 && m.thoracic_horn_scale > 0.0);
    assert.ok(positiveMaleHorns, 'At least some males must express non-zero horn scale');
  });

  it('C09-A12: Genotype protection: zero exposure of genome, vExp, derived_stats, or raw alleles', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile });
    const snap = session.getSnapshot();

    const FORBIDDEN_LEAKS = [
      'genome',
      'genotype',
      'vExp',
      'derived_stats',
      'alleles',
      'loci',
      'mutation_history',
      'mutation_rate',
      'LOCUS_BODY_SCALE',
      'LOCUS_CUTICLE_PIGMENT',
      'LOCUS_CEPHALIC_HORN',
      'LOCUS_THORACIC_HORN',
      'LOCUS_TARSAL_CLAW'
    ];

    for (const orgView of snap.organisms) {
      for (const forbidden of FORBIDDEN_LEAKS) {
        assert.strictEqual(
          orgView[forbidden],
          undefined,
          `Presentation organism must NEVER leak internal genetic key '${forbidden}'`
        );
      }
    }
  });

  it('C09-A13: Immutability & non-mutation: builder leaves organism state intact and freezes output', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile });
    const snap = session.getSnapshot();

    assert.ok(Object.isFrozen(snap), 'Snapshot root must be frozen');
    assert.ok(Object.isFrozen(snap.organisms), 'Organisms array must be frozen');

    for (const orgView of snap.organisms) {
      assert.ok(Object.isFrozen(orgView), `Organism view ${orgView.organism_id} must be frozen`);

      // Attempt mutation on read-only projection
      assert.throws(() => {
        orgView.body_scale_index = 999.9;
      }, TypeError, 'Mutating frozen snapshot view model must throw TypeError');
    }
  });

  it('C09-A14: Replay determinism: identical seeds yield bit-for-bit identical visual phenotypes', () => {
    const seed = '0xfeedfacecafe0001';
    const sessionA = new DemoSimulationSession({ speciesProfile: profile, seed });
    const sessionB = new DemoSimulationSession({ speciesProfile: profile, seed });

    sessionA.step(15);
    sessionB.step(15);

    const snapA = sessionA.getSnapshot();
    const snapB = sessionB.getSnapshot();

    assert.equal(snapA.organisms.length, snapB.organisms.length);

    for (let i = 0; i < snapA.organisms.length; i++) {
      const orgA = snapA.organisms[i];
      const orgB = snapB.organisms[i];

      assert.strictEqual(orgA.organism_id, orgB.organism_id);
      for (const field of VISUAL_FIELDS) {
        assert.strictEqual(
          orgA[field],
          orgB[field],
          `Field '${field}' on ${orgA.organism_id} must be bit-for-bit identical across runs`
        );
      }
    }
  });

  it('C09-A15: Fail-fast on missing or corrupted phenotype: zero synthetic fallback biology', () => {
    const session = new DemoSimulationSession({ speciesProfile: profile });
    const simWorld = session.simWorld;
    const spatialWorld = session.spatialWorld;
    const habitatRegistry = session.habitatRegistry;
    const shelterRegistry = session.shelterRegistry;
    const resourceZoneRegistry = session.resourceZoneRegistry;

    const testOrg = simWorld.registry.listOrganisms()[0];
    assert.ok(testOrg, 'Need at least one organism to test');

    // Case 1: Missing phenotype entirely
    const mockOrgMissing = {
      ...testOrg,
      organism_id: 'TEST_CORRUPT_01',
      genetics: {}
    };

    const mockSimWorldMissing = {
      ...simWorld,
      registry: {
        ...simWorld.registry,
        listOrganisms: () => [mockOrgMissing],
        countLiving: () => 1,
        countDead: () => 0,
        totalCount: 1
      },
      getSimulationTick: () => 0
    };

    assert.throws(
      () => {
        buildPresentationSnapshot({
          simWorld: mockSimWorldMissing,
          spatialWorld,
          habitatRegistry,
          shelterRegistry,
          resourceZoneRegistry,
          scenarioSeed: '0x0000000000000001'
        });
      },
      TypeError,
      'Must throw TypeError on missing phenotype without synthesizing fallback biology'
    );

    // Case 2: Corrupted phenotype with NaN or non-finite values
    const mockOrgCorrupted = {
      ...testOrg,
      organism_id: 'TEST_CORRUPT_02',
      genetics: {
        phenotype: {
          ...testOrg.genetics.phenotype,
          body_scale_index: NaN
        }
      }
    };

    const mockSimWorldCorrupt = {
      ...simWorld,
      registry: {
        ...simWorld.registry,
        listOrganisms: () => [mockOrgCorrupted],
        countLiving: () => 1,
        countDead: () => 0,
        totalCount: 1
      },
      getSimulationTick: () => 0
    };

    assert.throws(
      () => {
        buildPresentationSnapshot({
          simWorld: mockSimWorldCorrupt,
          spatialWorld,
          habitatRegistry,
          shelterRegistry,
          resourceZoneRegistry,
          scenarioSeed: '0x0000000000000001'
        });
      },
      TypeError,
      'Must throw TypeError on corrupted NaN phenotype field'
    );
  });
});
