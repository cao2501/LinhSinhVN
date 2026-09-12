/**
 * LinhSinhVN — PopulationRegistry Unit & Architectural Tests
 *
 * Tests TC-POP-01 through TC-POP-07, TC-POP-07B, and TC-POP-ARCH-01.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createPopulationRegistry, PopulationRegistry } from '../../game/population/population_registry.js';

const VALID_CONFIG = {
  population_id: 'pop_test_01',
  species_id: 'xylotrupes_rhinoceros_proto',
  simulation_seed: '0x024aa8a38b63e1b2'
};

function createMockOrganism(id, isAlive = true, speciesId = 'xylotrupes_rhinoceros_proto') {
  return {
    organism_id: id,
    species_id: speciesId,
    is_alive: isAlive,
    status: isAlive ? 'ALIVE' : 'DEAD',
    generation: 1,
    sex: 'MALE',
    nutrition_state: { stored_energy: 100.0, structural_biomass: 0.05 },
    developmental_state: { eta_current: 0.95 },
    stress_state: { acute_stress: 0.0 }
  };
}

describe('PopulationRegistry & Organism Collection (TC-POP-01 -> TC-POP-07B)', () => {
  it('TC-POP-01: Create empty population', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);

    assert.equal(reg.populationId, 'pop_test_01');
    assert.equal(reg.speciesId, 'xylotrupes_rhinoceros_proto');
    assert.equal(reg.simulationSeed, '0x024aa8a38b63e1b2');
    assert.equal(reg.size, 0);
    assert.equal(reg.totalCount, 0);
    assert.equal(reg.countLiving(), 0);
    assert.equal(reg.countDead(), 0);
    assert.deepEqual(reg.listOrganisms(), []);
  });

  it('TC-POP-02: Add one organism', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const org = createMockOrganism('org_alpha', true);

    reg.addOrganism(org);

    assert.equal(reg.size, 1);
    assert.equal(reg.countLiving(), 1);
    assert.equal(reg.countDead(), 0);
    assert.equal(reg.hasOrganism('org_alpha'), true);
    assert.deepEqual(reg.getOrganism('org_alpha'), org);
  });

  it('TC-POP-03: Reject duplicate organism ID', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const org1 = createMockOrganism('org_dup', true);
    const org2 = createMockOrganism('org_dup', false);

    reg.addOrganism(org1);

    assert.throws(
      () => reg.addOrganism(org2),
      /Duplicate organism ID 'org_dup' rejected/
    );
    assert.equal(reg.size, 1);
  });

  it('TC-POP-04: Remove organism', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const org = createMockOrganism('org_removable', true);

    reg.addOrganism(org);
    assert.equal(reg.hasOrganism('org_removable'), true);

    const removed = reg.removeOrganism('org_removable');
    assert.equal(removed, true);
    assert.equal(reg.hasOrganism('org_removable'), false);
    assert.equal(reg.size, 0);
    assert.equal(reg.countLiving(), 0);

    // Removing non-existent returns false
    assert.equal(reg.removeOrganism('org_non_existent'), false);
  });

  it('TC-POP-05: Get organism by ID', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const orgA = createMockOrganism('org_01', true);
    const orgB = createMockOrganism('org_02', false);

    reg.addOrganism(orgA);
    reg.addOrganism(orgB);

    assert.deepEqual(reg.getOrganism('org_01'), orgA);
    assert.deepEqual(reg.getOrganism('org_02'), orgB);
    assert.equal(reg.getOrganism('org_999'), undefined);
  });

  it('TC-POP-06: Canonical organism ordering is ID ascending', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);

    // Insert in shuffled order: Z, A, M, B
    reg.addOrganism(createMockOrganism('org_Z'));
    reg.addOrganism(createMockOrganism('org_A'));
    reg.addOrganism(createMockOrganism('org_M'));
    reg.addOrganism(createMockOrganism('org_B'));

    const list = reg.listOrganisms();
    const idsFromList = list.map(o => o.organism_id);
    assert.deepEqual(idsFromList, ['org_A', 'org_B', 'org_M', 'org_Z']);

    // Check iterator as well
    const idsFromIterator = Array.from(reg).map(o => o.organism_id);
    assert.deepEqual(idsFromIterator, ['org_A', 'org_B', 'org_M', 'org_Z']);
  });

  it('TC-POP-07: Living/dead counts are derived state and match actual records', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);

    reg.addOrganism(createMockOrganism('org_01', true));
    reg.addOrganism(createMockOrganism('org_02', true));
    reg.addOrganism(createMockOrganism('org_03', false));
    reg.addOrganism(createMockOrganism('org_04', true));
    reg.addOrganism(createMockOrganism('org_05', false));

    assert.equal(reg.size, 5);
    assert.equal(reg.totalCount, 5);
    assert.equal(reg.countLiving(), 3);
    assert.equal(reg.countDead(), 2);

    // Snapshot reflects derived counts
    const snap = reg.snapshot();
    assert.equal(snap.living_count, 3);
    assert.equal(snap.dead_count, 2);
    assert.equal(snap.total_count, 5);
  });

  it('TC-POP-07B: Death is not removal (DEATH != REMOVE)', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const org = createMockOrganism('org_dying', true);

    reg.addOrganism(org);
    assert.equal(reg.countLiving(), 1);
    assert.equal(reg.countDead(), 0);

    // Transition organism to dead state
    org.is_alive = false;
    org.status = 'DEAD';
    org.death_record = {
      cause: 'STARVATION',
      death_tick: 42,
      final_biomass: 0.02
    };

    // Deceased organism MUST remain in registry
    assert.equal(reg.hasOrganism('org_dying'), true);
    assert.equal(reg.size, 1);
    assert.equal(reg.countLiving(), 0);
    assert.equal(reg.countDead(), 1);
    assert.equal(reg.getOrganism('org_dying').death_record.cause, 'STARVATION');

    // Only administrative removal actually removes it
    reg.removeOrganism('org_dying');
    assert.equal(reg.hasOrganism('org_dying'), false);
    assert.equal(reg.size, 0);
  });

  it('TC-POP-ARCH-01: PopulationRegistry does not perform biological calculations', () => {
    const reg = createPopulationRegistry(VALID_CONFIG);
    const org = createMockOrganism('org_bio_test', true);

    const initialEnergy = org.nutrition_state.stored_energy;
    const initialBiomass = org.nutrition_state.structural_biomass;
    const initialEta = org.developmental_state.eta_current;
    const initialStress = org.stress_state.acute_stress;

    reg.addOrganism(org);

    // Query, iterate, snapshot multiple times
    reg.getOrganism('org_bio_test');
    reg.listOrganisms();
    Array.from(reg);
    reg.countLiving();
    reg.countDead();
    reg.snapshot();

    // Verify zero mutation occurred on organism biological fields
    assert.equal(org.nutrition_state.stored_energy, initialEnergy);
    assert.equal(org.nutrition_state.structural_biomass, initialBiomass);
    assert.equal(org.developmental_state.eta_current, initialEta);
    assert.equal(org.stress_state.acute_stress, initialStress);

    // Verify no biological methods exist on PopulationRegistry prototype
    const proto = Object.getOwnPropertyNames(PopulationRegistry.prototype);
    const forbiddenMethods = ['tick', 'metabolize', 'feed', 'molt', 'mutate', 'recombine', 'breed', 'reproduce'];
    for (const forbidden of forbiddenMethods) {
      assert.equal(
        proto.includes(forbidden),
        false,
        `PopulationRegistry must not define biological method '${forbidden}'`
      );
    }
  });
});
