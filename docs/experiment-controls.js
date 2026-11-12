import { WORLD } from './world.js';
import { Simulation, ROBOT_DEFAULT_PARAMS, ROBOT_PARAM_LIMITS } from './simulation.js';

export const DEFAULT_SETUP = Object.freeze({ population: 6, seed: 42, memory: true, scenario: 'routine' });
export const SCENARIO_LABELS = { routine: 'Daily routine', afterparty: 'After a gathering' };
const STORAGE = 'homeframe-comparison-setups-v1';
const ROLE_NAMES = { tidy: 'TIDY', care: 'CARE' };
const PARAMETERS = {
  speed: { label: 'Speed (m/s)', short: 'speed', unit: ' m/s', factor: 1, digits: 2 },
  vision: { label: 'Sensor range (m)', short: 'range', unit: ' m', factor: 1, digits: 2 },
  fov: { label: 'View angle (°)', short: 'view', unit: '°', factor: 180 / Math.PI, digits: 2 },
};

const $ = id => document.getElementById(id);
const toInput = (key, value) => Number((value * PARAMETERS[key].factor).toFixed(PARAMETERS[key].digits));
const locationKey = (scenario, seed) => scenario === 'routine' ? scenario : scenario + ':' + seed;
const positionCount = config => Object.keys(config.taskPositions ?? {}).length;
const parameterCount = config => Object.values(config.robotParams ?? {}).reduce((sum, params) => sum + Object.keys(params).length, 0);
const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });

function readSlots() {
  const slots = { a: structuredClone(DEFAULT_SETUP), b: null };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE));
    for (const key of ['a', 'b']) {
      const saved = data?.[key];
      if (saved && Object.hasOwn(SCENARIO_LABELS, saved.scenario) && Number.isInteger(saved.seed) &&
          saved.seed >= 1 && saved.seed <= 999999 && Number.isInteger(saved.population) &&
          saved.population >= 2 && saved.population <= 24 && typeof saved.memory === 'boolean') {
        new Simulation(WORLD, saved);
        slots[key] = saved;
      }
    }
  } catch {
    // The page remains usable when browser storage is unavailable.
  }
  return slots;
}

function differences(a, b) {
  const changes = [];
  if (a.scenario !== b.scenario) changes.push('chore preset');
  if (a.seed !== b.seed) changes.push('seed');
  if (a.population !== b.population) changes.push('robot count');
  if (a.memory !== b.memory) changes.push('spatial memory');
  const aPositions = a.taskPositions ?? {};
  const bPositions = b.taskPositions ?? {};
  const ids = new Set([...Object.keys(aPositions), ...Object.keys(bPositions)]);
  const moved = [...ids].filter(id => aPositions[id]?.x !== bPositions[id]?.x || aPositions[id]?.y !== bPositions[id]?.y);
  if (moved.length) changes.push(moved.length + ' chore position' + (moved.length === 1 ? '' : 's'));
  for (const [role, name] of Object.entries(ROLE_NAMES)) {
    for (const [key, spec] of Object.entries(PARAMETERS)) {
      const av = toInput(key, a.robotParams?.[role]?.[key] ?? ROBOT_DEFAULT_PARAMS[role][key]);
      const bv = toInput(key, b.robotParams?.[role]?.[key] ?? ROBOT_DEFAULT_PARAMS[role][key]);
      if (av !== bv) changes.push(name + ' ' + spec.short + ' ' + av + ' → ' + bv + spec.unit);
    }
  }
  return changes;
}

export class ExperimentControls {
  constructor({ start, showEditor, hideEditor, renderEditor, onSlotsChange, notify }) {
    this.slots = readSlots();
    this.layouts = new Map();
    this.editing = false;
    this.preview = null;
    this.selected = null;
    this.running = false;
    this.handlers = { start, showEditor, hideEditor, renderEditor, onSlotsChange, notify };
    this.makeParameterInputs();
    this.bind();
    this.refreshSummary();
    this.renderSlots();
  }

  makeParameterInputs() {
    for (const [role, name] of Object.entries(ROLE_NAMES)) {
      const fieldset = document.createElement('fieldset');
      const legend = text('legend', name);
      legend.className = role + '-tag';
      fieldset.append(legend);
      for (const [key, spec] of Object.entries(PARAMETERS)) {
        const label = text('label', spec.label);
        const input = document.createElement('input');
        const limits = ROBOT_PARAM_LIMITS[key];
        input.id = role + '-' + key;
        input.type = 'number';
        input.required = true;
        input.step = 'any';
        input.min = String(toInput(key, limits.min));
        input.max = String(toInput(key, limits.max));
        input.value = String(toInput(key, ROBOT_DEFAULT_PARAMS[role][key]));
        label.htmlFor = input.id;
        input.setAttribute('aria-label', name + ' ' + spec.label);
        input.addEventListener('input', () => this.refreshSummary());
        label.append(input);
        fieldset.append(label);
      }
      $('parameter-grid').append(fieldset);
    }
  }

  read({ validate = false } = {}) {
    const setup = {
      scenario: $('scenario').value,
      population: Number($('population').value),
      seed: $('seed').valueAsNumber,
      memory: $('memory').checked,
    };
    if (validate && !$('seed').reportValidity()) return null;
    const taskPositions = this.layouts.get(locationKey(setup.scenario, setup.seed));
    if (taskPositions && Object.keys(taskPositions).length) setup.taskPositions = structuredClone(taskPositions);
    const overrides = {};
    for (const role of Object.keys(ROLE_NAMES)) {
      for (const [key, spec] of Object.entries(PARAMETERS)) {
        const input = $(role + '-' + key);
        if (!input.validity.valid) {
          if (!validate) continue;
          $('parameter-section').open = true;
          input.reportValidity();
          return null;
        }
        const value = input.valueAsNumber;
        if (value !== toInput(key, ROBOT_DEFAULT_PARAMS[role][key])) {
          (overrides[role] ??= {})[key] = value / spec.factor;
        }
      }
    }
    if (Object.keys(overrides).length) setup.robotParams = overrides;
    return setup;
  }

  bind() {
    $('population').addEventListener('input', e => { $('population-value').value = e.target.value; });
    for (const id of ['scenario', 'seed']) {
      $(id).addEventListener('change', () => {
        if (this.editing) this.finishEdit();
        this.refreshSummary();
      });
    }
    $('edit-layout').addEventListener('click', () => this.editing ? this.finishEdit() : this.openEditor());
    $('finish-edit').addEventListener('click', () => this.finishEdit(true));
    $('edit-chore').addEventListener('change', e => this.selectTask(e.target.value));
    $('place-chore').addEventListener('click', () => {
      if (!$('chore-x').reportValidity() || !$('chore-y').reportValidity()) return;
      this.move({ id: this.selected, x: $('chore-x').valueAsNumber, y: $('chore-y').valueAsNumber });
    });
    $('reset-layout').addEventListener('click', () => {
      const setup = this.read();
      this.layouts.delete(locationKey(setup.scenario, setup.seed));
      this.refreshPreview(this.selected);
      this.refreshSummary();
      this.message('Original positions restored.');
    });
    $('reset-parameters').addEventListener('click', () => {
      for (const role of Object.keys(ROLE_NAMES)) {
        for (const key of Object.keys(PARAMETERS)) $(role + '-' + key).value = toInput(key, ROBOT_DEFAULT_PARAMS[role][key]);
      }
      this.refreshSummary();
    });
    $('apply-setup').addEventListener('click', () => {
      const setup = this.read({ validate: true });
      if (!setup) return;
      this.finishEdit();
      this.handlers.start(setup);
    });
    $('save-a').addEventListener('click', () => this.save('a'));
    $('save-b').addEventListener('click', () => this.save('b'));
  }

  refreshSummary() {
    const setup = this.read();
    $('move-count').textContent = positionCount(setup) + ' moved';
    const count = parameterCount(setup);
    $('parameter-count').value = count ? count + ' changed' : 'Defaults';
    $('move-label').textContent = this.editing ? 'Finish placement' : 'Move chores';
  }

  save(key) {
    const setup = this.read({ validate: true });
    if (!setup) return;
    try {
      new Simulation(WORLD, setup);
    } catch (error) {
      this.handlers.notify(error.message);
      return;
    }
    this.slots[key] = setup;
    try { localStorage.setItem(STORAGE, JSON.stringify(this.slots)); } catch {}
    this.handlers.onSlotsChange();
    this.handlers.notify('Saved setup ' + key.toUpperCase() + '. Compare it in Results.');
  }

  load(key) {
    const setup = this.slots[key];
    if (!setup) return;
    $('scenario').value = setup.scenario;
    $('population').value = setup.population;
    $('population-value').value = setup.population;
    $('seed').value = setup.seed;
    $('memory').checked = setup.memory;
    this.layouts.set(locationKey(setup.scenario, setup.seed), structuredClone(setup.taskPositions ?? {}));
    for (const role of Object.keys(ROLE_NAMES)) {
      for (const name of Object.keys(PARAMETERS)) $(role + '-' + name).value = toInput(name, setup.robotParams?.[role]?.[name] ?? ROBOT_DEFAULT_PARAMS[role][name]);
    }
    this.refreshSummary();
    this.handlers.notify('Setup ' + key.toUpperCase() + ' loaded for editing.');
  }

  renderSlots() {
    const { a, b } = this.slots;
    const cards = Object.entries(this.slots).map(([key, setup]) => {
      const slot = document.createElement('article');
      slot.className = 'comparison-slot';
      slot.append(text('strong', 'SETUP ' + key.toUpperCase()));
      if (!setup) {
        slot.append(text('p', 'Save a setup as B to compare it with A.'));
        return slot;
      }
      slot.append(text('p', SCENARIO_LABELS[setup.scenario] + ' · ' + setup.population + ' robots'),
        text('p', positionCount(setup) + ' moved · ' + parameterCount(setup) + ' tuned · memory ' + (setup.memory ? 'on' : 'off')));
      const button = text('button', 'Load in Setup');
      button.className = 'text-button';
      button.type = 'button';
      button.setAttribute('aria-label', 'Load setup ' + key.toUpperCase());
      button.addEventListener('click', () => {
        this.load(key);
        $('tab-setup').click();
      });
      slot.append(button);
      return slot;
    });
    $('comparison-slots').replaceChildren(...cards);
    const changes = b ? differences(a, b) : [];
    $('compare-advice').textContent = !b ? 'Change one setting in Setup to test its effect against A.'
      : !changes.length ? 'A and B are identical. Change a setup to test a difference.'
      : (a.seed === b.seed ? 'Seed ' + a.seed + ' in both. ' : 'Seeds ' + a.seed + ' and ' + b.seed + ' differ. ') +
        'Changes: ' + changes.join(' · ') + '.';
    $('compare-ab').disabled = this.running || !b || !changes.length;
    $('compare').disabled = this.running;
  }

  setComparing(running) {
    this.running = running;
    this.renderSlots();
  }

  openEditor() {
    const setup = this.read({ validate: true });
    if (!setup) return;
    try {
      this.preview = new Simulation(WORLD, setup);
      const original = setup.taskPositions ? new Simulation(WORLD, { ...setup, taskPositions: undefined }) : this.preview;
      this.originalPositions = new Map(original.tasks.map(task => [task.id, { x: task.x, y: task.y }]));
    } catch (error) { this.handlers.notify(error.message); return; }
    this.editing = true;
    $('placement-controls').hidden = false;
    $('editor-transport').hidden = false;
    $('run-transport').hidden = true;
    $('scene-mode').textContent = 'CHORE PLACEMENT';
    this.handlers.showEditor(this.preview);
    this.populateChores();
    this.refreshSummary();
    this.message('Choose a chore on the map or enter a position.');
    const viewport = $('viewport');
    if (viewport.getBoundingClientRect().bottom < 120 || viewport.getBoundingClientRect().top > innerHeight - 120) {
      viewport.scrollIntoView({ block: 'start' });
    }
  }

  finishEdit(returnFocus = false) {
    if (!this.editing) return;
    this.editing = false;
    this.preview = null;
    $('placement-controls').hidden = true;
    $('editor-transport').hidden = true;
    $('run-transport').hidden = false;
    $('scene-mode').textContent = 'SIMULATED FLOOR PLAN';
    this.handlers.hideEditor();
    this.refreshSummary();
    if (returnFocus) $('edit-layout').focus();
  }

  refreshPreview(id) {
    const setup = this.read();
    this.preview = new Simulation(WORLD, setup);
    this.selected = id;
    this.populateChores();
  }

  populateChores() {
    $('edit-chore').replaceChildren(...this.preview.tasks.map(task => new Option(task.name, task.id)));
    this.selectTask(this.preview.tasks.some(task => task.id === this.selected) ? this.selected : this.preview.tasks[0].id);
  }

  selectTask(id) {
    const task = this.preview?.tasks.find(item => item.id === id);
    if (!task) return;
    this.selected = id;
    $('edit-chore').value = id;
    $('chore-x').value = Number(task.x.toFixed(2));
    $('chore-y').value = Number(task.y.toFixed(2));
    this.handlers.renderEditor(this.preview, id);
  }

  message(message, invalid = false) {
    $('placement-message').textContent = message;
    $('placement-message').toggleAttribute('data-invalid', invalid);
    if (this.editing) {
      $('layer-note').textContent = invalid ? message : 'Changes apply to the setup. Use Run this setup to send robots to the new chore locations.';
      $('layer-note').toggleAttribute('data-invalid', invalid);
    }
  }

  validate({ id, x, y }) {
    if (!this.preview) return { valid: false, message: 'Open the layout editor first.' };
    const check = this.preview.validateTaskPosition(id, Number(x.toFixed(2)), Number(y.toFixed(2)));
    return { ...check, message: check.reason };
  }

  move({ id, x, y }) {
    const check = this.validate({ id, x, y });
    if (!check.valid) {
      this.message(check.message || 'Choose open floor.', true);
      return false;
    }
    const setup = this.read();
    const key = locationKey(setup.scenario, setup.seed);
    const positions = { ...this.layouts.get(key), [id]: { x: check.x, y: check.y } };
    const original = this.originalPositions.get(id);
    if (original && Math.hypot(check.x - original.x, check.y - original.y) < .012) delete positions[id];
    let trial;
    try { trial = new Simulation(WORLD, { ...setup, taskPositions: positions }); }
    catch (error) { this.message(error.message, true); return false; }
    this.layouts.set(key, positions);
    this.preview = trial;
    this.selectTask(id);
    this.refreshSummary();
    this.message('Placed ' + trial.tasks.find(task => task.id === id).name.toLowerCase() + '.');
    return true;
  }
}
